// Extracted from SqrtPriceX96.tsx for testability

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
  const poolPriceFloat = isSwapped
    ? (1 / userPrice) * Math.pow(10, dec0 - dec1)
    : userPrice * Math.pow(10, dec0 - dec1)

  try {
    const parts = priceStr.split('.')
    const intPart = parts[0] || '0'
    const fracPart = parts[1] || ''
    const priceBig = BigInt(intPart + fracPart)
    const priceScale = BigInt('1' + '0'.repeat(fracPart.length))

    const Q192 = 1n << 192n
    let numerator: bigint
    let denominator: bigint

    if (isSwapped) {
      numerator = priceScale * Q192
      denominator = priceBig
    } else {
      numerator = priceBig * Q192
      denominator = priceScale
    }

    const decDiff = dec0 - dec1
    if (decDiff > 0) {
      numerator = numerator * 10n ** BigInt(decDiff)
    } else if (decDiff < 0) {
      denominator = denominator * 10n ** BigInt(-decDiff)
    }

    const sqrtPriceX96 = bigIntSqrt(numerator / denominator)
    const tick = Math.floor(Math.log(poolPriceFloat) / Math.log(1.0001))

    return {
      isSwapped, sym0, sym1, poolPriceFloat, sqrtPriceX96,
      sqrtPriceX96Hex: '0x' + sqrtPriceX96.toString(16),
      tick, symA, symB, priceStr,
    }
  } catch (e) {
    return {
      isSwapped, sym0, sym1, poolPriceFloat, sqrtPriceX96: 0n,
      sqrtPriceX96Hex: '', tick: 0, symA, symB, priceStr,
      error: (e as Error).message,
    }
  }
}
