import type { Address } from 'viem'

export type ChainConfig = {
  positionManager: Address
  permit2: Address
  explorerUrl: string
  nativeSymbol: string
  positionsUrl: string // Uniswap positions page
}

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  // BSC
  56: {
    positionManager: '0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    positionsUrl: 'https://app.uniswap.org/positions?chain=bnb',
  },
  // Ethereum
  1: {
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    positionsUrl: 'https://app.uniswap.org/positions?chain=ethereum',
  },
  // Base
  8453: {
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    positionsUrl: 'https://app.uniswap.org/positions?chain=base',
  },
}

export const DEFAULT_CHAIN_ID = 56

export function getChainConfig(chainId: number | undefined): ChainConfig {
  return CHAIN_CONFIG[chainId ?? DEFAULT_CHAIN_ID] ?? CHAIN_CONFIG[DEFAULT_CHAIN_ID]
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
