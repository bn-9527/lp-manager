import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit'
import { bsc, mainnet, base } from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'

const projectId = import.meta.env.VITE_WC_PROJECT_ID || 'fe525a3fb7824f87c529d0935853cc2d'
const networks: [typeof bsc, typeof mainnet, typeof base] = [bsc, mainnet, base]

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
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
    },
  },
})
