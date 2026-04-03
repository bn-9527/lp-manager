import { describe, it, expect } from 'vitest'
import {
  feeToTickSpacing,
  getFullRangeTicks,
  priceToTick,
  tickToPrice,
  calcAmount1FromAmount0,
  getLiquidityForAmounts,
  buildMintMulticallData,
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
    // 1 WETH (18 dec) = 2000 USDC (6 dec)
    // adjusted price = 2000 * 10^(18-6) = 2000 * 10^12
    const tick = priceToTick(2000, 18, 6, 1)
    expect(tick).toBeGreaterThan(0)
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

  it('returns price-proportional when price is above range (all token1)', () => {
    // Current price = 1000, but range is [200, 400] → price above range
    const tickLower = priceToTick(200, 18, 18, 1)
    const tickUpper = priceToTick(400, 18, 18, 1)
    const amount1 = calcAmount1FromAmount0(1, 1000, tickLower, tickUpper, 18, 18)
    expect(amount1).toBeCloseTo(1000, -1)
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
    hooks: '0xb0B41e49082B9Ae0fFc6387abf3690cAfF972880' as const,
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
