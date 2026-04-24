import { HOOK_CONFIGS } from './hooks'
import { ZERO_ADDR } from './contracts'

export type PoolDefaults = {
  hooks: string
  tokenA: string
  tokenB: string
  fee: string
  price: string
  amountA: string
  slippage: string
}

// FIX: 从 AddLiquidity.tsx 提取到 config/ 集中管理。业务配置（默认 token 地址、fee、price）
// 不应散布在 633 行的 UI 组件中，修改默认值时应在配置文件中一目了然地找到。
export const POOL_DEFAULTS: Record<number, PoolDefaults> = {
  // BSC — hook 地址从 HOOK_CONFIGS 读取，避免与 hooks.ts 重复定义导致更新遗漏
  56: {
    hooks: HOOK_CONFIGS['uni-v4'].defaultAddresses[56] ?? ZERO_ADDR,
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487',
    fee: '500', price: '600', amountA: '0.05', slippage: '0.1',
  },
  // Ethereum
  1: {
    hooks: '0x0000000000000000000000000000000000000000',
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fee: '500', price: '2000', amountA: '0.01', slippage: '0.1',
  },
  // Base
  8453: {
    hooks: HOOK_CONFIGS['uni-v4'].defaultAddresses[8453] ?? ZERO_ADDR,
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fee: '500', price: '2000', amountA: '0.01', slippage: '0.1',
  },
  // Arbitrum
  42161: {
    hooks: HOOK_CONFIGS['uni-v4'].defaultAddresses[42161] ?? ZERO_ADDR,
    tokenA: '0x0000000000000000000000000000000000000000',
    tokenB: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    fee: '500', price: '2000', amountA: '0.01', slippage: '0.1',
  },
}

export const DEFAULT_POOL_DEFAULTS = POOL_DEFAULTS[56]
