import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import { config, queryClient } from './config/wagmi'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* FIX: wagmi 3 文档要求 WagmiProvider 在外层，QueryClientProvider 在内层，
        确保 WagmiProvider 初始化时 QueryClient 已就绪 */}
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
