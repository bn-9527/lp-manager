import { encodeAbiParameters, encodeFunctionData, type Hex, type Address } from 'viem'
import { positionManagerAbi } from '../config/contracts'
import { bigIntSqrt } from './sqrtPrice'

/**
 * 将 Number 安全转为 BigInt 分数 (numerator / denominator)。
 * FIX: toPrecision/toFixed 对极端值会返回科学计数法字符串（如 "1e-9"），
 * BigInt() 无法解析。此函数先用 toExponential 提取尾数和指数，纯整数运算，
 * 避免科学计数法字符串传入 BigInt 导致崩溃。
 */
export function numberToBigFraction(n: number): { numerator: bigint; denominator: bigint } {
  if (n === 0 || !isFinite(n)) return { numerator: 0n, denominator: 1n }
  // toExponential(14) 给出 "1.23456789012345e+5" 格式，始终有小数点和指数
  const expStr = Math.abs(n).toExponential(14)
  const [mantissa, expPart] = expStr.split('e')
  const exp = parseInt(expPart)
  const parts = mantissa.split('.')
  const digits = (parts[0] || '0') + (parts[1] || '')
  // digits 是去掉小数点的全部有效数字，mantissa 的小数位数 = fracLen
  const fracLen = (parts[1] || '').length
  // 实际值 = digits * 10^(exp - fracLen)
  const shift = exp - fracLen
  let numerator = BigInt(digits)
  let denominator = 1n
  if (shift >= 0) {
    numerator = numerator * 10n ** BigInt(shift)
  } else {
    denominator = 10n ** BigInt(-shift)
  }
  return { numerator, denominator }
}

// Action constants from v4-periphery/src/libraries/Actions.sol
// MINT_POSITION = 0x02, SETTLE_PAIR = 0x0d

// PoolKey tuple type for ABI encoding
const poolKeyTuple = {
  type: 'tuple' as const,
  components: [
    { name: 'currency0', type: 'address' as const },
    { name: 'currency1', type: 'address' as const },
    { name: 'fee', type: 'uint24' as const },
    { name: 'tickSpacing', type: 'int24' as const },
    { name: 'hooks', type: 'address' as const },
  ],
}

export function buildMintMulticallData(params: {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount0Max: bigint
  amount1Max: bigint
  recipient: Address
  deadline: bigint
}): { calldata: Hex; value: bigint } {
  // 1. Encode MINT_POSITION params: (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)
  const mintParams = encodeAbiParameters(
    [poolKeyTuple, { type: 'int24' }, { type: 'int24' }, { type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'address' }, { type: 'bytes' }],
    [
      { currency0: params.currency0, currency1: params.currency1, fee: params.fee, tickSpacing: params.tickSpacing, hooks: params.hooks },
      params.tickLower, params.tickUpper, params.liquidity, params.amount0Max, params.amount1Max, params.recipient, '0x'
    ]
  )

  // 2. Encode SETTLE_PAIR params: (currency0, currency1)
  const settlePairParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }],
    [params.currency0, params.currency1]
  )

  const isNative0 = params.currency0 === '0x0000000000000000000000000000000000000000'
  const isNative1 = params.currency1 === '0x0000000000000000000000000000000000000000'

  // 3. Build actions + params
  // MINT_POSITION (0x02) + SETTLE_PAIR (0x0d) + optional SWEEP (0x14) for native token refund
  // SWEEP recovers excess msg.value left in PositionManager after settlement
  const actionBytes: number[] = [0x02, 0x0d]
  const paramsList: Hex[] = [mintParams, settlePairParams]

  if (isNative0) {
    // SWEEP currency0 back to recipient
    const sweepParams = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [params.currency0, params.recipient]
    )
    actionBytes.push(0x14)
    paramsList.push(sweepParams)
  }
  if (isNative1) {
    const sweepParams = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [params.currency1, params.recipient]
    )
    actionBytes.push(0x14)
    paramsList.push(sweepParams)
  }

  const actions: Hex = `0x${actionBytes.map(b => b.toString(16).padStart(2, '0')).join('')}`

  // 4. Encode unlockData = abi.encode(bytes actions, bytes[] params)
  const unlockData = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, paramsList]
  )

  // 5. Encode modifyLiquidities(unlockData, deadline)
  const modifyLiquiditiesCalldata = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'modifyLiquidities',
    args: [unlockData, params.deadline],
  })

  // 6. Wrap in multicall([modifyLiquiditiesCalldata])
  const multicallCalldata = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: 'multicall',
    args: [[modifyLiquiditiesCalldata]],
  })

  // msg.value = native token amount when currency0 is address(0) (native BNB)
  const value = params.currency0 === '0x0000000000000000000000000000000000000000' ? params.amount0Max : 0n

  return { calldata: multicallCalldata, value }
}

const FEE_PRESETS: Record<number, number> = { 100: 1, 200: 4, 300: 6, 400: 8, 500: 10, 3000: 60, 10000: 200 }

export function feeToTickSpacing(fee: number): number {
  if (FEE_PRESETS[fee] !== undefined) return FEE_PRESETS[fee]
  return Math.max(Math.round(2 * fee / 100), 1)
}

const MAX_TICK = 887272

/**
 * Calculate full-range tick bounds aligned to the given tickSpacing.
 */
export function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const tickUpper = MAX_TICK - (MAX_TICK % tickSpacing)
  return { tickLower: -tickUpper, tickUpper }
}

/**
 * Convert a human-readable price (token1 per token0) to a tick.
 * tick = floor(log(price * 10^(dec0-dec1)) / log(1.0001))
 * Clamped to [-MAX_TICK, MAX_TICK] and aligned to tickSpacing.
 */
export function priceToTick(price: number, dec0: number, dec1: number, tickSpacing: number): number {
  if (price <= 0) return -MAX_TICK + (MAX_TICK % tickSpacing)
  const adjustedPrice = price * Math.pow(10, dec0 - dec1)
  const raw = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001))
  const clamped = Math.max(-MAX_TICK, Math.min(MAX_TICK, raw))
  // Round down to nearest tickSpacing
  return clamped >= 0
    ? clamped - (clamped % tickSpacing)
    : clamped - ((tickSpacing + (clamped % tickSpacing)) % tickSpacing)
}

/**
 * Convert a tick to a human-readable price (token1 per token0).
 */
export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec1 - dec0)
}

/**
 * Given amount0, current price (token1/token0), and a tick range,
 * calculate the required amount1 for a V3/V4 concentrated liquidity position.
 *
 * sqrtP = sqrt(price * 10^(dec0-dec1))
 * sqrtA = sqrt(1.0001^tickLower)
 * sqrtB = sqrt(1.0001^tickUpper)
 *
 * If sqrtP is within [sqrtA, sqrtB]:
 *   L = amount0 * (sqrtP * sqrtB) / (sqrtB - sqrtP)
 *   amount1 = L * (sqrtP - sqrtA) / 10^(dec0-dec1) ... adjusted for decimals
 *
 * Returns the ratio: amount1 / amount0 in human-readable terms (tokenB per tokenA).
 */

/**
 * Uniswap V3 TickMath.getSqrtRatioAtTick 的纯 BigInt 移植。
 * 使用预计算的 Q128 魔法常量 + 位运算，O(1) 复杂度，精度与链上合约一致。
 *
 * PRECISION FIX: bignumber.js 的 pow(1.0001, 887270) 需要计算 38000+ 位十进制数，
 * 即使用快速幂也需数十秒。改用 Uniswap 合约自身的查表法，20 次 BigInt 乘法即可，
 * 且结果与链上 TickMath 完全一致（无浮点近似）。
 *
 * 参考: https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol
 */
function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = Math.abs(tick)
  if (absTick > 887272) throw new Error('tick out of range')

  let ratio: bigint = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n
  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n

  if (tick > 0) ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio

  // Round to Q96: shift right by 32, then round up if remainder
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n)
}

/**
 * 将人类可读价格转为 sqrtPriceX96（纯 BigInt 算术，与 sqrtPrice.ts 相同方法）。
 * 先将价格拆为 BigInt 分数 priceBig/priceScale，在 Q192 空间做除法后取 BigInt 平方根。
 */
function priceToSqrtX96(currentPrice: number, dec0: number, dec1: number): bigint {
  // FIX: toPrecision(15) 对极小/极大值返回科学计数法（如 "1.00e-9"），
  // BigInt() 无法解析科学计数法字符串。改用 numberToBigFraction 安全拆分。
  const { numerator: priceBig, denominator: priceScale } = numberToBigFraction(currentPrice)

  const Q192 = 1n << 192n
  let numerator = priceBig * Q192
  let denominator = priceScale

  const decDiff = dec0 - dec1
  if (decDiff > 0) {
    numerator = numerator * 10n ** BigInt(decDiff)
  } else if (decDiff < 0) {
    denominator = denominator * 10n ** BigInt(-decDiff)
  }

  return bigIntSqrt(numerator / denominator)
}

/**
 * Calculate the liquidity value from desired token amounts, current price, and tick range.
 * Replicates Uniswap's LiquidityAmounts.getLiquidityForAmounts in TypeScript.
 *
 * PRECISION FIX: 原实现用 Number 域的 Q96 运算（2**96 ≈ 7.9e28 超出 Number.MAX_SAFE_INTEGER），
 * 且 Number(amount) 会截断超过 2^53 的 wei 值（约 9 ETH）。
 * 现在 sqrtPriceX96 通过纯 BigInt 计算（与链上 TickMath 一致），
 * amount 直接参与 BigInt 乘除，零精度损失。
 */
export function getLiquidityForAmounts(
  amount0: bigint, amount1: bigint,
  currentPrice: number,
  tickLower: number, tickUpper: number,
  dec0: number, dec1: number,
): bigint {
  const sqrtP = priceToSqrtX96(currentPrice, dec0, dec1)
  const sqrtA = getSqrtRatioAtTick(tickLower)
  const sqrtB = getSqrtRatioAtTick(tickUpper)
  const Q96 = 1n << 96n

  let liquidity: bigint

  if (sqrtP <= sqrtA) {
    // Current price below range: only token0 is used
    // L = amount0 * (sqrtA * sqrtB) / (sqrtB - sqrtA)
    liquidity = amount0 * sqrtA * sqrtB / (Q96 * (sqrtB - sqrtA))
  } else if (sqrtP >= sqrtB) {
    // Current price above range: only token1 is used
    // L = amount1 * Q96 / (sqrtB - sqrtA)
    liquidity = amount1 * Q96 / (sqrtB - sqrtA)
  } else {
    // In range: L = min(L0, L1)
    const liquidityFromToken0 = amount0 * sqrtP * sqrtB / (Q96 * (sqrtB - sqrtP))
    const liquidityFromToken1 = amount1 * Q96 / (sqrtP - sqrtA)
    liquidity = liquidityFromToken0 < liquidityFromToken1 ? liquidityFromToken0 : liquidityFromToken1
  }

  return liquidity > 0n ? liquidity : 0n
}

/**
 * PRECISION FIX: 原实现使用 Number/Math.pow 浮点运算，当 dec0=18 且 amount > 9 时
 * amount0 * 10^18 超出 Number.MAX_SAFE_INTEGER 导致精度截断。
 * 现在与 getLiquidityForAmounts 一致，使用 getSqrtRatioAtTick + priceToSqrtX96 的纯 BigInt 路径。
 * 计算完成后转回 number 用于 UI 显示。
 */
export function calcAmount1FromAmount0(
  amount0: number, currentPrice: number,
  tickLower: number, tickUpper: number,
  dec0: number, dec1: number
): number {
  if (amount0 <= 0 || currentPrice <= 0) return 0

  const sqrtP = priceToSqrtX96(currentPrice, dec0, dec1)
  const sqrtA = getSqrtRatioAtTick(tickLower)
  const sqrtB = getSqrtRatioAtTick(tickUpper)
  const Q96 = 1n << 96n

  if (sqrtP <= sqrtA) {
    return 0
  }
  if (sqrtP >= sqrtB) {
    return amount0 * currentPrice
  }

  // amount0 转 wei (BigInt)
  const { numerator: amt0Num, denominator: amt0Den } = numberToBigFraction(amount0)
  const amount0Wei = amt0Num * 10n ** BigInt(dec0) / amt0Den

  // L = amount0Wei * sqrtP * sqrtB / (Q96 * (sqrtB - sqrtP))
  const liquidity = amount0Wei * sqrtP * sqrtB / (Q96 * (sqrtB - sqrtP))

  // amount1Wei = L * (sqrtP - sqrtA) / Q96
  const amount1Wei = liquidity * (sqrtP - sqrtA) / Q96

  // 转回人类可读数值
  return Number(amount1Wei * 10000n / 10n ** BigInt(dec1)) / 10000
}
