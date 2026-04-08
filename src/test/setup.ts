import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// FIX: vitest 未开启 globals: true 时，@testing-library/react 的 auto-cleanup
// 无法检测到全局 afterEach，导致每个 test 的 DOM 累积。手动注册 cleanup。
afterEach(() => {
  cleanup()
})

// window.confirm 默认返回 true
vi.stubGlobal('confirm', vi.fn(() => true))

// 阻止 @reown/appkit import 副作用
vi.mock('@reown/appkit-adapter-wagmi', () => ({ WagmiAdapter: vi.fn() }))
vi.mock('@reown/appkit', () => ({ createAppKit: vi.fn() }))

// ── 全局 wagmi mock ──
// 复用 wagmi-mocks.ts 的常量和工厂函数，避免多处重复定义。
// 每个测试文件通过 import { useAccount } from 'wagmi' 获取 mock 函数后
// 用 vi.mocked(useAccount).mockReturnValue(...) 覆盖。
vi.mock('wagmi', async () => {
  const { parseEther } = await import('viem')
  const { TEST_USER, TEST_TX_HASH, createDefaultReadContract } = await import('./wagmi-mocks')
  return {
    useAccount: vi.fn(() => ({
      address: TEST_USER,
      isConnected: true,
      chain: { id: 56, name: 'BNB Smart Chain' },
    })),
    useConnect: vi.fn(() => ({
      connectors: [{ uid: 'mock-1', name: 'Mock Wallet' }, { uid: 'mock-2', name: 'WalletConnect' }],
      connect: vi.fn(),
      isPending: false,
    })),
    useDisconnect: vi.fn(() => ({ disconnect: vi.fn() })),
    useBalance: vi.fn(() => ({
      data: { value: parseEther('10'), formatted: '10', symbol: 'BNB', decimals: 18 },
    })),
    useSwitchChain: vi.fn(() => ({ switchChain: vi.fn() })),
    useReadContract: vi.fn(createDefaultReadContract()),
    useWriteContract: vi.fn(() => ({
      writeContractAsync: vi.fn().mockResolvedValue(TEST_TX_HASH),
      isPending: false,
    })),
    useSendTransaction: vi.fn(() => ({
      sendTransactionAsync: vi.fn().mockResolvedValue(TEST_TX_HASH),
      isPending: false,
    })),
    useWaitForTransactionReceipt: vi.fn(() => ({
      isLoading: false,
      isSuccess: false,
    })),
    useConfig: vi.fn(() => ({})),
  }
})

vi.mock('wagmi/actions', () => ({
  waitForTransactionReceipt: vi.fn().mockResolvedValue({}),
}))

vi.mock('wagmi/chains', () => ({
  bsc: { id: 56, name: 'BNB Smart Chain' },
  mainnet: { id: 1, name: 'Ethereum' },
  base: { id: 8453, name: 'Base' },
}))
