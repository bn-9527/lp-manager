import { createConfig, http, injected } from 'wagmi'
import { bsc, mainnet, base } from 'wagmi/chains'
import { walletConnect } from '@wagmi/connectors'
import { QueryClient } from '@tanstack/react-query'

export const config = createConfig({
  chains: [bsc, mainnet, base],
  connectors: [
    injected(),
    walletConnect({
      projectId: 'fe525a3fb7824f87c529d0935853cc2d',
      metadata: {
        name: 'V4 LP Manager',
        description: 'Uniswap V4 Liquidity Manager',
        url: 'https://localhost',
        icons: [],
      },
    }),
  ],
  transports: {
    [bsc.id]: http('https://bsc-rpc.publicnode.com'),
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
    [base.id]: http('https://base-rpc.publicnode.com'),
  },
})

export const queryClient = new QueryClient()
