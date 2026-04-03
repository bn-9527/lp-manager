import { describe, it, expect } from 'vitest'
import { bigIntSqrt, calculateSqrtPriceX96 } from './sqrtPrice'

describe('bigIntSqrt', () => {
  it('returns 0 for 0', () => {
    expect(bigIntSqrt(0n)).toBe(0n)
  })

  it('returns 1 for 1', () => {
    expect(bigIntSqrt(1n)).toBe(1n)
  })

  it('returns exact sqrt for perfect squares', () => {
    expect(bigIntSqrt(4n)).toBe(2n)
    expect(bigIntSqrt(9n)).toBe(3n)
    expect(bigIntSqrt(16n)).toBe(4n)
    expect(bigIntSqrt(100n)).toBe(10n)
    expect(bigIntSqrt(10000n)).toBe(100n)
  })

  it('returns floor sqrt for non-perfect squares', () => {
    expect(bigIntSqrt(2n)).toBe(1n)
    expect(bigIntSqrt(3n)).toBe(1n)
    expect(bigIntSqrt(5n)).toBe(2n)
    expect(bigIntSqrt(8n)).toBe(2n)
    expect(bigIntSqrt(10n)).toBe(3n)
    expect(bigIntSqrt(99n)).toBe(9n)
  })

  it('handles very large numbers (2^192)', () => {
    const n = 1n << 192n
    const root = bigIntSqrt(n)
    expect(root).toBe(1n << 96n)
  })

  it('throws for negative input', () => {
    expect(() => bigIntSqrt(-1n)).toThrow('negative')
  })

  it('sqrt(x)^2 <= x < (sqrt(x)+1)^2', () => {
    const x = 123456789012345678901234567890n
    const s = bigIntSqrt(x)
    expect(s * s <= x).toBe(true)
    expect((s + 1n) * (s + 1n) > x).toBe(true)
  })
})

describe('calculateSqrtPriceX96', () => {
  it('returns null for empty price', () => {
    expect(calculateSqrtPriceX96('0xA', '0xB', 18, 18, 'A', 'B', '')).toBeNull()
  })

  it('returns null for zero price', () => {
    expect(calculateSqrtPriceX96('0xA', '0xB', 18, 18, 'A', 'B', '0')).toBeNull()
  })

  it('returns null for negative price', () => {
    expect(calculateSqrtPriceX96('0xA', '0xB', 18, 18, 'A', 'B', '-1')).toBeNull()
  })

  it('calculates correct sqrtPriceX96 for 1:1 price with same decimals', () => {
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487',
      18, 18, 'BNB', 'TEST', '1',
    )
    expect(result).not.toBeNull()
    // sqrtPriceX96 for 1:1 = 2^96 = 79228162514264337593543950336
    expect(result!.sqrtPriceX96.toString()).toBe('79228162514264337593543950336')
  })

  it('calculates correct sqrtPriceX96 for 1 BNB = 600 TEST', () => {
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487',
      18, 18, 'BNB', 'TEST', '600',
    )
    expect(result).not.toBeNull()
    // Known value from our Alpha Hook Tools
    expect(result!.sqrtPriceX96.toString()).toBe('1940685714182491852533977682922')
    expect(result!.tick).toBe(63972)
    expect(result!.isSwapped).toBe(false)
  })

  it('swaps tokens when A address > B address', () => {
    const result = calculateSqrtPriceX96(
      '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487', // higher
      '0x0000000000000000000000000000000000000000', // lower
      18, 18, 'TEST', 'BNB', '600',
    )
    expect(result).not.toBeNull()
    expect(result!.isSwapped).toBe(true)
    expect(result!.sym0).toBe('BNB')
    expect(result!.sym1).toBe('TEST')
  })

  it('handles decimal price (e.g., 0.001)', () => {
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0x1111111111111111111111111111111111111111',
      18, 18, 'A', 'B', '0.001',
    )
    expect(result).not.toBeNull()
    expect(result!.sqrtPriceX96).toBeGreaterThan(0n)
    expect(result!.poolPriceFloat).toBeCloseTo(0.001, 5)
  })

  it('handles different decimals (18 vs 6)', () => {
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      18, 6, 'ETH', 'USDC', '2000',
    )
    expect(result).not.toBeNull()
    // Pool price = 2000 * 10^(18-6) = 2 * 10^15
    expect(result!.poolPriceFloat).toBeCloseTo(2e15, -12)
  })

  it('hex output is consistent', () => {
    const result = calculateSqrtPriceX96(
      '0x0000000000000000000000000000000000000000',
      '0x1111111111111111111111111111111111111111',
      18, 18, 'A', 'B', '1',
    )
    expect(result!.sqrtPriceX96Hex).toBe('0x' + result!.sqrtPriceX96.toString(16))
  })

  it('does not swap when addresses are empty', () => {
    const result = calculateSqrtPriceX96('', '', 18, 18, 'A', 'B', '100')
    expect(result).not.toBeNull()
    expect(result!.isSwapped).toBe(false)
  })
})
