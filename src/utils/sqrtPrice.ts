// Core sqrtPriceX96 calculation logic, shared by SqrtPriceX96 tool component and other modules
import BigNumber from 'bignumber.js'
import { priceToSqrtPriceX96 } from './math'
import { getTickAtSqrtRatio } from './encoder'
export { bigIntSqrt } from './math'

export interface SqrtPriceResult {
  isSwapped: boolean
  sym0: string
  sym1: string
  poolPriceFloat: number
  sqrtPriceX96: bigint
  sqrtPriceX96Hex: string
  tick: number
  symA: string
  symB: string
  priceStr: string
  error?: string
}

export function calculateSqrtPriceX96(
  addrA: string, addrB: string,
  decA: number, decB: number,
  symA: string, symB: string,
  priceStr: string,
): SqrtPriceResult | null {
  if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) return null

  let isSwapped: boolean
  if (addrA && addrB) {
    isSwapped = addrA.toLowerCase() > addrB.toLowerCase()
  } else {
    isSwapped = false
  }

  const dec0 = isSwapped ? decB : decA
  const dec1 = isSwapped ? decA : decB
  const sym0 = isSwapped ? symB : symA
  const sym1 = isSwapped ? symA : symB

  const userPrice = Number(priceStr)

  try {
    // FIX: reuse priceToSqrtPriceX96 from math.ts instead of duplicating BigInt math here.
    // When isSwapped, use the `invert` param for lossless BigInt fraction swap (no float 1/price).
    const sqrtPriceX96 = priceToSqrtPriceX96(userPrice, dec0, dec1, isSwapped)
    // FIX: 原实现用浮点 Math.log 计算 tick 与 BigInt 的 sqrtPriceX96 来自不同计算路径，
    // 跨精度代币对可能产生 +/-1 tick 偏差。改用 getTickAtSqrtRatio 从 sqrtPriceX96 精确反推，
    // 保证 tick 和 sqrtPriceX96 完全一致。
    const tick = getTickAtSqrtRatio(sqrtPriceX96)
    // FIX: 原实现 Number(sqrtPriceX96) 在 sqrtPriceX96 > 2^53 时丢失精度（uint160 最大 2^160），
    // 导致 UI 显示的反算价格与实际严重偏差。改用 bignumber.js 做高精度浮点运算。
    // 公式: price = (sqrtPriceX96 / 2^96)^2 * 10^(dec0 - dec1)
    const bnSqrt = new BigNumber(sqrtPriceX96.toString())
    const bnQ96 = new BigNumber(2).pow(96)
    const ratio = bnSqrt.div(bnQ96)
    const poolPriceFloat = ratio.times(ratio)
      .times(new BigNumber(10).pow(dec0 - dec1))
      .toNumber()

    return {
      isSwapped, sym0, sym1, poolPriceFloat, sqrtPriceX96,
      sqrtPriceX96Hex: '0x' + sqrtPriceX96.toString(16),
      tick, symA, symB, priceStr,
    }
  } catch (e) {
    // FIX: poolPriceFloat 在 try 块内通过 const 声明，catch 块无法访问（ReferenceError）。
    // 错误路径中 poolPriceFloat 无意义，使用 0 作为降级值。
    return {
      isSwapped, sym0, sym1, poolPriceFloat: 0, sqrtPriceX96: 0n,
      sqrtPriceX96Hex: '', tick: 0, symA, symB, priceStr,
      error: (e as Error).message,
    }
  }
}
