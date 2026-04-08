import { encodeAbiParameters, encodeFunctionData, type Hex, type Address } from 'viem'
import BigNumber from 'bignumber.js'
import { positionManagerAbi } from '../config/contracts'
import { numberToBigFraction, priceToSqrtPriceX96, getSqrtRatioAtTick, MAX_TICK } from './math'

// Re-export TickMath functions from math.ts for backward compatibility.
// These were moved from encoder.ts to math.ts to resolve the misplaced module concern
// (pure math functions don't belong in an ABI encoding module) and to break the
// sqrtPrice.ts -> encoder.ts dependency.
export { getSqrtRatioAtTick, getTickAtSqrtRatio, mostSignificantBit, tickToPrice, priceToTick, MAX_TICK } from './math'

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
  // FIX: tickLower >= tickUpper 会导致链上 PositionManager revert 浪费 gas，
  // 在前端编码前就校验，给用户友好的错误提示
  if (params.tickLower >= params.tickUpper) throw new Error('tickLower must be less than tickUpper')
  // FIX: currency0 === currency1 在链上不合法，防御性校验
  if (params.currency0.toLowerCase() === params.currency1.toLowerCase()) throw new Error('currency0 and currency1 must be different')
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

/**
 * Calculate full-range tick bounds aligned to the given tickSpacing.
 */
export function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const tickUpper = MAX_TICK - (MAX_TICK % tickSpacing)
  return { tickLower: -tickUpper, tickUpper }
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

  // FIX: 原实现用 Number(wei * 10^12 / 10^dec) / 1e12，大额场景（如百万 USDC LP）
  // wei * 10^12 超过 Number.MAX_SAFE_INTEGER 导致精度丢失。改用 BigNumber.js 做除法。
  return new BigNumber(amount1Wei.toString())
    .div(new BigNumber(10).pow(dec1))
    .toNumber()
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

  // FIX: 原实现用 Number(wei * 10^12 / 10^dec) / 1e12，大额场景超 MAX_SAFE_INTEGER。
  // 改用 BigNumber.js 做除法，精度不受 Number 限制。
  return new BigNumber(amount0Wei.toString())
    .div(new BigNumber(10).pow(dec0))
    .toNumber()
}
