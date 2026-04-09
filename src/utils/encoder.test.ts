import { describe, it, expect } from 'vitest'
import {
  feeToTickSpacing,
  getFullRangeTicks,
  priceToTick,
  tickToPrice,
  calcAmount1FromAmount0,
  calcAmount0FromAmount1,
  getLiquidityForAmounts,
  buildMintMulticallData,
  getSqrtRatioAtTick,
  getTickAtSqrtRatio,
  mostSignificantBit,
} from './encoder'

describe('feeToTickSpacing', () => {
  it('returns preset values for known fees', () => {
    expect(feeToTickSpacing(100)).toBe(1)
    expect(feeToTickSpacing(200)).toBe(4)
    expect(feeToTickSpacing(300)).toBe(6)
    expect(feeToTickSpacing(400)).toBe(8)
    expect(feeToTickSpacing(500)).toBe(10)
    expect(feeToTickSpacing(3000)).toBe(60)
    expect(feeToTickSpacing(10000)).toBe(200)
  })

  it('uses formula for non-preset fees', () => {
    // formula: Math.max(Math.round(2 * fee / 100), 1)
    expect(feeToTickSpacing(250)).toBe(5)   // 2*250/100 = 5
    expect(feeToTickSpacing(150)).toBe(3)   // 2*150/100 = 3
    expect(feeToTickSpacing(1000)).toBe(20) // 2*1000/100 = 20
  })

  it('returns minimum of 1 for very small fees', () => {
    expect(feeToTickSpacing(1)).toBe(1)
    expect(feeToTickSpacing(10)).toBe(1)
    expect(feeToTickSpacing(25)).toBe(1)
  })
})

describe('getFullRangeTicks', () => {
  it('returns symmetric ticks aligned to tickSpacing', () => {
    const { tickLower, tickUpper } = getFullRangeTicks(10)
    expect(tickUpper).toBe(887270)
    expect(tickLower).toBe(-887270)
    expect(tickUpper % 10).toBe(0)
  })

  it('handles tickSpacing=1', () => {
    const { tickLower, tickUpper } = getFullRangeTicks(1)
    expect(tickUpper).toBe(887272)
    expect(tickLower).toBe(-887272)
  })

  it('handles tickSpacing=60', () => {
    const { tickLower, tickUpper } = getFullRangeTicks(60)
    expect(tickUpper).toBe(887220) // 887272 - (887272 % 60) = 887220
    expect(tickLower).toBe(-887220)
  })

  it('handles tickSpacing=200', () => {
    const r = getFullRangeTicks(200)
    expect(r.tickUpper % 200).toBe(0)
    expect(r.tickUpper).toBeLessThanOrEqual(887272)
    expect(r.tickLower).toBe(-r.tickUpper)
  })
})

describe('priceToTick', () => {
  it('returns 0 for price=1 with same decimals', () => {
    const tick = priceToTick(1, 18, 18, 1)
    expect(tick).toBe(0)
  })

  it('returns positive tick for price > 1 with same decimals', () => {
    const tick = priceToTick(600, 18, 18, 1)
    expect(tick).toBeGreaterThan(0)
    // tick ≈ log(600)/log(1.0001) ≈ 63972
    expect(tick).toBeGreaterThan(63900)
    expect(tick).toBeLessThan(64100)
  })

  it('returns negative tick for price < 1 with same decimals', () => {
    const tick = priceToTick(0.001, 18, 18, 1)
    expect(tick).toBeLessThan(0)
  })

  it('aligns to tickSpacing', () => {
    const tick = priceToTick(600, 18, 18, 60)
    expect(tick % 60).toBe(0)
  })

  it('handles different decimals (e.g., 18 and 6)', () => {
    // FIX: 1 ETH(18dec) = 2000 USDC(6dec), ETH=currency0, USDC=currency1
    // Uniswap raw price = 2000 * 10^(6-18) = 2e-9
    // tick = getTickAtSqrtRatio(priceToSqrtPriceX96(2000, 18, 6)) = -200312
    const tick = priceToTick(2000, 18, 6, 1)
    expect(tick).toBe(-200312)
  })

  it('handles reverse cross-decimal dec0(6)/dec1(18)', () => {
    // USDC(6) as currency0, WETH(18) as currency1, price=0.0005
    // raw_price = 0.0005 * 10^(18-6) = 5e8, tick should be positive (~200311)
    const tick = priceToTick(0.0005, 6, 18, 1)
    expect(tick).toBe(200311)
  })

  it('priceToTick and tickToPrice are inverses for cross-decimal pairs', () => {
    const price = 2000
    const tick = priceToTick(price, 18, 6, 1)
    const recovered = tickToPrice(tick, 18, 6)
    expect(Math.abs(recovered - price) / price).toBeLessThan(0.001)
  })

  it('clamps to MIN_TICK for price <= 0', () => {
    const tick = priceToTick(0, 18, 18, 10)
    expect(tick).toBeLessThan(-800000)
  })

  it('negative ticks align to tickSpacing', () => {
    const tick = priceToTick(0.5, 18, 18, 60)
    // tick for 0.5 ≈ -6932, aligned to 60 → -6960
    expect(tick).toBeLessThan(0)
    expect(Math.abs(tick) % 60).toBe(0)
  })
})

describe('tickToPrice', () => {
  it('returns 1 for tick=0 with same decimals', () => {
    const price = tickToPrice(0, 18, 18)
    expect(price).toBeCloseTo(1, 5)
  })

  it('returns ~600 for tick≈63972 with same decimals', () => {
    const price = tickToPrice(63972, 18, 18)
    expect(price).toBeCloseTo(600, -1) // within ~1
  })

  it('is inverse of priceToTick (round-trip)', () => {
    const originalPrice = 600
    const tick = priceToTick(originalPrice, 18, 18, 1)
    const recoveredPrice = tickToPrice(tick, 18, 18)
    // Within 0.1% due to tick quantization
    expect(Math.abs(recoveredPrice - originalPrice) / originalPrice).toBeLessThan(0.001)
  })

  it('handles different decimals round-trip', () => {
    const price = 2000
    const tick = priceToTick(price, 18, 6, 1)
    const recovered = tickToPrice(tick, 18, 6)
    expect(Math.abs(recovered - price) / price).toBeLessThan(0.001)
  })
})

describe('calcAmount1FromAmount0', () => {
  it('returns 0 when amount0 is 0', () => {
    expect(calcAmount1FromAmount0(0, 600, -887270, 887270, 18, 18)).toBe(0)
  })

  it('returns 0 when price is 0', () => {
    expect(calcAmount1FromAmount0(1, 0, -887270, 887270, 18, 18)).toBe(0)
  })

  it('calculates amount1 for full range with same decimals', () => {
    // Full range: amount1 ≈ amount0 * price
    const amount1 = calcAmount1FromAmount0(0.05, 600, -887270, 887270, 18, 18)
    expect(amount1).toBeGreaterThan(0)
    // For full range, amount1 ≈ amount0 * price (approximately)
    expect(amount1).toBeGreaterThan(20) // should be around 30
    expect(amount1).toBeLessThan(40)
  })

  it('returns 0 when price is below range (all token0)', () => {
    // Current price = 100, but range is [200, 400] → price below range
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const amount1 = calcAmount1FromAmount0(1, 100, tickLower, tickUpper, 18, 18)
    expect(amount1).toBe(0)
  })

  it('returns 0 when price is above range (all token1, no token0 needed)', () => {
    // FIX: 价格高于范围时仓位不需要 token0，从 amount0 推算 amount1 应返回 0
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const amount1 = calcAmount1FromAmount0(1, 1000, tickLower, tickUpper, 18, 18)
    expect(amount1).toBe(0)
  })

  it('calculates correct amount1 for cross-decimal ETH(18)/USDC(6)', () => {
    // FIX: 验证跨精度代币对不会因 decimal 方向错误产生天文数字
    // 1 ETH = 2000 USDC, full range, amount0 = 1 ETH → amount1 ≈ 2000 USDC
    const amount1 = calcAmount1FromAmount0(1, 2000, -887270, 887270, 18, 6)
    // Full range at price=2000: amount1 ≈ price * amount0 = 2000
    // Tight check: relative error < 1% (BigInt truncation accounts for small difference)
    expect(Math.abs(amount1 - 2000) / 2000).toBeLessThan(0.01)
  })
})

describe('calcAmount0FromAmount1', () => {
  it('returns 0 when amount1 is 0', () => {
    expect(calcAmount0FromAmount1(0, 600, -887270, 887270, 18, 18)).toBe(0)
  })

  it('returns 0 when price is 0', () => {
    expect(calcAmount0FromAmount1(1, 0, -887270, 887270, 18, 18)).toBe(0)
  })

  it('calculates amount0 for full range with same decimals', () => {
    const amount0 = calcAmount0FromAmount1(30, 600, -887270, 887270, 18, 18)
    expect(amount0).toBeGreaterThan(0)
    // Full range at price=600: amount0 ≈ amount1/price ≈ 30/600 = 0.05
    expect(amount0).toBeGreaterThan(0.03)
    expect(amount0).toBeLessThan(0.1)
  })

  it('returns 0 when price is above range (all token1, no token0 needed)', () => {
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const amount0 = calcAmount0FromAmount1(1, 1000, tickLower, tickUpper, 18, 18)
    expect(amount0).toBe(0)
  })

  it('returns 0 when price is below range (all token0, no token1 needed)', () => {
    // FIX: 价格低于范围时仓位不需要 token1，从 amount1 推算 amount0 应返回 0
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const amount0 = calcAmount0FromAmount1(1, 100, tickLower, tickUpper, 18, 18)
    expect(amount0).toBe(0)
  })

  it('is approximately inverse of calcAmount1FromAmount0', () => {
    const originalAmount0 = 0.05
    const price = 600
    const amount1 = calcAmount1FromAmount0(originalAmount0, price, -887270, 887270, 18, 18)
    const recoveredAmount0 = calcAmount0FromAmount1(amount1, price, -887270, 887270, 18, 18)
    // Allow 1% tolerance due to BigInt integer division truncation
    expect(Math.abs(recoveredAmount0 - originalAmount0) / originalAmount0).toBeLessThan(0.01)
  })

  it('handles narrow range', () => {
    // Custom range [400, 800] around price 600, same decimals
    const tickLower = priceToTick(400, 18, 18, 60)
    const tickUpper = priceToTick(800, 18, 18, 60)
    const amount0 = calcAmount0FromAmount1(200, 600, tickLower, tickUpper, 18, 18)
    expect(amount0).toBeGreaterThan(0)
  })

  it('calculates correct amount0 for cross-decimal ETH(18)/USDC(6)', () => {
    // FIX: 验证跨精度代币对反向计算
    // 2000 USDC → ~1 ETH at price=2000, full range
    const amount0 = calcAmount0FromAmount1(2000, 2000, -887270, 887270, 18, 6)
    // Tight check: relative error < 1%
    expect(Math.abs(amount0 - 1) / 1).toBeLessThan(0.01)
  })

  it('cross-decimal roundtrip: calcAmount0 ↔ calcAmount1 consistency', () => {
    // ETH(18)/USDC(6) full range at price=2000
    const originalAmount0 = 1
    const amount1 = calcAmount1FromAmount0(originalAmount0, 2000, -887270, 887270, 18, 6)
    const recoveredAmount0 = calcAmount0FromAmount1(amount1, 2000, -887270, 887270, 18, 6)
    // Roundtrip should be within 1% due to BigInt integer division truncation
    expect(Math.abs(recoveredAmount0 - originalAmount0) / originalAmount0).toBeLessThan(0.01)
  })
})

describe('getLiquidityForAmounts', () => {
  it('returns positive liquidity for valid inputs', () => {
    // 0.05 BNB + 30 TEST at price 600, full range, both 18 decimals
    const amount0 = 50000000000000000n  // 0.05 ether
    const amount1 = 30000000000000000000n // 30 ether
    const liq = getLiquidityForAmounts(amount0, amount1, 600, -887270, 887270, 18, 18)
    expect(liq).toBeGreaterThan(0n)
  })

  it('liquidity is NOT equal to amount0', () => {
    // This was the bug — liquidity is a different concept from token amount
    const amount0 = 50000000000000000n
    const amount1 = 30000000000000000000n
    const liq = getLiquidityForAmounts(amount0, amount1, 600, -887270, 887270, 18, 18)
    expect(liq).not.toBe(amount0)
    expect(liq).not.toBe(amount1)
  })

  it('returns 0 for zero amounts', () => {
    const liq = getLiquidityForAmounts(0n, 0n, 600, -887270, 887270, 18, 18)
    expect(liq).toBe(0n)
  })

  it('higher amounts produce higher liquidity', () => {
    const liq1 = getLiquidityForAmounts(
      50000000000000000n, 30000000000000000000n,
      600, -887270, 887270, 18, 18,
    )
    const liq2 = getLiquidityForAmounts(
      100000000000000000n, 60000000000000000000n,
      600, -887270, 887270, 18, 18,
    )
    expect(liq2).toBeGreaterThan(liq1)
  })

  it('narrower range produces higher liquidity for same amounts', () => {
    const amount0 = 50000000000000000n
    const amount1 = 30000000000000000000n
    const liqWide = getLiquidityForAmounts(amount0, amount1, 600, -887270, 887270, 18, 18)
    // Custom range around price 600: [400, 800]
    const tickLower = priceToTick(400, 18, 18, 60)
    const tickUpper = priceToTick(800, 18, 18, 60)
    const liqNarrow = getLiquidityForAmounts(amount0, amount1, 600, tickLower, tickUpper, 18, 18)
    expect(liqNarrow).toBeGreaterThan(liqWide)
  })

  it('handles price below range (only token0)', () => {
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    // price=100, below range
    const liq = getLiquidityForAmounts(1000000000000000000n, 0n, 100, tickLower, tickUpper, 18, 18)
    expect(liq).toBeGreaterThan(0n)
  })

  it('handles price above range (only token1)', () => {
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    // price=1000, above range
    const liq = getLiquidityForAmounts(0n, 1000000000000000000n, 1000, tickLower, tickUpper, 18, 18)
    expect(liq).toBeGreaterThan(0n)
  })

  it('handles cross-decimal ETH(18)/USDC(6) full range', () => {
    // FIX: 验证跨精度对 getLiquidityForAmounts 的 decimal 方向正确
    // 1 ETH (1e18 wei) + 2000 USDC (2000e6 wei), price=2000, full range
    const amount0 = 1000000000000000000n    // 1 ETH
    const amount1 = 2000000000n             // 2000 USDC (6 decimals)
    const liq = getLiquidityForAmounts(amount0, amount1, 2000, -887270, 887270, 18, 6)
    // Precise expected value: 44721359549995
    // Verify within 0.01% to catch decimal direction errors (wrong direction → orders of magnitude off)
    const expected = 44721359549995n
    const diff = liq > expected ? liq - expected : expected - liq
    expect(Number(diff) / Number(expected)).toBeLessThan(0.0001)
  })

  it('handles reverse cross-decimal USDC(6)/WETH(18) full range', () => {
    // dec0=6, dec1=18: validates the decDiff > 0 branch (dec1-dec0 = 12)
    // 2000 USDC (2000e6 wei) + 1 WETH (1e18 wei), price=0.0005 (1 USDC = 0.0005 WETH)
    const amount0 = 2000000000n             // 2000 USDC (6 decimals)
    const amount1 = 1000000000000000000n    // 1 WETH (18 decimals)
    const liq = getLiquidityForAmounts(amount0, amount1, 0.0005, -887270, 887270, 6, 18)
    expect(liq).toBeGreaterThan(0n)
    // Should be similar order of magnitude to the ETH/USDC case above
    expect(liq).toBeGreaterThan(1000000000000n)   // > 1e12
    expect(liq).toBeLessThan(1000000000000000n)   // < 1e15
  })
})

describe('getLiquidityForAmounts — precision', () => {
  it('handles large wei amounts (100 ETH) without Number truncation', () => {
    // 100 ETH = 1e20 wei > Number.MAX_SAFE_INTEGER (9.007e15)
    const amount0 = 100000000000000000000n
    const amount1 = 60000000000000000000000n
    const liq = getLiquidityForAmounts(amount0, amount1, 600, -887270, 887270, 18, 18)
    expect(liq).toBeGreaterThan(0n)
  })

  it('2x amounts produce ~2x liquidity (proportionality)', () => {
    const amount0 = 100000000000000000000n  // 100 ETH
    const amount1 = 60000000000000000000000n
    const liq1 = getLiquidityForAmounts(amount0, amount1, 600, -887270, 887270, 18, 18)
    const liq2 = getLiquidityForAmounts(amount0 * 2n, amount1 * 2n, 600, -887270, 887270, 18, 18)
    const ratio = Number(liq2) / Number(liq1)
    expect(ratio).toBeGreaterThan(1.999)
    expect(ratio).toBeLessThan(2.001)
  })

  it('distinguishes amounts near MAX_SAFE_INTEGER boundary', () => {
    // Number(9007199254740991n) === Number(9007199254740993n) — both truncate to same float.
    // BigNumber must preserve the difference.
    const safeAmount = 9007199254740991n     // Number.MAX_SAFE_INTEGER
    const unsafeAmount = 9007199254740993n   // MAX_SAFE_INTEGER + 2
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const liqSafe = getLiquidityForAmounts(safeAmount, 0n, 100, tickLower, tickUpper, 18, 18)
    const liqUnsafe = getLiquidityForAmounts(unsafeAmount, 0n, 100, tickLower, tickUpper, 18, 18)
    expect(liqUnsafe).toBeGreaterThan(liqSafe)
  })

  it('handles extreme ticks (full range) without NaN or Infinity', () => {
    const liq = getLiquidityForAmounts(
      1000000000000000000n, 600000000000000000000n,
      600, -887270, 887270, 18, 18,
    )
    expect(liq).toBeGreaterThan(0n)
    expect(liq).toBeLessThan(BigInt('999999999999999999999999999999999999'))
  })
})

describe('buildMintMulticallData', () => {
  const params = {
    currency0: '0x0000000000000000000000000000000000000000' as const,
    currency1: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' as const,
    fee: 500,
    tickSpacing: 10,
    hooks: '0xb0BfF4fc6E3e6697F57D8bab1d9bb1A5F1212880' as const,
    tickLower: -887270,
    tickUpper: 887270,
    liquidity: 50000000000000000n,
    amount0Max: 50000000000000000n,
    amount1Max: 30000000000000000000n,
    recipient: '0xEe7b429Ea01F76102f053213463D4e95D5D24AE8' as const,
    deadline: 1775260860n,
  }

  it('returns calldata as hex string', () => {
    const { calldata } = buildMintMulticallData(params)
    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBeGreaterThan(100)
  })

  it('starts with multicall function selector (0xac9650d8)', () => {
    const { calldata } = buildMintMulticallData(params)
    expect(calldata.slice(0, 10)).toBe('0xac9650d8')
  })

  it('sets value to amount0Max when currency0 is native', () => {
    const { value } = buildMintMulticallData(params)
    expect(value).toBe(50000000000000000n)
  })

  it('sets value to 0 when currency0 is not native', () => {
    const { value } = buildMintMulticallData({
      ...params,
      currency0: '0x1111111111111111111111111111111111111111',
    })
    expect(value).toBe(0n)
  })

  it('contains modifyLiquidities selector (0xdd46508f) in inner call', () => {
    const { calldata } = buildMintMulticallData(params)
    // modifyLiquidities selector should appear somewhere in the calldata
    expect(calldata.toLowerCase()).toContain('dd46508f')
  })

  it('produces deterministic output', () => {
    const r1 = buildMintMulticallData(params)
    const r2 = buildMintMulticallData(params)
    expect(r1.calldata).toBe(r2.calldata)
    expect(r1.value).toBe(r2.value)
  })
})

const Q96 = 1n << 96n
const MIN_SQRT_RATIO = 4295128739n
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

describe('mostSignificantBit', () => {
  it('returns 0 for 1', () => {
    expect(mostSignificantBit(1n)).toBe(0)
  })

  it('returns correct MSB for powers of 2', () => {
    expect(mostSignificantBit(2n)).toBe(1)
    expect(mostSignificantBit(4n)).toBe(2)
    expect(mostSignificantBit(8n)).toBe(3)
    expect(mostSignificantBit(128n)).toBe(7)
    expect(mostSignificantBit(256n)).toBe(8)
  })

  it('returns correct MSB for non-power-of-2 values', () => {
    expect(mostSignificantBit(3n)).toBe(1)    // 11 → MSB at bit 1
    expect(mostSignificantBit(5n)).toBe(2)    // 101 → MSB at bit 2
    expect(mostSignificantBit(255n)).toBe(7)  // 11111111 → MSB at bit 7
  })

  it('handles large boundary values', () => {
    expect(mostSignificantBit(1n << 64n)).toBe(64)
    expect(mostSignificantBit(1n << 128n)).toBe(128)
    expect(mostSignificantBit(1n << 255n)).toBe(255)
  })

  it('handles values just below power-of-2 boundaries', () => {
    // 2^128 - 1: all 128 bits set, MSB at bit 127
    expect(mostSignificantBit((1n << 128n) - 1n)).toBe(127)
    // 2^64 - 1: all 64 bits set, MSB at bit 63
    expect(mostSignificantBit((1n << 64n) - 1n)).toBe(63)
  })
})

describe('getSqrtRatioAtTick', () => {
  it('returns 2^96 for tick=0', () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96)
  })

  it('returns correct value for tick=1', () => {
    const result = getSqrtRatioAtTick(1)
    expect(result).toBeGreaterThan(Q96)
    // sqrtRatio at tick=1 ≈ Q96 * sqrt(1.0001) ≈ Q96 * 1.00005
    // Allow small range check
    expect(result - Q96).toBeGreaterThan(0n)
    expect(result - Q96).toBeLessThan(Q96 / 10000n)
  })

  it('returns correct value for tick=-1', () => {
    const result = getSqrtRatioAtTick(-1)
    expect(result).toBeLessThan(Q96)
    expect(Q96 - result).toBeGreaterThan(0n)
    expect(Q96 - result).toBeLessThan(Q96 / 10000n)
  })

  it('positive and negative ticks are reciprocals', () => {
    // getSqrtRatio(tick) * getSqrtRatio(-tick) ≈ Q96^2
    for (const tick of [1, 100, 1000, 63972]) {
      const pos = getSqrtRatioAtTick(tick)
      const neg = getSqrtRatioAtTick(-tick)
      const product = pos * neg
      const q96sq = Q96 * Q96
      // Allow 0.01% relative error due to rounding
      const relError = Number(product > q96sq ? product - q96sq : q96sq - product) / Number(q96sq)
      expect(relError).toBeLessThan(0.0001)
    }
  })

  it('handles MAX_TICK (887272)', () => {
    const result = getSqrtRatioAtTick(887272)
    expect(result).toBeGreaterThan(0n)
    // MAX_TICK maps to MAX_SQRT_RATIO exactly (with rounding up in Q96 conversion)
    expect(result).toBeLessThanOrEqual(MAX_SQRT_RATIO)
  })

  it('handles MIN_TICK (-887272)', () => {
    const result = getSqrtRatioAtTick(-887272)
    expect(result).toBeGreaterThan(0n)
    // Should be close to but not below MIN_SQRT_RATIO
    expect(result).toBeGreaterThanOrEqual(MIN_SQRT_RATIO)
  })

  it('throws for tick > MAX_TICK', () => {
    expect(() => getSqrtRatioAtTick(887273)).toThrow('tick out of range')
  })

  it('throws for tick < -MAX_TICK', () => {
    expect(() => getSqrtRatioAtTick(-887273)).toThrow('tick out of range')
  })

  it('is monotonically increasing', () => {
    const ticks = [-887272, -100000, -1000, -1, 0, 1, 1000, 100000, 887272]
    for (let i = 1; i < ticks.length; i++) {
      expect(getSqrtRatioAtTick(ticks[i])).toBeGreaterThan(getSqrtRatioAtTick(ticks[i - 1]))
    }
  })

  it('matches known value for tick=63972 (BNB=600 TEST)', () => {
    // Known sqrtPriceX96 for 1 BNB = 600 TEST (from sqrtPrice.test.ts)
    const expected = 1940685714182491852533977682922n
    const result = getSqrtRatioAtTick(63972)
    // Should be close but not necessarily exact (tick is quantized)
    const relError = Number(result > expected ? result - expected : expected - result) / Number(expected)
    expect(relError).toBeLessThan(0.0001)
  })
})

describe('getTickAtSqrtRatio', () => {
  it('returns 0 for sqrtPriceX96 = 2^96', () => {
    expect(getTickAtSqrtRatio(Q96)).toBe(0)
  })

  it('returns -887272 for MIN_SQRT_RATIO', () => {
    expect(getTickAtSqrtRatio(MIN_SQRT_RATIO)).toBe(-887272)
  })

  it('returns 887271 for MAX_SQRT_RATIO - 1', () => {
    // MAX_SQRT_RATIO - 1 is the largest valid sqrtPriceX96
    expect(getTickAtSqrtRatio(MAX_SQRT_RATIO - 1n)).toBe(887271)
  })

  it('throws for sqrtPriceX96 < MIN_SQRT_RATIO', () => {
    expect(() => getTickAtSqrtRatio(MIN_SQRT_RATIO - 1n)).toThrow('out of range')
    expect(() => getTickAtSqrtRatio(0n)).toThrow('out of range')
  })

  it('throws for sqrtPriceX96 >= MAX_SQRT_RATIO', () => {
    expect(() => getTickAtSqrtRatio(MAX_SQRT_RATIO)).toThrow('out of range')
    expect(() => getTickAtSqrtRatio(MAX_SQRT_RATIO + 1n)).toThrow('out of range')
  })

  it('is inverse of getSqrtRatioAtTick', () => {
    // For any tick t, getTickAtSqrtRatio(getSqrtRatioAtTick(t)) === t
    // Exclude MAX_TICK (887272) because getSqrtRatioAtTick(887272) equals MAX_SQRT_RATIO,
    // which is out of range for getTickAtSqrtRatio (requires < MAX_SQRT_RATIO)
    for (const tick of [-887272, -100000, -1000, -1, 0, 1, 1000, 100000, 887271]) {
      const sqrtRatio = getSqrtRatioAtTick(tick)
      expect(getTickAtSqrtRatio(sqrtRatio)).toBe(tick)
    }
  })

  it('getSqrtRatioAtTick(getTickAtSqrtRatio(x)) <= x', () => {
    // getTickAtSqrtRatio floors, so getSqrtRatioAtTick(result) should be <= input
    const testValues = [
      MIN_SQRT_RATIO,
      Q96 / 2n,
      Q96,
      Q96 * 2n,
      Q96 * 100n,
      MAX_SQRT_RATIO - 1n,
    ]
    for (const sqrtP of testValues) {
      const tick = getTickAtSqrtRatio(sqrtP)
      const recovered = getSqrtRatioAtTick(tick)
      expect(recovered).toBeLessThanOrEqual(sqrtP)
    }
  })

  it('handles common DeFi price sqrtPriceX96 values', () => {
    // BNB=600 TEST: known sqrtPriceX96 = 1940685714182491852533977682922
    const tick = getTickAtSqrtRatio(1940685714182491852533977682922n)
    expect(tick).toBe(63972)
  })
})

describe('priceToTick — alignment after clamp', () => {
  it('returns tickSpacing-aligned tick even at extreme negative prices', () => {
    // Very small price forces tick near -MAX_TICK, clamp must preserve alignment
    for (const tickSpacing of [1, 10, 60, 200]) {
      const tick = priceToTick(1e-30, 18, 18, tickSpacing)
      // Use Math.abs to handle -0 from JS modulo on negative numbers
      expect(Math.abs(tick % tickSpacing)).toBe(0)
      expect(tick).toBeLessThan(0)
    }
  })

  it('returns tickSpacing-aligned tick at price=0 boundary', () => {
    for (const tickSpacing of [1, 10, 60, 200]) {
      const tick = priceToTick(0, 18, 18, tickSpacing)
      expect(Math.abs(tick % tickSpacing)).toBe(0)
    }
  })

  it('clamped tick matches getFullRangeTicks boundary', () => {
    // After clamp, the minimum tick should equal -getFullRangeTicks.tickUpper
    for (const tickSpacing of [10, 60, 200]) {
      const { tickLower } = getFullRangeTicks(tickSpacing)
      const tick = priceToTick(0, 18, 18, tickSpacing)
      expect(tick).toBe(tickLower)
    }
  })

  it('returns tickSpacing-aligned tick at extremely large prices', () => {
    for (const tickSpacing of [1, 10, 60, 200]) {
      const tick = priceToTick(1e30, 18, 18, tickSpacing)
      expect(Math.abs(tick % tickSpacing)).toBe(0)
      expect(tick).toBeGreaterThan(0)
    }
  })

  it('cross-decimal extreme price still aligns', () => {
    // ETH(18)/USDC(6) with extreme price
    for (const tickSpacing of [10, 60]) {
      const tick = priceToTick(1e-20, 18, 6, tickSpacing)
      expect(Math.abs(tick % tickSpacing)).toBe(0)
    }
  })
})
