import { describe, it, expect } from 'vitest'
import { getChainConfig, isChainSupported, explorerAddress, explorerTx, explorerNftPositions, CHAIN_CONFIG } from '../contracts'

describe('getChainConfig', () => {
  it('returns BSC config for chain 56', () => {
    const cfg = getChainConfig(56)
    expect(cfg.nativeSymbol).toBe('BNB')
    expect(cfg.explorerUrl).toBe('https://bscscan.com')
  })

  it('returns Ethereum config for chain 1', () => {
    const cfg = getChainConfig(1)
    expect(cfg.nativeSymbol).toBe('ETH')
    expect(cfg.explorerUrl).toBe('https://etherscan.io')
  })

  it('returns Base config for chain 8453', () => {
    const cfg = getChainConfig(8453)
    expect(cfg.nativeSymbol).toBe('ETH')
    expect(cfg.explorerUrl).toBe('https://basescan.org')
  })

  it('falls back to BSC for undefined chainId', () => {
    expect(getChainConfig(undefined)).toBe(CHAIN_CONFIG[56])
  })

  it('falls back to BSC for unsupported chainId', () => {
    expect(getChainConfig(999)).toBe(CHAIN_CONFIG[56])
  })
})

describe('isChainSupported', () => {
  it('returns true for supported chains', () => {
    expect(isChainSupported(56)).toBe(true)
    expect(isChainSupported(1)).toBe(true)
    expect(isChainSupported(8453)).toBe(true)
  })

  it('returns false for unsupported chains', () => {
    expect(isChainSupported(999)).toBe(false)
    expect(isChainSupported(undefined)).toBe(false)
  })
})

describe('explorer URL helpers', () => {
  it('explorerAddress builds correct URL', () => {
    expect(explorerAddress(56, '0xABC')).toBe('https://bscscan.com/address/0xABC')
    expect(explorerAddress(1, '0xDEF')).toBe('https://etherscan.io/address/0xDEF')
  })

  it('explorerTx builds correct URL', () => {
    expect(explorerTx(56, '0xTX')).toBe('https://bscscan.com/tx/0xTX')
  })

  it('explorerNftPositions builds correct URL with PositionManager address', () => {
    const url = explorerNftPositions(56, '0xOwner')
    expect(url).toContain('0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b')
    expect(url).toContain('a=0xOwner')
  })
})
