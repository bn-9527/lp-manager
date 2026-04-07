import { describe, it, expect } from 'vitest'
import { numberToBigFraction, priceToSqrtPriceX96, MIN_SQRT_RATIO, MAX_SQRT_RATIO } from './math'
import { calculateSqrtPriceX96 } from './sqrtPrice'

describe('numberToBigFraction', () => {
  it('returns 0/1 for 0', () => {
    const { numerator, denominator } = numberToBigFraction(0)
    expect(numerator).toBe(0n)
    expect(denominator).toBe(1n)
  })

  it('throws for Infinity and NaN', () => {
    expect(() => numberToBigFraction(Infinity)).toThrow('finite number')
    expect(() => numberToBigFraction(-Infinity)).toThrow()
    expect(() => numberToBigFraction(NaN)).toThrow('finite number')
  })

  it('throws for negative input', () => {
    expect(() => numberToBigFraction(-1)).toThrow('non-negative')
    expect(() => numberToBigFraction(-0.001)).toThrow('non-negative')
  })

  it('handles integer values', () => {
    const { numerator, denominator } = numberToBigFraction(100)
    expect(Number(numerator) / Number(denominator)).toBeCloseTo(100, 10)
  })

  it('handles decimal values', () => {
    const { numerator, denominator } = numberToBigFraction(0.05)
    expect(Number(numerator) / Number(denominator)).toBeCloseTo(0.05, 10)
  })

  it('handles scientific notation small values (1e-9)', () => {
    const { numerator, denominator } = numberToBigFraction(1e-9)
    const ratio = Number(numerator) / Number(denominator)
    expect(ratio).toBeCloseTo(1e-9, 20)
  })

  it('handles scientific notation large values (1e+18)', () => {
    const { numerator, denominator } = numberToBigFraction(1e18)
    // numerator should be 10^18, denominator should be 1
    expect(numerator).toBeGreaterThan(0n)
    expect(denominator).toBeGreaterThan(0n)
    const ratio = Number(numerator) / Number(denominator)
    expect(ratio).toBeCloseTo(1e18, -3)
  })

  it('handles very small decimals (1e-18)', () => {
    const { numerator, denominator } = numberToBigFraction(1e-18)
    expect(numerator).toBeGreaterThan(0n)
    expect(denominator).toBeGreaterThan(0n)
    const ratio = Number(numerator) / Number(denominator)
    expect(ratio).toBeCloseTo(1e-18, 30)
  })

  it('handles Number.MAX_SAFE_INTEGER', () => {
    const n = Number.MAX_SAFE_INTEGER // 2^53 - 1 = 9007199254740991
    const { numerator, denominator } = numberToBigFraction(n)
    const ratio = Number(numerator) / Number(denominator)
    expect(ratio).toBeCloseTo(n, -1)
  })

  it('preserves precision for common DeFi prices', () => {
    // 600 BNB/TEST, 2000 ETH/USDC, 0.001 small token
    for (const price of [600, 2000, 0.001, 0.00000001, 123456.789]) {
      const { numerator, denominator } = numberToBigFraction(price)
      const ratio = Number(numerator) / Number(denominator)
      const relError = Math.abs(ratio - price) / price
      expect(relError).toBeLessThan(1e-14)
    }
  })

  it('numerator/denominator are always positive for positive input', () => {
    for (const n of [0.001, 1, 100, 1e18, 1e-18]) {
      const { numerator, denominator } = numberToBigFraction(n)
      expect(numerator).toBeGreaterThan(0n)
      expect(denominator).toBeGreaterThan(0n)
    }
  })
})

describe('priceToSqrtPriceX96', () => {
  const Q96 = 1n << 96n

  it('returns 2^96 for price=1 with same decimals', () => {
    const result = priceToSqrtPriceX96(1, 18, 18)
    // sqrtPriceX96 = sqrt(1 * 2^192) = 2^96
    expect(result).toBe(Q96)
  })

  it('matches calculateSqrtPriceX96 for same decimals', () => {
    // Both functions should produce the same result for the same input
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487',
      18, 18, 'BNB', 'TEST', '600',
    )
    const direct = priceToSqrtPriceX96(600, 18, 18)
    expect(result).not.toBeNull()
    expect(direct).toBe(result!.sqrtPriceX96)
  })

  it('handles cross-decimal ETH(18)/USDC(6) correctly', () => {
    // 1 ETH = 2000 USDC, ETH=currency0(18dec), USDC=currency1(6dec)
    // Uniswap raw_price = 2000 * 10^(6-18) = 2000 * 10^-12 = 2e-9
    // sqrtPriceX96 = sqrt(2e-9) * 2^96 = 3543191142285914205922034
    const result = priceToSqrtPriceX96(2000, 18, 6)
    // Precise value check: relative error < 0.0001% to catch decimal direction bugs
    // (dec0-dec1 error would produce ~3.54e36, off by 10^12)
    const expected = 3543191142285914205922034n
    const diff = result > expected ? result - expected : expected - result
    const relError = Number(diff) / Number(expected)
    expect(relError).toBeLessThan(1e-6)
  })

  it('handles cross-decimal USDC(6)/WBTC(8) correctly', () => {
    // 1 USDC = 0.000015 WBTC (i.e., BTC=67000 USDC), USDC=currency0(6dec), WBTC=currency1(8dec)
    // raw_price = 0.000015 * 10^(8-6) = 0.000015 * 100 = 0.0015
    // sqrtPriceX96 = sqrt(0.0015) * 2^96 = 3068493539683605256287027819
    const result = priceToSqrtPriceX96(0.000015, 6, 8)
    const expected = 3068493539683605256287027819n
    const diff = result > expected ? result - expected : expected - result
    const relError = Number(diff) / Number(expected)
    expect(relError).toBeLessThan(1e-6)
  })

  it('is consistent with getSqrtRatioAtTick via priceToTick roundtrip', () => {
    // For same decimals, priceToSqrtPriceX96(price) ≈ getSqrtRatioAtTick(priceToTick(price))
    // We test this indirectly: sqrtP^2 / Q96^2 should approximate the raw price
    const sqrtP = priceToSqrtPriceX96(600, 18, 18)
    // raw_price = sqrtP^2 / 2^192 = 600 * 10^(18-18) = 600
    const rawPrice = Number(sqrtP * sqrtP / (1n << 192n))
    expect(rawPrice).toBeCloseTo(600, -1)
  })

  it('cross-decimal sqrtP^2/Q192 equals raw price', () => {
    // ETH(18)/USDC(6) at 2000: raw_price = 2000 * 10^(6-18) = 2e-9
    const sqrtP = priceToSqrtPriceX96(2000, 18, 6)
    // sqrtP^2 / 2^192 ≈ 2e-9 → scale by 1e18 to avoid float underflow
    const scaled = sqrtP * sqrtP * (10n ** 18n) / (1n << 192n)
    // Expected: 2e-9 * 1e18 = 2e9 = 1999999999 (BigInt truncation)
    // Tight check: relative error < 0.0001%
    const expected = 1999999999n
    const diff = scaled > expected ? scaled - expected : expected - scaled
    expect(Number(diff)).toBeLessThan(Number(expected) * 1e-6)
  })

  it('clamps to MIN_SQRT_RATIO for extremely small prices', () => {
    // 极小价格 (如 1e-40) 的 sqrtPriceX96 应被 clamp 到 MIN_SQRT_RATIO
    const result = priceToSqrtPriceX96(1e-40, 18, 18)
    expect(result).toBe(MIN_SQRT_RATIO)
  })

  it('clamps to MAX_SQRT_RATIO - 1 for extremely large prices', () => {
    // 极大价格的 sqrtPriceX96 应被 clamp 到 MAX_SQRT_RATIO - 1
    const result = priceToSqrtPriceX96(1e40, 18, 18)
    expect(result).toBe(MAX_SQRT_RATIO - 1n)
  })

  it('clamps cross-decimal extreme prices', () => {
    // ETH(18)/USDC(6) with absurdly small price
    const small = priceToSqrtPriceX96(1e-50, 18, 6)
    expect(small).toBe(MIN_SQRT_RATIO)
    // ETH(18)/USDC(6) with absurdly large price — need even larger value because
    // dec1-dec0 = 6-18 = -12 effectively divides the price by 10^12 in Q192 space
    const large = priceToSqrtPriceX96(1e80, 18, 6)
    expect(large).toBe(MAX_SQRT_RATIO - 1n)
  })

  it('normal prices are not clamped', () => {
    for (const price of [0.001, 1, 600, 2000, 100000]) {
      const result = priceToSqrtPriceX96(price, 18, 18)
      expect(result).toBeGreaterThan(MIN_SQRT_RATIO)
      expect(result).toBeLessThan(MAX_SQRT_RATIO)
    }
  })

  it('invert=true produces lossless 1/price via BigInt fraction swap', () => {
    // priceToSqrtPriceX96(price, d0, d1, true) should equal
    // priceToSqrtPriceX96(1/price, d1, d0, false) approximately,
    // but the BigInt path is more precise for non-terminating decimals (1/3000)
    const direct = priceToSqrtPriceX96(3000, 18, 18, true)
    const manual = priceToSqrtPriceX96(1 / 3000, 18, 18, false)
    // Both should be very close; the inverted version should match or be more precise
    const diff = direct > manual ? direct - manual : manual - direct
    const relError = Number(diff) / Number(direct)
    expect(relError).toBeLessThan(1e-12)
  })

  it('invert=true for cross-decimal pair matches calculateSqrtPriceX96 swapped path', () => {
    // User enters "1 USDC = 0.0005 ETH", on-chain: ETH/USDC pool, price = 1/0.0005 = 2000
    // priceToSqrtPriceX96(0.0005, 18, 6, true) should give same as (2000, 18, 6, false)
    // because invert swaps numerator/denominator in BigInt domain (lossless)
    const normal = priceToSqrtPriceX96(2000, 18, 6, false)
    const inverted = priceToSqrtPriceX96(0.0005, 18, 6, true)
    // FIX: 0.0005 = 1/2000 exactly in binary, so BigInt inversion should be lossless.
    // Previously tolerating 1% was far too loose for a BigInt path.
    expect(inverted).toBe(normal)
  })

  it('handles reverse cross-decimal dec0(6)/dec1(18)', () => {
    // USDC(6) as currency0, WETH(18) as currency1, price=0.0005 (1 USDC = 0.0005 ETH)
    // raw_price = 0.0005 * 10^(18-6) = 0.0005 * 10^12 = 5e8
    // sqrtPriceX96 = sqrt(5e8) * 2^96 ≈ 1.77e33
    const result = priceToSqrtPriceX96(0.0005, 6, 18)
    const expected = 1771595571142957102961017161607260n
    const diff = result > expected ? result - expected : expected - result
    const relError = Number(diff) / Number(expected)
    expect(relError).toBeLessThan(1e-6)
  })
})
