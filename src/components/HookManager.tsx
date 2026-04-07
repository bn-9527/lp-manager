import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress, type Address, type Hex } from 'viem'
import { HOOK_CONFIGS, type HookProtocol } from '../config/hooks'
import { explorerTx, erc20Abi, getChainConfig, isChainSupported, ZERO_ADDR } from '../config/contracts'
import AddressLink from './AddressLink'
import { calculateSqrtPriceX96 } from '../utils/sqrtPrice'
import { feeToTickSpacing } from '../utils/encoder'

function CollapsibleSection({ id, label, expanded, onToggle, children }: {
  id: string; label: string; expanded: string | null; onToggle: (id: string) => void; children: React.ReactNode
}) {
  const isOpen = expanded === id
  return (
    <div>
      {/* FIX: 原 <div> 不可键盘操作，添加 role/tabIndex/onKeyDown 使键盘用户可展开/折叠 */}
      <div
        className="collapsible-header"
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id) } }}
      >
        <span className="section-label">{label}</span>
        <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>&#9654;</span>
      </div>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </div>
  )
}

export default function HookManager() {
  const { address, isConnected, chain } = useAccount()
  const chainId = chain?.id

  // Protocol sub-tab
  const [protocol, setProtocol] = useState<HookProtocol>('uni-v4')
  const config = HOOK_CONFIGS[protocol]

  // Hook address — prefilled from config defaults
  const [hookAddress, setHookAddress] = useState('')
  useEffect(() => {
    const addr = (chainId && config.defaultAddresses[chainId]) || ''
    setHookAddress(addr)
    // FIX: 切换 protocol 或链时必须重置所有 pool 参数和操作状态，
    // 否则旧的 token/fee/sqrtPriceX96/txHash 留存，用户可能基于过期数据误操作。
    setToken0('')
    setToken1('')
    setFee('500')
    setTickSpacing('10')
    setInitPrice('600')
    setInitSqrtPriceX96('')
    setInitTimestamp('')
    setInitDatetime('')
    setInitTxHash(undefined)
    setOpTxHash(undefined)
    setTxError(null)
    setNewOwners('')
    setRemoveChecked(new Set())
    setNewStartTimestamp('')
    setNewStartDatetime('')
    setNewPosManager('')
    setNewOwnerAddr('')
    // FIX: Emergency Withdraw 面板状态也必须重置，否则切换链后旧 token 地址残留，
    // 可能导致用户对错误链上的错误 token 发起紧急提现。
    setWithdrawType('safe')
    setWithdrawToken('')
    setWithdrawTokenId('')
  }, [protocol, chainId, config])

  const validHook = isAddress(hookAddress)

  // Auto-read hook info
  // FIX: 必须解构 refetch，否则 setPositionManager/transferOwnership/acceptOwnership
  // 交易确认后 UI 仍显示旧值，用户需手动刷新页面才能看到更新。
  const { data: hookOwner, refetch: refetchOwner } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'owner',
    query: { enabled: validHook },
  })
  const { data: pendingOwner, refetch: refetchPendingOwner } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'pendingOwner',
    query: { enabled: validHook },
  })
  const { data: hookPositionManager, refetch: refetchPositionManager } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'positionManager',
    query: { enabled: validHook },
  })

  const isOwner = !!address && !!hookOwner && (hookOwner as string).toLowerCase() === address.toLowerCase()
  const isPendingOwner = !!address && !!pendingOwner && (pendingOwner as string).toLowerCase() === address.toLowerCase()

  // Pool params — shared across all operation panels
  const [token0, setToken0] = useState('')
  const [token1, setToken1] = useState('')
  const [fee, setFee] = useState('500')
  const [tickSpacing, setTickSpacing] = useState('10')
  // FIX: fee=0 是 Uniswap V4 合法值（动态费率池，由 hook 在 swap 时设置费率）。
  // fee>0 时 tickSpacing 由 feeToTickSpacing 自动计算；fee=0 时用户必须手动指定 tickSpacing，
  // 因为动态费率池的 tickSpacing 由部署者决定，无法从 fee 推导。
  const feeNum = parseInt(fee)
  const isFeeZero = feeNum === 0
  useEffect(() => {
    if (!isNaN(feeNum) && feeNum > 0) setTickSpacing(String(feeToTickSpacing(feeNum)))
  }, [fee])

  // FIX: 必须校验 token0 != token1，相同地址会导致 initializePool 等链上调用 revert 浪费 gas。
  // fee 范围 [0, 1000000]：0 = 动态费率池，1000000 = 100%（Uniswap V4 上限）。
  // 与 AddLiquidity.tsx 保持一致的校验标准。
  const poolParamsValid = isAddress(token0) && isAddress(token1)
    && token0.toLowerCase() !== token1.toLowerCase()
    && !isNaN(feeNum) && feeNum >= 0 && feeNum <= 1000000
    && parseInt(tickSpacing) > 0

  // Read token symbols and decimals for display
  const isNative0 = token0.toLowerCase() === ZERO_ADDR
  const isNative1 = token1.toLowerCase() === ZERO_ADDR
  const validT0 = isAddress(token0) && !isNative0
  const validT1 = isAddress(token1) && !isNative1
  const chainConfig = getChainConfig(chainId)
  const { data: sym0Raw } = useReadContract({ address: validT0 ? (token0 as Address) : undefined, abi: erc20Abi, functionName: 'symbol', query: { enabled: validT0 } })
  const { data: sym1Raw } = useReadContract({ address: validT1 ? (token1 as Address) : undefined, abi: erc20Abi, functionName: 'symbol', query: { enabled: validT1 } })
  const { data: dec0Raw } = useReadContract({ address: validT0 ? (token0 as Address) : undefined, abi: erc20Abi, functionName: 'decimals', query: { enabled: validT0 } })
  const { data: dec1Raw } = useReadContract({ address: validT1 ? (token1 as Address) : undefined, abi: erc20Abi, functionName: 'decimals', query: { enabled: validT1 } })
  const symbol0 = isNative0 ? chainConfig.nativeSymbol : (sym0Raw as string | undefined) ?? '???'
  const symbol1 = isNative1 ? chainConfig.nativeSymbol : (sym1Raw as string | undefined) ?? '???'
  // FIX: 不能对 decimals 设默认值 18，否则 USDC (6位) 等非18精度代币在 RPC 未返回时
  // 会用错误的 decimals 计算 sqrtPriceX96，导致 initializePool 设置完全错误的初始价格。
  const decimals0 = isNative0 ? 18 : (dec0Raw as number | undefined)
  const decimals1 = isNative1 ? 18 : (dec1Raw as number | undefined)

  // Sorted tokens for display (lower address = currency0)
  const sorted = token0 && token1 && token0.toLowerCase() < token1.toLowerCase()
  const sortedSym0 = sorted ? symbol0 : symbol1
  const sortedSym1 = sorted ? symbol1 : symbol0
  const sortedDec0 = sorted ? decimals0 : decimals1
  const sortedDec1 = sorted ? decimals1 : decimals0
  const decimalsReady = (isNative0 || decimals0 !== undefined) && (isNative1 || decimals1 !== undefined)

  // Read poolId from contract
  const { data: poolId, refetch: refetchPoolId } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'getPoolId',
    // FIX: getPoolId 必须传入排序后的 token 地址（低地址在前），与 initializePool 保持一致，
    // 否则查到错误的 poolId，后续所有 pool 状态查询和操作都指向错误的池子
    args: poolParamsValid ? [
      (token0.toLowerCase() < token1.toLowerCase() ? token0 : token1) as Address,
      (token0.toLowerCase() < token1.toLowerCase() ? token1 : token0) as Address,
      parseInt(fee), parseInt(tickSpacing),
    ] : undefined,
    query: { enabled: validHook && poolParamsValid },
  })

  // Read pool status (only when poolId is available)
  const poolIdHex = poolId as Hex | undefined
  const hasPoolId = !!poolIdHex

  const { data: isPoolEnabled, refetch: refetchEnabled } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'isPoolEnabled',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: isPoolStarted, refetch: refetchStarted } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'isPoolStarted',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: poolTimestamp, refetch: refetchTimestamp } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'poolStartedTimestamp',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: poolOwners, refetch: refetchOwners } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'getPoolOwners',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })

  const refetchPoolStatus = useCallback(() => {
    refetchPoolId()
    refetchEnabled()
    refetchStarted()
    refetchTimestamp()
    refetchOwners()
    // FIX: 原先遗漏了 hook 级别的三个读取状态，导致 setPositionManager/transferOwnership/
    // acceptOwnership 交易确认后 UI 显示过期数据，用户需手动刷新页面。
    refetchOwner()
    refetchPendingOwner()
    refetchPositionManager()
  }, [refetchPoolId, refetchEnabled, refetchStarted, refetchTimestamp, refetchOwners,
    refetchOwner, refetchPendingOwner, refetchPositionManager])

  // Transaction state
  // FIX: 拆分为 initTxHash（initializePool 专用）和 opTxHash（其余操作共用），
  // 避免连续执行两个操作时后一个 hash 覆盖前一个导致确认状态丢失。
  const [initTxHash, setInitTxHash] = useState<Hex | undefined>()
  const [opTxHash, setOpTxHash] = useState<Hex | undefined>()
  const [txError, setTxError] = useState<string | null>(null)
  // FIX: 防止写操作期间按钮可重复点击，导致发送多笔相同交易浪费 gas
  const [isBusy, setIsBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const { isLoading: isInitConfirming, isSuccess: isInitConfirmed } = useWaitForTransactionReceipt({ hash: initTxHash })
  const { isLoading: isOpConfirming, isSuccess: isOpConfirmed } = useWaitForTransactionReceipt({ hash: opTxHash })

  // Collapsible sections
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggleSection = (s: string) => setExpanded(prev => prev === s ? null : s)

  // --- Initialize Pool ---
  const [initPrice, setInitPrice] = useState('600')
  const [initSqrtPriceX96, setInitSqrtPriceX96] = useState('')
  const [initTimestamp, setInitTimestamp] = useState('')
  const [initDatetime, setInitDatetime] = useState('')

  // Auto-compute sqrtPriceX96 from price (user can override)
  // Price is entered as "1 sortedSym0 = X sortedSym1" (sorted currency1 per sorted currency0)
  const recomputeSqrtPrice = useCallback((priceStr: string) => {
    const p = parseFloat(priceStr)
    if (p > 0 && isAddress(token0) && isAddress(token1) && sortedDec0 !== undefined && sortedDec1 !== undefined) {
      const t0 = token0.toLowerCase() < token1.toLowerCase() ? token0 : token1
      const t1 = t0 === token0 ? token1 : token0
      const calcResult = calculateSqrtPriceX96(t0, t1, sortedDec0, sortedDec1, sortedSym0, sortedSym1, priceStr)
      if (calcResult && calcResult.sqrtPriceX96 > 0n) {
        setInitSqrtPriceX96(calcResult.sqrtPriceX96.toString())
      }
    }
  }, [token0, token1, sortedDec0, sortedDec1, sortedSym0, sortedSym1])

  const handleInitPriceChange = (val: string) => {
    setInitPrice(val)
    recomputeSqrtPrice(val)
  }

  // FIX: token 地址或 decimals 变化时必须重算 sqrtPriceX96，否则 token 排序翻转后
  // sqrtPriceX96 仍为旧值，initializePool 会以完全错误的价格初始化池子，造成资金损失。
  useEffect(() => {
    if (initPrice) recomputeSqrtPrice(initPrice)
  }, [recomputeSqrtPrice, initPrice])

  const handleInitDatetimeChange = (val: string) => {
    setInitDatetime(val)
    if (val) {
      const ts = Math.floor(new Date(val + 'Z').getTime() / 1000)
      if (!isNaN(ts)) setInitTimestamp(String(ts))
    }
  }
  // FIX: 使用 config.needsPoolManager 配置驱动，而非硬编码 protocol === 'pcs-cl'，
  // 新增 protocol 时不需要手动维护多处条件判断。
  const { data: clPoolManager } = useReadContract({
    address: validHook && config.needsPoolManager ? (hookAddress as Address) : undefined,
    abi: config.abi,
    functionName: 'poolManager',
    query: { enabled: validHook && config.needsPoolManager },
  })

  const { data: clPoolKeyParameters } = useReadContract({
    address: validHook && config.needsPoolManager ? (hookAddress as Address) : undefined,
    abi: config.abi,
    functionName: 'getPoolKeyParameters',
    args: parseInt(tickSpacing) > 0 ? [parseInt(tickSpacing)] : undefined,
    query: { enabled: validHook && config.needsPoolManager && parseInt(tickSpacing) > 0 },
  })

  async function handleInitializePool() {
    // FIX: 必须校验链支持性，否则用户在不支持的链上手动填入 hook 地址后可发送交易，
    // config.defaultAddresses[chainId] 为空只阻止了默认地址，不阻止手动输入场景。
    if (!validHook || !poolParamsValid || isBusy || !isChainSupported(chainId)) return
    // FIX: initializePool 是不可逆链上操作，一旦执行池子以指定 sqrtPriceX96 创建无法撤销，
    // 参数错误会导致套利损失。必须与 removeOwners/emergencyWithdraw/transferOwnership 一样弹窗确认。
    const t0Preview = token0.toLowerCase() < token1.toLowerCase() ? token0 : token1
    const t1Preview = t0Preview === token0 ? token1 : token0
    if (!window.confirm(
      `Initialize pool? This is irreversible.\n\n` +
      `Currency0: ${t0Preview}\nCurrency1: ${t1Preview}\n` +
      `Fee: ${fee}\nsqrtPriceX96: ${initSqrtPriceX96}\nStart Time: ${initTimestamp}`
    )) return
    setInitTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      const ts = BigInt(initTimestamp)
      if (ts <= 0n) throw new Error('Invalid timestamp')
      if (!initSqrtPriceX96) throw new Error('sqrtPriceX96 is required')
      const sqrtPriceX96 = BigInt(initSqrtPriceX96)
      if (sqrtPriceX96 <= 0n) throw new Error('Invalid sqrtPriceX96')
      const t0 = token0.toLowerCase() < token1.toLowerCase() ? token0 : token1
      const t1 = t0 === token0 ? token1 : token0

      if (config.needsPoolManager) {
        if (!clPoolManager || !clPoolKeyParameters) throw new Error('CL poolManager or parameters not loaded')
        const hash = await writeContractAsync({
          address: hookAddress as Address,
          abi: config.abi,
          functionName: 'initializePool',
          args: [
            {
              currency0: t0 as Address,
              currency1: t1 as Address,
              hooks: hookAddress as Address,
              poolManager: clPoolManager as Address,
              fee: parseInt(fee),
              parameters: clPoolKeyParameters as Hex,
            },
            ts,
            sqrtPriceX96,
          ],
        })
        setInitTxHash(hash)
      } else {
        const hash = await writeContractAsync({
          address: hookAddress as Address,
          abi: config.abi,
          functionName: 'initializePool',
          args: [
            {
              currency0: t0 as Address,
              currency1: t1 as Address,
              fee: parseInt(fee),
              tickSpacing: parseInt(tickSpacing),
              hooks: hookAddress as Address,
            },
            ts,
            sqrtPriceX96,
          ],
        })
        setInitTxHash(hash)
      }
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Initialize failed')
    } finally {
      setIsBusy(false)
    }
  }

  // --- Whitelist Management ---
  const [newOwners, setNewOwners] = useState('')
  const [removeChecked, setRemoveChecked] = useState<Set<string>>(new Set())

  async function handleAddOwners() {
    if (!validHook || !poolIdHex || isBusy || !isChainSupported(chainId)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      const addrs = newOwners.split(/[,\n\s]+/).map(s => s.trim()).filter(s => isAddress(s))
      if (addrs.length === 0) throw new Error('No valid addresses')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'addPoolOwners',
        args: [poolIdHex, addrs as Address[]],
      })
      setOpTxHash(hash)
      setNewOwners('')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Add owners failed')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRemoveOwners() {
    if (!validHook || !poolIdHex || removeChecked.size === 0 || isBusy || !isChainSupported(chainId)) return
    // FIX: 批量移除 owner 是高危操作，添加确认弹窗防止误操作
    if (!window.confirm(`Remove ${removeChecked.size} pool owner(s)? They can be re-added later by the hook owner.`)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'removePoolOwners',
        args: [poolIdHex, Array.from(removeChecked) as Address[]],
      })
      setOpTxHash(hash)
      setRemoveChecked(new Set())
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Remove owners failed')
    } finally {
      setIsBusy(false)
    }
  }

  // --- Set Pool Start Time ---
  const [newStartTimestamp, setNewStartTimestamp] = useState('')
  const [newStartDatetime, setNewStartDatetime] = useState('')

  const handleStartDatetimeChange = (val: string) => {
    setNewStartDatetime(val)
    if (val) {
      const ts = Math.floor(new Date(val + 'Z').getTime() / 1000)
      if (!isNaN(ts)) setNewStartTimestamp(String(ts))
    }
  }

  async function handleSetStartTime() {
    if (!validHook || !poolIdHex || isBusy || !isChainSupported(chainId)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      const ts = BigInt(newStartTimestamp)
      if (ts <= 0n) throw new Error('Invalid timestamp')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'setPoolStartTime',
        args: [poolIdHex, ts],
      })
      setOpTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Set start time failed')
    } finally {
      setIsBusy(false)
    }
  }

  // --- Set Position Manager ---
  const [newPosManager, setNewPosManager] = useState('')

  async function handleSetPositionManager() {
    if (!validHook || isBusy || !isChainSupported(chainId)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      if (!isAddress(newPosManager)) throw new Error('Invalid address')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'setPositionManager',
        args: [newPosManager as Address],
      })
      setOpTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Set position manager failed')
    } finally {
      setIsBusy(false)
    }
  }

  // --- Emergency Withdraw ---
  const [withdrawType, setWithdrawType] = useState<'safe' | 'unsafe' | 'erc721'>('safe')
  const [withdrawToken, setWithdrawToken] = useState('')
  const [withdrawTokenId, setWithdrawTokenId] = useState('')

  async function handleEmergencyWithdraw() {
    if (!validHook || isBusy || !isChainSupported(chainId)) return
    // FIX: 紧急提现是高危操作，添加确认弹窗防止误操作
    const typeLabel = withdrawType === 'safe' ? 'ETH/ERC20 (Safe)' : withdrawType === 'unsafe' ? 'ERC20 (Unsafe)' : 'ERC721'
    if (!window.confirm(`Emergency withdraw ${typeLabel} from hook contract?\nToken: ${withdrawToken}`)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      if (!isAddress(withdrawToken)) throw new Error('Invalid token address')
      let hash: Hex
      if (withdrawType === 'safe') {
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdraw', args: [withdrawToken as Address],
        })
      } else if (withdrawType === 'unsafe') {
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdrawERC20Unsafe', args: [withdrawToken as Address],
        })
      } else {
        if (!withdrawTokenId) throw new Error('Token ID required')
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdrawERC721', args: [withdrawToken as Address, BigInt(withdrawTokenId)],
        })
      }
      setOpTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Emergency withdraw failed')
    } finally {
      setIsBusy(false)
    }
  }

  // --- Ownership Transfer ---
  const [newOwnerAddr, setNewOwnerAddr] = useState('')

  async function handleTransferOwnership() {
    if (!validHook || isBusy || !isChainSupported(chainId)) return
    // FIX: 所有权转移是不可逆操作，添加确认弹窗防止误操作
    if (!window.confirm(`Transfer hook ownership to ${newOwnerAddr}?\nThis initiates a two-step transfer.`)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      if (!isAddress(newOwnerAddr)) throw new Error('Invalid address')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi,
        functionName: 'transferOwnership', args: [newOwnerAddr as Address],
      })
      setOpTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Transfer ownership failed')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleAcceptOwnership() {
    if (!validHook || isBusy || !isChainSupported(chainId)) return
    setOpTxHash(undefined)
    setTxError(null)
    setIsBusy(true)
    try {
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi,
        functionName: 'acceptOwnership', args: [],
      })
      setOpTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Accept ownership failed')
    } finally {
      setIsBusy(false)
    }
  }

  // Auto-refresh pool status after tx confirmation
  useEffect(() => {
    if (isInitConfirmed || isOpConfirmed) refetchPoolStatus()
  }, [isInitConfirmed, isOpConfirmed, refetchPoolStatus])

  if (!isConnected) {
    return <div className="card"><p style={{ textAlign: 'center', color: '#666' }}>Connect your wallet to manage hooks</p></div>
  }

  const ownersList = (poolOwners as string[] | undefined) ?? []
  const timestampNum = poolTimestamp ? Number(poolTimestamp) : 0
  const timestampDisplay = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Not set'

  return (
    <div className="card">
      <div className="section-title">Hook Manager</div>

      {/* Protocol sub-tabs */}
      <div className="hook-sub-tabs">
        {(Object.keys(HOOK_CONFIGS) as HookProtocol[]).map(p => (
          <button key={p} className={protocol === p ? 'active' : ''} onClick={() => setProtocol(p)}>
            {HOOK_CONFIGS[p].label}
          </button>
        ))}
      </div>

      {/* Hook address */}
      <div className="form-group">
        <label>Hook Address</label>
        <div className="input-with-link">
          <input value={hookAddress} onChange={e => setHookAddress(e.target.value)} placeholder="0x..." />
          {validHook && <AddressLink chainId={chainId} address={hookAddress} label="view" />}
        </div>
      </div>

      {/* Hook info */}
      {validHook && (
        <>
          <div className="hook-info-row">
            <span className="info-label">Owner:</span>
            <span className="info-value">{hookOwner ? (hookOwner as string) : '...'}</span>
            {isOwner && <span className="token-badge" style={{ background: '#50fa7b' }}>YOU</span>}
          </div>
          <div className="hook-info-row">
            <span className="info-label">Position Manager:</span>
            <span className="info-value">{hookPositionManager ? (hookPositionManager as string) : '...'}</span>
          </div>
          {pendingOwner && (pendingOwner as string) !== '0x0000000000000000000000000000000000000000' && (
            <div className="hook-info-row">
              <span className="info-label">Pending Owner:</span>
              <span className="info-value" style={{ color: '#ffb74d' }}>{pendingOwner as string}</span>
              {isPendingOwner && <span className="token-badge" style={{ background: '#ffb74d', color: '#000' }}>YOU</span>}
            </div>
          )}
        </>
      )}

      <hr className="divider" />

      {/* Pool params — shared by all panels */}
      <div className="section-title" style={{ fontSize: 14 }}>Pool Parameters</div>
      <div className="form-group">
        <label>Token A</label>
        <input value={token0} onChange={e => setToken0(e.target.value)} placeholder="0x..." />
      </div>
      <div className="form-group">
        <label>Token B</label>
        <input value={token1} onChange={e => setToken1(e.target.value)} placeholder="0x..." />
      </div>
      {isAddress(token0) && isAddress(token1) && (
        <div className="hint" style={{ marginBottom: 12, marginTop: -8 }}>
          Sorted: currency0={sortedSym0}, currency1={sortedSym1}
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label>Fee (bips)</label>
          <input value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Tick Spacing</label>
          {/* FIX: fee>0 时 tickSpacing 由 feeToTickSpacing 自动计算，手动编辑会导致
              getPoolId 查到错误的 poolId。fee=0（动态费率池）时解锁让用户手动指定，
              因为动态费率池的 tickSpacing 由部署者决定，无法从 fee=0 推导。 */}
          <input value={tickSpacing}
            readOnly={!isFeeZero}
            onChange={e => { if (isFeeZero) setTickSpacing(e.target.value) }}
            style={{ opacity: isFeeZero ? 1 : 0.7 }}
            placeholder={isFeeZero ? 'Enter tick spacing for dynamic fee pool' : ''} />
        </div>
      </div>
      {poolIdHex && (
        <div className="hook-info-row" style={{ marginBottom: 12 }}>
          <span className="info-label">Pool ID:</span>
          <span className="info-value" style={{ fontSize: 11 }}>{poolIdHex}</span>
        </div>
      )}

      {!isChainSupported(chainId) && (
        <div className="status-box error" style={{ marginBottom: 10 }}>
          Current chain is not supported. Please switch to BSC, Ethereum, or Base.
        </div>
      )}

      <hr className="divider" />

      {/* 1. Initialize Pool */}
      <CollapsibleSection id="init" label="Initialize Pool" expanded={expanded} onToggle={toggleSection}>
        <div className="price-row">
          <span className="price-label">1 {sortedSym0} =</span>
          <input className="price-input" value={initPrice} onChange={e => handleInitPriceChange(e.target.value)} placeholder="600" />
          <span className="price-label">{sortedSym1}</span>
        </div>
        <div className="form-group">
          <label>sqrtPriceX96</label>
          <input value={initSqrtPriceX96} readOnly style={{ fontSize: 12, opacity: 0.7 }} />
        </div>
        <div className="form-group">
          <label>Start Time (UTC)</label>
          <input type="datetime-local" value={initDatetime} onChange={e => handleInitDatetimeChange(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Unix Timestamp</label>
          <input value={initTimestamp} readOnly style={{ opacity: 0.7 }} />
        </div>
        {!decimalsReady && isAddress(token0) && isAddress(token1) && (
          <div className="hint" style={{ color: '#ffb74d', marginBottom: 8 }}>Loading token decimals...</div>
        )}
        <button
          className="btn btn-primary"
          disabled={!isOwner || !poolParamsValid || !initTimestamp || !decimalsReady || isBusy || !isChainSupported(chainId)}
          onClick={handleInitializePool}
        >
          {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : !decimalsReady ? 'Waiting for token info...' : 'Initialize Pool'}
        </button>
      </CollapsibleSection>

      {/* 2. Pool Status */}
      <CollapsibleSection id="status" label="Pool Status" expanded={expanded} onToggle={toggleSection}>
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above to query status</div>
        ) : (
          <>
            <div className="pool-status-grid">
              <div className="pool-status-item">
                <div className="ps-label">Enabled</div>
                <div className={`ps-value ${isPoolEnabled ? '' : 'false'}`}>
                  {isPoolEnabled === undefined ? '...' : String(isPoolEnabled)}
                </div>
              </div>
              <div className="pool-status-item">
                <div className="ps-label">Started</div>
                <div className={`ps-value ${isPoolStarted ? '' : 'false'}`}>
                  {isPoolStarted === undefined ? '...' : String(isPoolStarted)}
                </div>
              </div>
              <div className="pool-status-item" style={{ gridColumn: '1 / -1' }}>
                <div className="ps-label">Start Timestamp</div>
                <div className="ps-value">{timestampDisplay}{timestampNum > 0 && ` (${timestampNum})`}</div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="ps-label" style={{ marginBottom: 4, color: '#888', fontSize: 11 }}>
                Pool Owners ({ownersList.length})
              </div>
              {ownersList.length === 0 && <div className="hint">No pool owners</div>}
              {ownersList.map((addr) => (
                <div key={addr} className="whitelist-item">
                  <AddressLink chainId={chainId} address={addr} />
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={refetchPoolStatus} style={{ marginTop: 8 }}>Refresh</button>
          </>
        )}
      </CollapsibleSection>

      {/* 3. Whitelist Management */}
      <CollapsibleSection id="whitelist" label="Whitelist Management" expanded={expanded} onToggle={toggleSection}>
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above first</div>
        ) : (
          <>
            <div className="form-group">
              <label>Add Addresses (one per line or comma-separated)</label>
              <textarea
                value={newOwners}
                onChange={e => setNewOwners(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', background: '#0f1a30', border: '1px solid #333',
                  borderRadius: '8px', color: '#e0e0e0', fontSize: '13px', fontFamily: 'monospace',
                  resize: 'vertical', outline: 'none',
                }}
                placeholder="0x..."
              />
            </div>
            <button className="btn btn-primary" disabled={!isOwner || !newOwners.trim() || isBusy || !isChainSupported(chainId)} onClick={handleAddOwners}>
              {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : 'Add Pool Owners'}
            </button>

            {ownersList.length > 0 && (
              <>
                <div className="ps-label" style={{ marginTop: 16, marginBottom: 4, color: '#888', fontSize: 11 }}>
                  Current Owners — check to remove
                </div>
                {ownersList.map((addr) => (
                  <div key={addr} className="whitelist-item">
                    <input
                      type="checkbox"
                      checked={removeChecked.has(addr)}
                      onChange={e => {
                        const next = new Set(removeChecked)
                        if (e.target.checked) next.add(addr); else next.delete(addr)
                        setRemoveChecked(next)
                      }}
                    />
                    <AddressLink chainId={chainId} address={addr} />
                  </div>
                ))}
                <button className="btn btn-danger" disabled={!isOwner || removeChecked.size === 0 || isBusy || !isChainSupported(chainId)} onClick={handleRemoveOwners} style={{ marginTop: 8 }}>
                  {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : `Remove ${removeChecked.size} Owner(s)`}
                </button>
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* 4. Set Pool Start Time */}
      <CollapsibleSection id="startTime" label="Set Pool Start Time" expanded={expanded} onToggle={toggleSection}>
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above first</div>
        ) : (
          <>
            <div className="form-group">
              <label>New Start Time (UTC)</label>
              <input type="datetime-local" value={newStartDatetime} onChange={e => handleStartDatetimeChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Unix Timestamp</label>
              <input value={newStartTimestamp} readOnly style={{ opacity: 0.7 }} />
            </div>
            <button className="btn btn-primary" disabled={!isOwner || !newStartTimestamp || isBusy || !isChainSupported(chainId)} onClick={handleSetStartTime}>
              {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : 'Set Pool Start Time'}
            </button>
          </>
        )}
      </CollapsibleSection>

      {/* 5. Set Position Manager */}
      <CollapsibleSection id="posManager" label="Set Position Manager" expanded={expanded} onToggle={toggleSection}>
        <div className="form-group">
          <label>New Position Manager Address</label>
          <input value={newPosManager} onChange={e => setNewPosManager(e.target.value)} placeholder="0x..." />
        </div>
        <button className="btn btn-primary" disabled={!isOwner || !isAddress(newPosManager) || isBusy || !isChainSupported(chainId)} onClick={handleSetPositionManager}>
          {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : 'Set Position Manager'}
        </button>
      </CollapsibleSection>

      {/* 6. Emergency Withdraw */}
      <CollapsibleSection id="emergency" label="Emergency Withdraw" expanded={expanded} onToggle={toggleSection}>
        <div className="radio-group">
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'safe'} onChange={() => setWithdrawType('safe')} /> ETH/ERC20 (Safe)</label>
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'unsafe'} onChange={() => setWithdrawType('unsafe')} /> ERC20 (Unsafe)</label>
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'erc721'} onChange={() => setWithdrawType('erc721')} /> ERC721</label>
        </div>
        <div className="form-group">
          <label>Token Address {withdrawType === 'safe' && <span className="hint">(use 0x000...0 for native ETH/BNB)</span>}</label>
          <input value={withdrawToken} onChange={e => setWithdrawToken(e.target.value)} placeholder="0x..." />
        </div>
        {withdrawType === 'erc721' && (
          <div className="form-group">
            <label>Token ID</label>
            <input value={withdrawTokenId} onChange={e => setWithdrawTokenId(e.target.value)} placeholder="e.g. 12345" />
          </div>
        )}
        <button className="btn btn-danger" disabled={!isOwner || !isAddress(withdrawToken) || isBusy || !isChainSupported(chainId)} onClick={handleEmergencyWithdraw}>
          {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : 'Emergency Withdraw'}
        </button>
      </CollapsibleSection>

      {/* 7. Ownership Transfer */}
      <CollapsibleSection id="ownership" label="Ownership Transfer" expanded={expanded} onToggle={toggleSection}>
        <div className="form-group">
          <label>New Owner Address</label>
          <input value={newOwnerAddr} onChange={e => setNewOwnerAddr(e.target.value)} placeholder="0x..." />
        </div>
        <button className="btn btn-primary" disabled={!isOwner || !isAddress(newOwnerAddr) || isBusy || !isChainSupported(chainId)} onClick={handleTransferOwnership}>
          {isBusy ? 'Sending...' : !isOwner ? 'Not Hook Owner' : 'Transfer Ownership'}
        </button>
        {isPendingOwner && (
          <>
            <hr className="divider" />
            <div className="hint" style={{ marginBottom: 8, color: '#ffb74d' }}>
              You are the pending owner. Click below to accept ownership.
            </div>
            <button className="btn btn-primary" disabled={isBusy || !isChainSupported(chainId)} onClick={handleAcceptOwnership}>
              {isBusy ? 'Sending...' : 'Accept Ownership'}
            </button>
          </>
        )}
      </CollapsibleSection>

      {/* Transaction status */}
      {initTxHash && (
        <div className={`status-box ${isInitConfirmed ? 'success' : 'pending'}`}>
          Init Tx: <a href={explorerTx(chainId, initTxHash)} target="_blank" rel="noreferrer">
            {initTxHash.slice(0, 10)}...{initTxHash.slice(-8)}
          </a>
          {isInitConfirming && ' (confirming...)'}
          {isInitConfirmed && ' (confirmed)'}
        </div>
      )}
      {opTxHash && (
        <div className={`status-box ${isOpConfirmed ? 'success' : 'pending'}`}>
          Tx: <a href={explorerTx(chainId, opTxHash)} target="_blank" rel="noreferrer">
            {opTxHash.slice(0, 10)}...{opTxHash.slice(-8)}
          </a>
          {isOpConfirming && ' (confirming...)'}
          {isOpConfirmed && ' (confirmed)'}
        </div>
      )}
      {txError && <div className="status-box error">{txError}</div>}
    </div>
  )
}
