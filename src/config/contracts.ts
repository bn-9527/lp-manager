import type { Address } from 'viem'

export type ChainConfig = {
  positionManager: Address
  permit2: Address
  stateView: Address // Uniswap V4 StateView — reads pool slot0 (sqrtPriceX96, tick, fees)
  explorerUrl: string
  nativeSymbol: string
  positionsUrl: string // Uniswap positions page
}

// CHAIN_CONFIG is the single source of truth for supported chains.
// When adding a chain: 1) add entry here, 2) add chain object to the local maps
// in wagmi.ts (appkit networks) and ConnectButton.tsx (wagmi/chains).
export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  // BSC
  56: {
    positionManager: '0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    positionsUrl: 'https://app.uniswap.org/positions?chain=bnb',
  },
  // Ethereum
  1: {
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    positionsUrl: 'https://app.uniswap.org/positions?chain=ethereum',
  },
  // Base
  8453: {
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    positionsUrl: 'https://app.uniswap.org/positions?chain=base',
  },
}

export const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const

export const DEFAULT_CHAIN_ID = 56

export function getChainConfig(chainId: number | undefined): ChainConfig {
  return CHAIN_CONFIG[chainId ?? DEFAULT_CHAIN_ID] ?? CHAIN_CONFIG[DEFAULT_CHAIN_ID]
}

// FIX: 统一的支持链 ID 列表，避免在 wagmi.ts/ConnectButton.tsx/contracts.ts 三处分别定义。
// 显式列出而非 Object.keys() 派生，因为 JS 对数字键按升序排列（1,56,8453），
// 而业务需要 BSC 优先（56 在最前）的顺序，该顺序决定 wagmi 默认链和 UI 下拉列表排序。
export const SUPPORTED_CHAIN_IDS: number[] = [56, 1, 8453]

export function isChainSupported(chainId: number | undefined): boolean {
  return chainId !== undefined && chainId in CHAIN_CONFIG
}

export function explorerAddress(chainId: number | undefined, address: string) {
  return `${getChainConfig(chainId).explorerUrl}/address/${address}`
}

export function explorerTx(chainId: number | undefined, hash: string) {
  return `${getChainConfig(chainId).explorerUrl}/tx/${hash}`
}

export function explorerNftPositions(chainId: number | undefined, owner: string) {
  const chainConfig = getChainConfig(chainId)
  return `${chainConfig.explorerUrl}/token/${chainConfig.positionManager}?a=${owner}`
}

export const positionManagerAbi = [
  { name: 'multicall', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ name: 'results', type: 'bytes[]' }] },
  { name: 'modifyLiquidities', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'unlockData', type: 'bytes' }, { name: 'deadline', type: 'uint256' }], outputs: [] },
] as const

export const permit2Abi = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' },
             { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
] as const

// Uniswap V4 StateView — read pool state without modifying it
export const stateViewAbi = [
  { name: 'getSlot0', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ] },
] as const

export const erc20Abi = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const
