// 共享数学工具函数，供 encoder.ts 和 sqrtPrice.ts 共用，避免循环依赖
import BigNumber from 'bignumber.js'

// Uniswap V4 TickMath 允许的 sqrtPriceX96 范围，超出此范围的值传给链上合约会 revert
export const MIN_SQRT_RATIO = 4295128739n
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

/**
 * 将 Number 安全转为 BigInt 分数 (numerator / denominator)。
 * FIX: toPrecision/toFixed 对极端值会返回科学计数法字符串（如 "1e-9"），
 * BigInt() 无法解析。此函数先用 toExponential 提取尾数和指数，纯整数运算，
 * 避免科学计数法字符串传入 BigInt 导致崩溃。
 * 注意: toExponential(14) 限制尾数为 15 位有效数字，在 Number 的 ~15.9 位精度范围内。
 */
export function numberToBigFraction(n: number): { numerator: bigint; denominator: bigint } {
  // FIX: 负数输入会被 Math.abs 静默转为正数，调用者得到错误结果而非报错
  if (n < 0) throw new Error('numberToBigFraction: input must be non-negative')
  // FIX: NaN/Infinity 静默返回 0 会导致 priceToSqrtPriceX96 产出 0 值，
  // 低于 Uniswap MIN_SQRT_RATIO(4295128739)，传给链上合约会 revert。
  if (isNaN(n) || !isFinite(n)) throw new Error('numberToBigFraction: input must be a finite number')
  if (n === 0) return { numerator: 0n, denominator: 1n }
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

export function bigIntSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('negative')
  if (n === 0n) return 0n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

/**
 * Convert a human-readable price to sqrtPriceX96 using pure BigInt arithmetic.
 * Splits the price into a BigInt fraction, applies decimal adjustment in Q192 space,
 * then takes the BigInt square root.
 *
 * @param invert - When true, computes sqrtPriceX96 for (1/price) using BigInt
 *   numerator/denominator swap instead of floating-point 1/price, avoiding precision loss.
 *   Used when the user enters "price of A in B" but on-chain currency0 is B (swapped pair).
 */
export function priceToSqrtPriceX96(price: number, dec0: number, dec1: number, invert = false): bigint {
  const { numerator: priceBig, denominator: priceScale } = numberToBigFraction(price)

  const Q192 = 1n << 192n
  // FIX: invert via BigInt fraction swap (priceScale/priceBig) instead of floating-point 1/price,
  // which loses precision for non-terminating decimals (e.g. 1/3000 = 0.000333...).
  let numerator: bigint
  let denominator: bigint
  if (invert) {
    numerator = priceScale * Q192
    denominator = priceBig
  } else {
    numerator = priceBig * Q192
    denominator = priceScale
  }

  // FIX: Uniswap raw price = humanPrice * 10^(dec1-dec0), i.e. token1_wei / token0_wei.
  // Original used dec0-dec1 which was wrong; for cross-decimal pairs (e.g. ETH/USDC 18/6)
  // sqrtPriceX96 would be off by 10^(dec0-dec1).
  const decDiff = dec1 - dec0
  if (decDiff > 0) {
    numerator = numerator * 10n ** BigInt(decDiff)
  } else if (decDiff < 0) {
    denominator = denominator * 10n ** BigInt(-decDiff)
  }

  // FIX: 原实现 bigIntSqrt(numerator / denominator) 先整除再开方，
  // 当 numerator < denominator 时整除结果为 0，丢失全部有效数字。
  // 改为先放大 numerator（乘以 SCALE^2），开方后再除以 SCALE，保留精度。
  // SCALE = 10^30 提供足够的精度缓冲覆盖极端跨精度场景（如 dec0=18, dec1=2）。
  const SCALE = 10n ** 30n
  const result = bigIntSqrt(numerator * SCALE * SCALE / denominator) / SCALE
  // FIX: clamp 到链上 TickMath 允许的 [MIN_SQRT_RATIO, MAX_SQRT_RATIO) 范围，
  // 避免极端价格输入产出超范围的 sqrtPriceX96，传给 initializePool 会 revert 浪费 gas。
  if (result < MIN_SQRT_RATIO) return MIN_SQRT_RATIO
  if (result >= MAX_SQRT_RATIO) return MAX_SQRT_RATIO - 1n
  return result
}

export const MAX_TICK = 887272

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
  // FIX: x=0 没有最高有效位，但原实现返回 0（与 x=1 相同），
  // 上游 getTickAtSqrtRatio 的范围检查保证不会传入 0，但作为公开函数需防御性校验
  if (x <= 0n) throw new Error('mostSignificantBit: input must be positive')
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
 * FIX: 原实现用 Math.pow(1.0001, tick) 浮点运算，在 |tick| 接近 887272 时
 * Number 仅有 ~15.9 位有效精度，导致显著误差。
 * 改用 getSqrtRatioAtTick（纯 BigInt 查表法，与链上 TickMath 精度一致）
 * + BigNumber.js 高精度反算，与 priceToTick 的 BigInt 路径对称。
 *
 * @param invert - When true, returns 1/price using BigNumber.js high-precision reciprocal
 *   instead of floating-point 1/price, avoiding precision loss for non-terminating decimals.
 *   Used when displaying swapped pair prices (e.g. tokenA/tokenB where tokenA is currency1).
 */
export function tickToPrice(tick: number, dec0: number, dec1: number, invert = false): number {
  const sqrtRatio = getSqrtRatioAtTick(tick)
  const bnSqrt = new BigNumber(sqrtRatio.toString())
  const bnQ96 = new BigNumber(2).pow(96)
  // price = (sqrtRatio / 2^96)^2 * 10^(dec0 - dec1)
  const rawPrice = bnSqrt.div(bnQ96).pow(2)
    .times(new BigNumber(10).pow(dec0 - dec1))
  // FIX: invert 在 BigNumber 高精度域做倒数，避免浮点 1/price 对非终止小数丢精度
  if (invert) {
    if (rawPrice.isZero()) return Infinity
    return new BigNumber(1).div(rawPrice).toNumber()
  }
  return rawPrice.toNumber()
}
