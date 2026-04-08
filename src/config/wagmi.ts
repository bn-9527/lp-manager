import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit'
import { bsc, mainnet, base } from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'
import { SUPPORTED_CHAIN_IDS } from './contracts'

const projectId = import.meta.env.VITE_WC_PROJECT_ID || 'fe525a3fb7824f87c529d0935853cc2d'
// FIX: 硬编码 fallback 用于开发，生产环境应通过 VITE_WC_PROJECT_ID env 注入
if (!import.meta.env.VITE_WC_PROJECT_ID && import.meta.env.PROD) {
  console.warn('[wagmi] VITE_WC_PROJECT_ID not set — using shared fallback projectId. Set your own for production.')
}
// FIX: 链列表从 SUPPORTED_CHAIN_IDS (contracts.ts CHAIN_CONFIG) 派生，
// 避免与 ConnectButton.tsx 和 contracts.ts 三处独立硬编码导致新增链时遗漏。
const APPKIT_CHAIN_MAP = { 56: bsc, 1: mainnet, 8453: base } as const
const networks = SUPPORTED_CHAIN_IDS
  .filter((id): id is keyof typeof APPKIT_CHAIN_MAP => id in APPKIT_CHAIN_MAP)
  .map(id => APPKIT_CHAIN_MAP[id])

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  // OKX Wallet 的 WalletConnect Explorer ID，从 AppKit modal 钱包列表中排除
  excludeWalletIds: ['971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709'],
  metadata: {
    name: 'V4 LP Manager',
    description: 'Uniswap V4 Liquidity Manager',
    url: 'https://williamlll.github.io/lp-manager',
    icons: [],
  },
  themeMode: 'dark',
})

export const config = wagmiAdapter.wagmiConfig
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // FIX: 区块链数据按区块更新（BSC ~3s），设置 staleTime 避免组件挂载时重复请求 RPC
      staleTime: 5_000,
      // FIX: 区块链数据按区块更新而非按 tab 切换更新。禁止 window focus 时自动 refetch，
      // 避免切换 tab 回来时 10-20+ 个 useReadContract 查询同时触发 RPC 请求风暴，
      // 对公共 RPC 节点造成速率限制压力。数据刷新由 staleTime 和交易确认后的手动 invalidate 驱动。
      refetchOnWindowFocus: false,
    },
  },
})
