// 共享数学工具函数，供 encoder.ts 和 sqrtPrice.ts 共用，避免循环依赖

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

  const result = bigIntSqrt(numerator / denominator)
  // FIX: clamp 到链上 TickMath 允许的 [MIN_SQRT_RATIO, MAX_SQRT_RATIO) 范围，
  // 避免极端价格输入产出超范围的 sqrtPriceX96，传给 initializePool 会 revert 浪费 gas。
  if (result < MIN_SQRT_RATIO) return MIN_SQRT_RATIO
  if (result >= MAX_SQRT_RATIO) return MAX_SQRT_RATIO - 1n
  return result
}
