import { encodeAbiParameters, encodeFunctionData, type Hex, type Address } from 'viem'
import { positionManagerAbi } from '../config/contracts'
import { numberToBigFraction, priceToSqrtPriceX96 } from './math'

// Action constants from v4-periphery/src/libraries/Actions.sol
// MINT_POSITION = 0x02, SETTLE_PAIR = 0x0d, SWEEP = 0x14

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

  // msg.value = native token amount (address(0) always sorts to currency0, but handle both for safety)
  const value = isNative0 ? params.amount0Max : isNative1 ? params.amount1Max : 0n

  return { calldata: multicallCalldata, value }
}

export const FEE_PRESETS: Record<number, number> = { 100: 1, 200: 4, 300: 6, 400: 8, 500: 10, 3000: 60, 10000: 200 }

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
 * FIX: 原实现用浮点 Math.log(adjustedPrice) / Math.log(1.0001) 计算 tick，
 * 与 BigInt 精确路径（getTickAtSqrtRatio）存在 ±1 tick 偏差（如 1.0001^100 → tick 99 而非 100）。
 * 改为 priceToSqrtPriceX96 → getTickAtSqrtRatio 的纯 BigInt 路径，与链上 TickMath 精度一致。
 * Clamped to [-MAX_TICK, MAX_TICK] and aligned to tickSpacing.
 */
export function priceToTick(price: number, dec0: number, dec1: number, tickSpacing: number, invert = false): number {
  // FIX: price <= 0 时返回 tickSpacing 对齐的最小 tick，与 getFullRangeTicks 逻辑一致
  if (price <= 0) return -(MAX_TICK - (MAX_TICK % tickSpacing))
  // 通过 BigInt 精确路径计算 tick：price → sqrtPriceX96 → tick，避免浮点误差
  // invert 参数在 BigInt 域内做 1/price 倒数，避免浮点 1/price 精度丢失
  const sqrtPriceX96 = priceToSqrtPriceX96(price, dec0, dec1, invert)
  const raw = getTickAtSqrtRatio(sqrtPriceX96)
  const clamped = Math.max(-MAX_TICK, Math.min(MAX_TICK, raw))
  // Round down to nearest tickSpacing
  const aligned = clamped >= 0
    ? clamped - (clamped % tickSpacing)
    : clamped - ((tickSpacing + (clamped % tickSpacing)) % tickSpacing)
  // FIX: 负 tick 向下对齐可能超出 -MAX_TICK（如 -887272 对齐到 -887300），
  // 链上 TickMath.getSqrtRatioAtTick 会 revert，必须再次 clamp。
  // 使用对齐后的 MAX_TICK 确保 clamp 结果仍是 tickSpacing 的整数倍，
  // 与 getFullRangeTicks 逻辑一致，避免返回未对齐的 tick。
  const alignedMax = MAX_TICK - (MAX_TICK % tickSpacing)
  return Math.max(-alignedMax, Math.min(alignedMax, aligned))
}

/**
 * Convert a tick to a human-readable price (token1 per token0).
 */
export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  // FIX: tick 编码的是 raw price = humanPrice * 10^(dec1-dec0)，
  // 反转还原 humanPrice 需乘以 10^(dec0-dec1)。原实现方向错误。
  // 现在 priceToTick 用 10^(dec1-dec0) 编码，tickToPrice 用 10^(dec0-dec1) 解码，互为逆运算。
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1)
}

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
export function getSqrtRatioAtTick(tick: number): bigint {
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
 * Find the position of the most significant bit in a BigInt.
 * Returns 0 for input 1, 255 for input 2^255, etc.
 */
export function mostSignificantBit(x: bigint): number {
  let msb = 0
  if (x >= 0x100000000000000000000000000000000n) { x >>= 128n; msb += 128 }
  if (x >= 0x10000000000000000n) { x >>= 64n; msb += 64 }
  if (x >= 0x100000000n) { x >>= 32n; msb += 32 }
  if (x >= 0x10000n) { x >>= 16n; msb += 16 }
  if (x >= 0x100n) { x >>= 8n; msb += 8 }
  if (x >= 0x10n) { x >>= 4n; msb += 4 }
  if (x >= 0x4n) { x >>= 2n; msb += 2 }
  if (x >= 0x2n) msb += 1
  return msb
}

/**
 * Uniswap V4 TickMath.getTickAtSqrtPrice 的纯 BigInt 移植。
 * 给定 sqrtPriceX96 返回对应的 tick（向下取整）。
 * 与链上合约精度一致：14 次迭代的 binary log refinement + disambiguation。
 *
 * 参考: https://github.com/Uniswap/v4-core/blob/main/src/libraries/TickMath.sol
 */
export function getTickAtSqrtRatio(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 < 4295128739n || sqrtPriceX96 >= 1461446703485210103287273052203988822378723970342n) {
    throw new Error('sqrtPriceX96 out of range')
  }

  const price = sqrtPriceX96 << 32n
  let r = price
  const msb = mostSignificantBit(r)

  if (msb >= 128) r = price >> BigInt(msb - 127)
  else r = price << BigInt(127 - msb)

  let log2 = (BigInt(msb) - 128n) << 64n

  // 14 iterations of binary log refinement (bits 63 down to 50)
  for (let i = 63; i >= 50; i--) {
    r = (r * r) >> 127n
    const f = r >> 128n
    log2 |= f << BigInt(i)
    r >>= f
  }

  const logSqrt10001 = log2 * 255738958999603826347141n

  const tickLow = Number((logSqrt10001 - 3402992956809132418596140100660247210n) >> 128n)
  const tickHi = Number((logSqrt10001 + 291339464771989622907027621153398088495n) >> 128n)

  if (tickLow === tickHi) return tickLow
  return getSqrtRatioAtTick(tickHi) <= sqrtPriceX96 ? tickHi : tickLow
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
  invertPrice = false,
): bigint {
  // FIX: use `invert` param for lossless BigInt 1/price instead of caller doing float `1/price`
  const sqrtP = priceToSqrtPriceX96(currentPrice, dec0, dec1, invertPrice)
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
  dec0: number, dec1: number,
  invertPrice = false,
): number {
  if (amount0 <= 0 || currentPrice <= 0) return 0

  const sqrtP = priceToSqrtPriceX96(currentPrice, dec0, dec1, invertPrice)
  const sqrtA = getSqrtRatioAtTick(tickLower)
  const sqrtB = getSqrtRatioAtTick(tickUpper)
  const Q96 = 1n << 96n

  if (sqrtP <= sqrtA) {
    return 0
  }
  if (sqrtP >= sqrtB) {
    // FIX: 价格高于范围时仓位为 100% token1，token0 应为 0，
    // 从 amount0 推算 amount1 无意义，返回 0 让 UI 提示用户输入 token1
    return 0
  }

  // amount0 转 wei (BigInt)
  const { numerator: amt0Num, denominator: amt0Den } = numberToBigFraction(amount0)
  const amount0Wei = amt0Num * 10n ** BigInt(dec0) / amt0Den

  // L = amount0Wei * sqrtP * sqrtB / (Q96 * (sqrtB - sqrtP))
  const liquidity = amount0Wei * sqrtP * sqrtB / (Q96 * (sqrtB - sqrtP))

  // amount1Wei = L * (sqrtP - sqrtA) / Q96
  const amount1Wei = liquidity * (sqrtP - sqrtA) / Q96

  // FIX: 原实现用 * 10000n 仅保留 4 位小数，小额场景（如 0.000012 ETH）会截断为 0。
  // 提升到 12 位有效小数覆盖绝大多数 DeFi 场景。
  return Number(amount1Wei * 10n ** 12n / 10n ** BigInt(dec1)) / 1e12
}

/**
 * calcAmount1FromAmount0 的反向函数：已知 amount1 求 amount0。
 * 用于 swapped 场景下 tokenA=currency1 时，从 amountA 反推 amountB(=amount0)。
 */
export function calcAmount0FromAmount1(
  amount1: number, currentPrice: number,
  tickLower: number, tickUpper: number,
  dec0: number, dec1: number,
  invertPrice = false,
): number {
  if (amount1 <= 0 || currentPrice <= 0) return 0

  const sqrtP = priceToSqrtPriceX96(currentPrice, dec0, dec1, invertPrice)
  const sqrtA = getSqrtRatioAtTick(tickLower)
  const sqrtB = getSqrtRatioAtTick(tickUpper)
  const Q96 = 1n << 96n

  if (sqrtP >= sqrtB) {
    // price above range: position is 100% token1, no token0 needed
    return 0
  }
  if (sqrtP <= sqrtA) {
    // FIX: 价格低于范围时仓位为 100% token0，token1 应为 0，
    // 从 amount1 推算 amount0 无意义，返回 0 让 UI 提示用户输入 token0
    return 0
  }

  const { numerator: amt1Num, denominator: amt1Den } = numberToBigFraction(amount1)
  const amount1Wei = amt1Num * 10n ** BigInt(dec1) / amt1Den

  // L = amount1Wei * Q96 / (sqrtP - sqrtA)
  const liquidity = amount1Wei * Q96 / (sqrtP - sqrtA)

  // amount0Wei = L * Q96 * (sqrtB - sqrtP) / (sqrtP * sqrtB)
  const amount0Wei = liquidity * Q96 * (sqrtB - sqrtP) / (sqrtP * sqrtB)

  // FIX: 原实现用 * 10000n 仅保留 4 位小数，小额场景（如 0.000012 ETH）会截断为 0。
  // 提升到 12 位有效小数覆盖绝大多数 DeFi 场景。
  return Number(amount0Wei * 10n ** 12n / 10n ** BigInt(dec0)) / 1e12
}
