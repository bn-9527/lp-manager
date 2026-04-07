import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  useAccount,
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
  useBalance,
  useConfig,
} from 'wagmi'
import { waitForTransactionReceipt as waitForTxReceipt } from 'wagmi/actions'
import { parseUnits, formatUnits, isAddress, type Address, type Hex } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import {
  getChainConfig,
  explorerTx,
  explorerNftPositions,
  erc20Abi,
  permit2Abi,
  isChainSupported,
  ZERO_ADDR,
} from '../config/contracts'
import {
  buildMintMulticallData, getFullRangeTicks,
  priceToTick, tickToPrice, calcAmount1FromAmount0, calcAmount0FromAmount1,
  feeToTickSpacing, getLiquidityForAmounts,
} from '../utils/encoder'
import { HOOK_CONFIGS } from '../config/hooks'
import AddressLink from './AddressLink'

const MAX_SLIPPAGE_PCT = 50

const DEFAULTS: Record<number, { hooks: string; tokenA: string; tokenB: string; fee: string; price: string; amountA: string; slippage: string }> = {
  // BSC — hook 地址从 HOOK_CONFIGS 读取，避免与 hooks.ts 重复定义导致更新遗漏
  56: {
    hooks: HOOK_CONFIGS['uni-v4'].defaultAddresses[56] ?? ZERO_ADDR,
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487',
    fee: '500', price: '600', amountA: '0.05', slippage: '0.1',
  },
  // Ethereum
  1: {
    hooks: '0x0000000000000000000000000000000000000000',
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fee: '500', price: '2000', amountA: '0.01', slippage: '0.1',
  },
  // Base
  8453: {
    hooks: '0x0000000000000000000000000000000000000000',
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fee: '500', price: '2000', amountA: '0.01', slippage: '0.1',
  },
}
const DEFAULT_CHAIN_DEFAULTS = DEFAULTS[56]

function isValidAddr(a: string) { return isAddress(a) }
function isNative(a: string) { return a.toLowerCase() === ZERO_ADDR }
// FIX: 小数位数必须 <= token decimals，否则 viem parseUnits 会因小数位超标抛异常。
// 例如 USDC(dec=6) 的自动计算金额若格式化为 8 位小数，parseUnits("1.12345678", 6) 会崩溃。
// 默认 8 位保留足够有效数字，但被 tokenDecimals 上限截断。
function formatNum(n: number, tokenDecimals = 18) {
  const d = Math.min(8, tokenDecimals)
  return parseFloat(n.toFixed(d)).toString()
}

function useTokenInfo(addr: string, chainId: number | undefined, userAddr: Address | undefined, amountStr: string) {
  const chainConfig = getChainConfig(chainId)
  const valid = isValidAddr(addr) && !isNative(addr)
  const { data: symbol, isLoading: symLoading, isError: symError } = useReadContract({ address: valid ? (addr as Address) : undefined, abi: erc20Abi, functionName: 'symbol', query: { enabled: valid } })
  const { data: decimals, isLoading: decLoading, isError: decError } = useReadContract({ address: valid ? (addr as Address) : undefined, abi: erc20Abi, functionName: 'decimals', query: { enabled: valid } })
  const { data: erc20Bal } = useReadContract({ address: valid ? (addr as Address) : undefined, abi: erc20Abi, functionName: 'balanceOf', args: userAddr ? [userAddr] : undefined, query: { enabled: valid && !!userAddr } })
  const { data: nativeBal } = useBalance({ address: userAddr, query: { enabled: isNative(addr) && !!userAddr } })
  const { data: erc20Allowance } = useReadContract({ address: valid ? (addr as Address) : undefined, abi: erc20Abi, functionName: 'allowance', args: userAddr ? [userAddr, chainConfig.permit2] : undefined, query: { enabled: valid && !!userAddr } })
  const { data: permit2Allowance } = useReadContract({ address: valid ? chainConfig.permit2 : undefined, abi: permit2Abi, functionName: 'allowance', args: userAddr ? [userAddr, addr as Address, chainConfig.positionManager] : undefined, query: { enabled: valid && !!userAddr } })

  if (isNative(addr)) return { symbol: chainConfig.nativeSymbol, decimals: 18 as number | undefined, balance: nativeBal?.value, needsApprove: false as const, loading: false, error: false }

  const loading = symLoading || decLoading
  const error = symError || decError

  // FIX: 原实现只检查 allowance > 0，残留 1 wei 授权会让 UI 误显示"已授权"，
  // 用户跳过 approve 直接提交会被合约 revert 浪费 gas。改为检查 >= 用户输入的实际金额。
  const dec = decimals as number | undefined
  let requiredWei = 1n
  if (dec !== undefined && amountStr) {
    try { const parsed = parseUnits(amountStr, dec); if (parsed > 0n) requiredWei = parsed } catch { /* invalid input, use 1n as minimum threshold */ }
  }
  const erc20Ok = erc20Allowance != null && (erc20Allowance as bigint) >= requiredWei
  const p2Data = permit2Allowance as [bigint, number, number] | undefined
  // FIX: 必须同时检查 expiration 是否已过期，否则授权到期后 UI 仍显示"已授权"，
  // 用户提交交易会被 Permit2 合约 revert 浪费 gas。
  const nowSec = Math.floor(Date.now() / 1000)
  const permit2Ok = p2Data != null && p2Data[0] >= requiredWei && Number(p2Data[1]) > nowSec
  return {
    symbol: symbol as string | undefined,
    decimals: dec, // NO fallback — undefined if RPC fails
    balance: erc20Bal as bigint | undefined,
    needsApprove: !erc20Ok || !permit2Ok,
    loading,
    error,
  }
}

// FIX: 提取到组件外部，避免每次父组件 render 时重新创建导致不必要的卸载/重挂载
function TxStatus({ hash, confirming, confirmed, label, chainId }: { hash: Hex | undefined; confirming: boolean; confirmed: boolean; label: string; chainId: number | undefined }) {
  if (!hash) return null
  return <div className={`status-box ${confirmed ? 'success' : 'pending'}`}>{label}: <a href={explorerTx(chainId, hash)} target="_blank" rel="noreferrer">{hash.slice(0, 10)}...{hash.slice(-8)}</a>{confirming && ' (confirming...)'}{confirmed && ' (confirmed)'}</div>
}

function TokenInput({ label, value, onChange, info, addr, chainId }: { label: string; value: string; onChange: (v: string) => void; info: ReturnType<typeof useTokenInfo>; addr: string; chainId: number | undefined }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="input-with-link">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="0x... (0x000...0 for native)" />
        {isValidAddr(addr) && !isNative(addr) && <AddressLink chainId={chainId} address={addr} label="view" />}
      </div>
      {isValidAddr(addr) && (
        <div className="token-info">
          {info.loading && <span className="hint" style={{ color: '#ffb74d' }}>loading...</span>}
          {info.error && <span className="hint" style={{ color: '#ff5555' }}>failed to load token info</span>}
          {!info.loading && !info.error && (
            <>
              <span className="token-badge">{info.symbol ?? '???'}</span>
              {info.decimals !== undefined && <span className="hint">decimals: {info.decimals}</span>}
              {info.balance !== undefined && info.decimals !== undefined && <span className="hint">balance: {parseFloat(formatUnits(info.balance, info.decimals)).toFixed(4)}</span>}
              {isNative(addr) && <span className="hint">(native)</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

type TxStep = 'erc20Approve' | 'permit2Approve' | 'addLiquidity'

export default function AddLiquidity() {
  const { address, isConnected, chain } = useAccount()
  const wagmiConfig = useConfig()
  const chainId = chain?.id
  const chainConfig = getChainConfig(chainId)
  const chainDefaults = DEFAULTS[chainId ?? 56] ?? DEFAULT_CHAIN_DEFAULTS

  const [hooks, setHooks] = useState(chainDefaults.hooks)
  const [tokenA, setTokenA] = useState(chainDefaults.tokenA)
  const [tokenB, setTokenB] = useState(chainDefaults.tokenB)
  const [fee, setFee] = useState(chainDefaults.fee)
  // FIX: fee=0 是 Uniswap V4 合法值（动态费率池），此时 tickSpacing 由部署者决定，
  // 无法从 fee 推导。改为 state 让用户在 fee=0 时手动输入，与 HookManager 保持一致。
  // 原先硬编码 '1' 会导致 PoolKey 的 tickSpacing 不匹配，modifyLiquidities revert。
  const [tickSpacing, setTickSpacing] = useState('10')
  const feeNum = parseInt(fee)
  const isFeeZero = feeNum === 0
  useEffect(() => {
    if (!isNaN(feeNum) && feeNum > 0) setTickSpacing(String(feeToTickSpacing(feeNum)))
  }, [fee]) // eslint-disable-line react-hooks/exhaustive-deps -- feeNum is derived from fee
  const [price, setPrice] = useState(chainDefaults.price)
  const [amountA, setAmountA] = useState(chainDefaults.amountA)
  const [amountB, setAmountB] = useState('')
  const [slippage, setSlippage] = useState(chainDefaults.slippage)

  // FIX: useState 初始值只在首次挂载时生效，切换链后表单仍保留旧链地址，
  // 用户可能在 Ethereum 上误用 BSC 的 hook/token 地址提交交易。
  useEffect(() => {
    const d = DEFAULTS[chainId ?? 56] ?? DEFAULT_CHAIN_DEFAULTS
    setHooks(d.hooks)
    setTokenA(d.tokenA)
    setTokenB(d.tokenB)
    setFee(d.fee)
    setTickSpacing('10')
    setPrice(d.price)
    setAmountA(d.amountA)
    setAmountB('')
    setSlippage(d.slippage)
    setFullRange(true)
    setMinPrice('')
    setMaxPrice('')
    setError(null)
    setErc20ApproveTxHash(undefined)
    setPermit2ApproveTxHash(undefined)
    setAddLiquidityTxHash(undefined)
    setActiveStep(null)
  }, [chainId])
  const [fullRange, setFullRange] = useState(true)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [activeStep, setActiveStep] = useState<TxStep | null>(null)
  const [erc20ApproveTxHash, setErc20ApproveTxHash] = useState<Hex | undefined>()
  const [permit2ApproveTxHash, setPermit2ApproveTxHash] = useState<Hex | undefined>()
  const [addLiquidityTxHash, setAddLiquidityTxHash] = useState<Hex | undefined>()
  const [error, setError] = useState<string | null>(null)

  const infoA = useTokenInfo(tokenA, chainId, address, amountA)
  const infoB = useTokenInfo(tokenB, chainId, address, amountB)
  const symbolA = infoA.symbol ?? (isNative(tokenA) ? chainConfig.nativeSymbol : '???')
  const symbolB = infoB.symbol ?? (isNative(tokenB) ? chainConfig.nativeSymbol : '???')
  const decA = infoA.decimals
  const decB = infoB.decimals

  // Both tokens must have loaded decimals before any operation
  const tokenInfoReady = (isNative(tokenA) || (decA !== undefined && !infoA.error))
    && (isNative(tokenB) || (decB !== undefined && !infoB.error))
  const tokenInfoLoading = infoA.loading || infoB.loading

  const sorted = useMemo(() => {
    const swapped = tokenA.toLowerCase() > tokenB.toLowerCase()
    return {
      currency0: (swapped ? tokenB : tokenA) as Address,
      currency1: (swapped ? tokenA : tokenB) as Address,
      dec0: swapped ? decB : decA, dec1: swapped ? decA : decB,
      sym0: swapped ? symbolB : symbolA, sym1: swapped ? symbolA : symbolB,
      swapped,
    }
  }, [tokenA, tokenB, decA, decB, symbolA, symbolB])

  const tsNum = parseInt(tickSpacing) || 10

  const decsLoaded = sorted.dec0 !== undefined && sorted.dec1 !== undefined

  // Compute ticks (aligned to tickSpacing)
  const computedTicks = useMemo(() => {
    if (fullRange) return getFullRangeTicks(tsNum)
    if (!decsLoaded) return getFullRangeTicks(tsNum)
    const d0 = sorted.dec0!, d1 = sorted.dec1!
    const pMin = parseFloat(minPrice) || 0
    const pMax = parseFloat(maxPrice) || 0
    if (pMin <= 0 || pMax <= 0) return getFullRangeTicks(tsNum)
    // FIX: swapped 时不再用浮点 1/pMax、1/pMin 做价格倒数（精度丢失），
    // 改为传入原价 + invert 标志，由 priceToSqrtPriceX96 在 BigInt 域内做无损倒数。
    // swapped 时 pMin/pMax 是 tokenA/tokenB 价格，需要 invert 得到 token0/token1 价格。
    // 注意: invert 后 pMin 对应较高的 tick、pMax 对应较低的 tick，因此 tL 用 pMax、tU 用 pMin。
    let tL: number, tU: number
    if (sorted.swapped) {
      tL = priceToTick(pMax, d0, d1, tsNum, true)
      tU = priceToTick(pMin, d0, d1, tsNum, true)
    } else {
      tL = priceToTick(pMin, d0, d1, tsNum)
      tU = priceToTick(pMax, d0, d1, tsNum)
    }
    // FIX: tickLower == tickUpper 会导致 getLiquidityForAmounts 除零抛异常
    if (tL >= tU) return getFullRangeTicks(tsNum)
    return { tickLower: tL, tickUpper: tU }
  }, [fullRange, minPrice, maxPrice, tsNum, sorted, decsLoaded])

  // Snap both prices to tick-aligned values on blur of either field
  const snapPrices = useCallback(() => {
    if (fullRange || !minPrice || !maxPrice || !decsLoaded) return
    const alignedLo = tickToPrice(computedTicks.tickLower, sorted.dec0!, sorted.dec1!)
    const alignedHi = tickToPrice(computedTicks.tickUpper, sorted.dec0!, sorted.dec1!)
    const dispLo = sorted.swapped ? 1 / alignedHi : alignedLo
    const dispHi = sorted.swapped ? 1 / alignedLo : alignedHi
    if (dispLo > 0 && isFinite(dispLo)) setMinPrice(formatNum(dispLo))
    if (dispHi > 0 && isFinite(dispHi)) setMaxPrice(formatNum(dispHi))
  }, [fullRange, minPrice, maxPrice, computedTicks, sorted, decsLoaded])

  // Aligned price display for full range
  const fullRangePrices = useMemo(() => {
    if (!fullRange || !decsLoaded) return null
    const t = getFullRangeTicks(tsNum)
    let lo = tickToPrice(t.tickLower, sorted.dec0!, sorted.dec1!)
    let hi = tickToPrice(t.tickUpper, sorted.dec0!, sorted.dec1!)
    if (sorted.swapped) { [lo, hi] = [1 / hi, 1 / lo] }
    return { low: lo < 0.0001 ? '~0' : lo.toPrecision(4), high: hi > 1e15 ? '~∞' : hi.toPrecision(4) }
  }, [fullRange, tsNum, sorted, decsLoaded])

  // FIX: 原 useEffect 同时依赖和修改 amountA/amountB，浮点截断可能导致值微变触发循环重渲染。
  // 改为在 onChange 事件中直接计算另一侧金额，避免 effect 循环。
  // Full range 和自定义 range 统一使用 calcAmount1FromAmount0，不再用简单乘法近似。
  // 记录用户最后编辑的是 Token A 还是 Token B，用于 blur 时重新计算另一侧金额
  const [lastEdited, setLastEdited] = useState<'A' | 'B'>('A')

  const calcOtherAmount = useCallback((editedSide: 'A' | 'B', editedValue: string) => {
    const p = parseFloat(price)
    if (!(p > 0) || !decsLoaded) return

    // FIX: pass original price + invertPrice flag instead of floating-point `1/price`,
    // so priceToSqrtPriceX96 does the inversion in BigInt domain (lossless).
    // swapped 时 tokenA=currency1, tokenB=currency0
    const { tickLower, tickUpper } = computedTicks
    if (editedSide === 'A') {
      const a = parseFloat(editedValue)
      if (!(a > 0)) return
      if (!sorted.swapped) {
        // tokenA=currency0, 已知 amount0 求 amount1
        // FIX: formatNum 必须传入 tokenB 的 decimals，否则小数位超过 decB 时 parseUnits 崩溃
        setAmountB(formatNum(calcAmount1FromAmount0(a, p, tickLower, tickUpper, sorted.dec0!, sorted.dec1!, sorted.swapped), decB))
      } else {
        // tokenA=currency1, 已知 amount1 求 amount0 → amountB
        setAmountB(formatNum(calcAmount0FromAmount1(a, p, tickLower, tickUpper, sorted.dec0!, sorted.dec1!, sorted.swapped), decB))
      }
    } else {
      const b = parseFloat(editedValue)
      if (!(b > 0)) return
      if (sorted.swapped) {
        // tokenB=currency0, 已知 amount0 求 amount1 → amountA
        setAmountA(formatNum(calcAmount1FromAmount0(b, p, tickLower, tickUpper, sorted.dec0!, sorted.dec1!, sorted.swapped), decA))
      } else {
        // tokenB=currency1, 已知 amount1 求 amount0 → amountA
        setAmountA(formatNum(calcAmount0FromAmount1(b, p, tickLower, tickUpper, sorted.dec0!, sorted.dec1!, sorted.swapped), decA))
      }
    }
  }, [price, computedTicks, sorted, decsLoaded, decA, decB])

  const handleAmountAChange = useCallback((val: string) => {
    setAmountA(val)
    setLastEdited('A')
    calcOtherAmount('A', val)
  }, [calcOtherAmount])

  const handleAmountBChange = useCallback((val: string) => {
    setAmountB(val)
    setLastEdited('B')
    calcOtherAmount('B', val)
  }, [calcOtherAmount])

  // On blur, snap the other amount to be consistent with current values
  const snapAmounts = useCallback(() => {
    calcOtherAmount(lastEdited, lastEdited === 'A' ? amountA : amountB)
  }, [calcOtherAmount, lastEdited, amountA, amountB])

  const tanstackQueryClient = useQueryClient()
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()
  const { sendTransactionAsync, isPending: isSendPending } = useSendTransaction()
  const { isLoading: isErc20Confirming, isSuccess: isErc20Confirmed } = useWaitForTransactionReceipt({ hash: erc20ApproveTxHash })
  const { isLoading: isPermit2Confirming, isSuccess: isPermit2Confirmed } = useWaitForTransactionReceipt({ hash: permit2ApproveTxHash })
  const { isLoading: isAddLiqConfirming, isSuccess: isAddLiqConfirmed } = useWaitForTransactionReceipt({ hash: addLiquidityTxHash })

  // Only show approve for tokens that actually need it (allowance insufficient)
  const tokensNeedingApprove = [
    { addr: tokenA, info: infoA },
    { addr: tokenB, info: infoB },
  ].filter(({ addr, info }) => isValidAddr(addr) && !isNative(addr) && info.needsApprove)
  const tokensToApprove = tokensNeedingApprove.map(t => t.addr)

  async function handleApproveTokens() {
    if (!address) return
    // FIX: 无限授权(MAX_UINT256 → Permit2, UINT160_MAX → PositionManager) 是 Permit2 架构标准模式，
    // 但用户可能不了解此机制。弹窗确认避免用户在不知情下授出无限额度。
    const confirmed = window.confirm(
      'This will grant unlimited token approval to the Permit2 contract, ' +
      'then authorize the PositionManager via Permit2.\n\n' +
      'This is the standard Uniswap V4 approval flow. Continue?'
    )
    if (!confirmed) return
    setError(null); setErc20ApproveTxHash(undefined); setPermit2ApproveTxHash(undefined)
    // FIX: 快照当前 chainId 和 address，循环中每个 await 恢复后检查是否变化，
    // 防止用户在 approve 等待期间切换链/账户导致后续交易发到错误链或错误账户。
    const startChainId = chainId
    const startAddress = address
    try {
      for (const tkn of tokensToApprove) {
        // Step 1: ERC20 approve → Permit2 (MAX_UINT256: Permit2 架构下的标准一次性无限授权)
        setActiveStep('erc20Approve')
        const h1 = await writeContractAsync({ address: tkn as Address, abi: erc20Abi, functionName: 'approve', args: [chainConfig.permit2, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')] })
        setErc20ApproveTxHash(h1)
        // FIX: 必须等待 ERC20 approve 上链确认后再发 Permit2 approve，
        // 否则 Permit2 合约读到的 allowance 仍为 0，导致交易 revert 浪费 gas。
        await waitForTxReceipt(wagmiConfig, { hash: h1 })
        if (chain?.id !== startChainId || address !== startAddress) throw new Error('Chain or account changed during approval — aborted to prevent cross-chain/account mismatch')

        // Step 2: Permit2 approve → PositionManager
        setActiveStep('permit2Approve')
        // uint160 max amount + uint48 max expiration (≈ 890 万年后过期，实际等同永不过期)
        const UINT160_MAX = (1n << 160n) - 1n
        const UINT48_MAX = (1n << 48n) - 1n
        const h2 = await writeContractAsync({ address: chainConfig.permit2, abi: permit2Abi, functionName: 'approve', args: [tkn as Address, chainConfig.positionManager, UINT160_MAX, Number(UINT48_MAX)] })
        setPermit2ApproveTxHash(h2)
        await waitForTxReceipt(wagmiConfig, { hash: h2 })
        if (chain?.id !== startChainId || address !== startAddress) throw new Error('Chain or account changed during approval — aborted to prevent cross-chain/account mismatch')
      }
      setActiveStep(null)
    } catch (err: unknown) { const e = err as { shortMessage?: string; message?: string }; setError(e?.shortMessage || e?.message || 'Approve failed'); setActiveStep(null) }
  }

  async function handleAddLiquidity() {
    if (!address) return
    setError(null); setAddLiquidityTxHash(undefined)
    try {
      setActiveStep('addLiquidity')

      // Input validation
      if (tokenA.toLowerCase() === tokenB.toLowerCase()) throw new Error('Token A and Token B cannot be the same')
      // FIX: hooks 地址未校验，无效地址会导致 PositionManager 合约 revert 浪费 gas
      if (!isAddress(hooks)) throw new Error('Invalid hook address')
      // FIX: 不能用 || 500 做 fallback，因为 Uniswap V4 中 fee=0 是合法值（动态费率池，
      // 由 hook 在 swap 时设置费率）。parseInt("0") 返回 0，0 || 500 会静默替换为 500，
      // 导致 PoolKey 指向错误的池子。改用 Number.isNaN 做严格校验。
      const feeNum = parseInt(fee)
      if (Number.isNaN(feeNum) || feeNum < 0 || feeNum > 1000000) throw new Error('Fee must be between 0 and 1000000 bips')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)
      // FIX: 不能用 || 0.1 做 fallback，与 fee || 500 是同一 anti-pattern：
      // parseFloat("0") 返回 0，0 || 0.1 会静默替换为 0.1%，违背用户设置零滑点的意图。
      // 改用 Number.isNaN 做严格校验，不合法时抛错而非静默替换。
      const slip = parseFloat(slippage)
      if (Number.isNaN(slip)) throw new Error('Invalid slippage value')
      // FIX: slippage 无上限会放大 MEV 三明治攻击面，限制最大值。
      if (slip > MAX_SLIPPAGE_PCT) throw new Error(`Slippage cannot exceed ${MAX_SLIPPAGE_PCT}%`)
      if (slip < 0) throw new Error('Slippage must be positive')

      if (decA === undefined || decB === undefined) throw new Error('Token decimals not loaded')
      const currentPrice = parseFloat(price)
      if (!(currentPrice > 0)) throw new Error('Invalid price')
      if (parseFloat(amountA) <= 0 && parseFloat(amountB) <= 0) throw new Error('Amount must be positive')

      const weiA = parseUnits(amountA || '0', decA)
      const weiB = parseUnits(amountB || '0', decB)
      // FIX: 余额不足时直接发链上交易会 revert 浪费 gas。
      // infoA.balance/infoB.balance 已通过 useBalance/balanceOf 获取，校验成本为零。
      if (weiA > 0n && infoA.balance !== undefined && weiA > infoA.balance) {
        throw new Error(`Insufficient ${symbolA} balance`)
      }
      if (weiB > 0n && infoB.balance !== undefined && weiB > infoB.balance) {
        throw new Error(`Insufficient ${symbolB} balance`)
      }
      const amount0 = sorted.swapped ? weiB : weiA
      const amount1 = sorted.swapped ? weiA : weiB
      // PRECISION FIX: Number(bigint) 在 wei 值超过 2^53（约 9 ETH）时截断精度。
      // 改用纯 BigInt 整数算术：将 slippage 转为基点(bps)，向上取整确保 max >= amount * (1 + slip)。
      // FIX: 使用 Math.ceil 而非 Math.round，防止极小 slippage（如 0.004%）被截断为 0，
      // 导致零滑点容忍在 AMM 中几乎必然 revert。Math.ceil(0.004 * 100) = 1 而非 0。
      const slippageBps = BigInt(Math.ceil(slip * 100)) // 0.1% → 10, 0.5% → 50, 0.004% → 1
      const SLIPPAGE_DENOM = 10000n
      const slippageNumer = SLIPPAGE_DENOM + slippageBps
      const amount0Max = (amount0 * slippageNumer + SLIPPAGE_DENOM - 1n) / SLIPPAGE_DENOM
      const amount1Max = (amount1 * slippageNumer + SLIPPAGE_DENOM - 1n) / SLIPPAGE_DENOM

      // Convert user's desired token amounts to the correct liquidity value
      // using the V3/V4 LiquidityAmounts formula
      // FIX: pass original price + invertPrice flag instead of floating-point `1/currentPrice`,
      // so priceToSqrtPriceX96 does the inversion in BigInt domain (lossless).
      const liquidity = getLiquidityForAmounts(
        amount0, amount1, currentPrice,
        computedTicks.tickLower, computedTicks.tickUpper,
        sorted.dec0!, sorted.dec1!, sorted.swapped,
      )
      if (liquidity <= 0n) throw new Error('Liquidity calculation resulted in 0')

      const { calldata, value } = buildMintMulticallData({
        currency0: sorted.currency0, currency1: sorted.currency1,
        fee: feeNum, tickSpacing: tsNum, hooks: hooks as Address,
        tickLower: computedTicks.tickLower, tickUpper: computedTicks.tickUpper,
        liquidity, amount0Max, amount1Max, recipient: address, deadline,
      })
      const hash = await sendTransactionAsync({ to: chainConfig.positionManager, data: calldata, value })
      setAddLiquidityTxHash(hash)
      setActiveStep(null)
    } catch (err: unknown) { const e = err as { shortMessage?: string; message?: string }; setError(e?.shortMessage || e?.message || 'Add liquidity failed'); setActiveStep(null) }
  }

  // FIX: 交易确认后刷新 token 余额和授权状态，避免 UI 显示过期数据。
  // 仅刷新余额和授权相关查询，避免宽泛的 queryKey 前缀匹配导致所有 readContract 查询
  // 同时失效引发 RPC 请求风暴。
  // WARNING: 以下 predicate 依赖 wagmi v3 内部 queryKey 格式 ['readContract', { functionName }]
  // 和 ['balance', ...]。此格式非公开 API，wagmi 大版本升级时可能变化，届时需重新确认。
  useEffect(() => {
    if (isAddLiqConfirmed || isErc20Confirmed || isPermit2Confirmed) {
      tanstackQueryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as unknown[]
          if (key[0] === 'balance') return true
          if (key[0] !== 'readContract') return false
          const cfg = key[1] as Record<string, unknown> | undefined
          const fn = cfg?.functionName as string | undefined
          return fn === 'balanceOf' || fn === 'allowance'
        },
      })
    }
  }, [isAddLiqConfirmed, isErc20Confirmed, isPermit2Confirmed, tanstackQueryClient])

  if (!isConnected) return <div className="card"><p style={{ textAlign: 'center', color: '#666' }}>Connect your wallet to manage liquidity</p></div>

  return (
    <div className="card">
      <div className="section-title">Add Liquidity</div>

      <div className="form-group">
        <label>Hook Address</label>
        <div className="input-with-link">
          <input value={hooks} onChange={(e) => setHooks(e.target.value)} />
          {hooks && <AddressLink chainId={chainId} address={hooks} label="view" />}
        </div>
      </div>

      <TokenInput label="Token A" value={tokenA} onChange={setTokenA} info={infoA} addr={tokenA} chainId={chainId} />
      <TokenInput label="Token B" value={tokenB} onChange={setTokenB} info={infoB} addr={tokenB} chainId={chainId} />
      <div className="hint" style={{ marginBottom: 12, marginTop: -8 }}>Sorted: token0={sorted.sym0}, token1={sorted.sym1}</div>

      <div className="form-row">
        <div className="form-group">
          <label>Fee (bips)</label>
          <input value={fee} onChange={(e) => setFee(e.target.value)} />
          <div className="hint">{(parseInt(fee) || 0) / 10000}%</div>
        </div>
        <div className="form-group">
          <label>Tick Spacing</label>
          {/* FIX: fee>0 时 tickSpacing 由 feeToTickSpacing 自动计算，手动编辑会导致
              PoolKey 不匹配。fee=0（动态费率池）时解锁让用户手动指定，
              因为动态费率池的 tickSpacing 由部署者决定，无法从 fee=0 推导。 */}
          <input value={tickSpacing}
            readOnly={!isFeeZero}
            onChange={e => { if (isFeeZero) setTickSpacing(e.target.value) }}
            style={{ opacity: isFeeZero ? 1 : 0.7 }}
            placeholder={isFeeZero ? 'Enter tick spacing for dynamic fee pool' : ''} />
        </div>
      </div>

      <hr className="divider" />
      <div className="section-title" style={{ fontSize: 14 }}>Price</div>
      <div className="price-row">
        <span className="price-label">1 {symbolA} =</span>
        <input className="price-input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="600" />
        <span className="price-label">{symbolB}</span>
      </div>

      <div className="section-title" style={{ fontSize: 14, marginTop: 8 }}>Range</div>
      <div className="checkbox-group">
        <input type="checkbox" id="fullRange" checked={fullRange} onChange={(e) => setFullRange(e.target.checked)} />
        <label htmlFor="fullRange">
          Full Range
          {fullRangePrices && <span className="hint" style={{ marginLeft: 6 }}>({fullRangePrices.low} ~ {fullRangePrices.high} {symbolB}/{symbolA})</span>}
        </label>
      </div>
      {!fullRange && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Min Price ({symbolB}/{symbolA})</label>
              <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onBlur={snapPrices} placeholder="e.g. 400" />
            </div>
            <div className="form-group">
              <label>Max Price ({symbolB}/{symbolA})</label>
              <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onBlur={snapPrices} placeholder="e.g. 800" />
            </div>
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            ticks: [{computedTicks.tickLower}, {computedTicks.tickUpper}]
            &nbsp;(prices snap to tick-aligned values on blur)
          </div>
        </>
      )}

      <hr className="divider" />
      <div className="section-title" style={{ fontSize: 14 }}>Deposit</div>
      <div className="form-group">
        <label>{symbolA} Amount {infoA.balance !== undefined && decA !== undefined && <span className="balance-hint">(balance: {parseFloat(formatUnits(infoA.balance, decA)).toFixed(4)})</span>}</label>
        <input value={amountA} onChange={(e) => handleAmountAChange(e.target.value)} onBlur={snapAmounts} placeholder="0.05" />
      </div>
      <div className="form-group">
        <label>{symbolB} Amount {infoB.balance !== undefined && decB !== undefined && <span className="balance-hint">(balance: {parseFloat(formatUnits(infoB.balance, decB)).toFixed(4)})</span>}</label>
        <input value={amountB} onChange={(e) => handleAmountBChange(e.target.value)} onBlur={snapAmounts} placeholder="auto" />
        <div className="hint">edit either amount — the other auto-updates on blur</div>
      </div>

      <div className="form-group">
        <label>Slippage Tolerance</label>
        <div className="slippage-row">
          {['0.1', '0.5', '1.0'].map(v => (
            <button key={v} className={`slippage-btn ${slippage === v ? 'active' : ''}`} onClick={() => setSlippage(v)}>{v}%</button>
          ))}
          <input className="slippage-input" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
          <span className="hint">%</span>
        </div>
      </div>

      <hr className="divider" />

      {!isChainSupported(chainId) && (
        <div className="status-box error" style={{ marginBottom: 10 }}>
          Current chain is not supported. Please switch to BSC, Ethereum, or Base.
        </div>
      )}
      {!tokenInfoReady ? (
        <div className="status-box error" style={{ marginBottom: 10 }}>
          {tokenInfoLoading ? 'Loading token info...' : 'Failed to load token info — check addresses and RPC'}
        </div>
      ) : tokensToApprove.length > 0 ? (
        <button className="btn btn-secondary" onClick={handleApproveTokens} disabled={activeStep === 'erc20Approve' || activeStep === 'permit2Approve' || isWritePending}>
          {activeStep === 'erc20Approve' ? 'Approving ERC20...' : activeStep === 'permit2Approve' ? 'Approving Permit2...' : `Approve ${tokensNeedingApprove.map(t => t.info.symbol ?? '???').join(' + ')}`}
        </button>
      ) : (
        <div className="status-box success" style={{ marginBottom: 10 }}>All tokens approved</div>
      )}
      <TxStatus hash={erc20ApproveTxHash} confirming={isErc20Confirming} confirmed={isErc20Confirmed} label="ERC20 Approve" chainId={chainId} />
      <TxStatus hash={permit2ApproveTxHash} confirming={isPermit2Confirming} confirmed={isPermit2Confirmed} label="Permit2 Approve" chainId={chainId} />

      <button className="btn btn-primary" onClick={handleAddLiquidity} disabled={activeStep === 'addLiquidity' || isSendPending || !tokenInfoReady || !isChainSupported(chainId)}>
        {activeStep === 'addLiquidity' ? 'Sending...' : `Add Liquidity (${amountA} ${symbolA} + ${amountB ? parseFloat(amountB).toFixed(4) : '?'} ${symbolB})`}
      </button>
      <TxStatus hash={addLiquidityTxHash} confirming={isAddLiqConfirming} confirmed={isAddLiqConfirmed} label="Add Liquidity" chainId={chainId} />
      {isAddLiqConfirmed && address && (
        <div className="position-links">
          <a href={chainConfig.positionsUrl} target="_blank" rel="noreferrer" className="position-link-btn">
            View on Uniswap &#x2197;
          </a>
          <a href={explorerNftPositions(chainId, address)} target="_blank" rel="noreferrer" className="position-link-btn">
            View NFT Positions &#x2197;
          </a>
        </div>
      )}
      {error && <div className="status-box error">{error}</div>}
    </div>
  )
}
