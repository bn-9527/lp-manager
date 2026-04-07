import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { parseEther } from 'viem'

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
// 在 setup 中统一 mock wagmi，所有测试文件自动继承。
// 每个测试文件通过 import { useAccount } from 'wagmi' 获取 mock 函数后
// 用 vi.mocked(useAccount).mockReturnValue(...) 覆盖。

const TEST_USER = '0xEe7b429Ea01F76102f053213463D4e95D5D24AE8'
const TEST_POS_MGR = '0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b'
const TEST_POOL_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
const TEST_TX_HASH = '0xabc123def456789012345678901234567890123456789012345678901234abcd'

vi.mock('wagmi', () => ({
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
  useReadContract: vi.fn((args?: { functionName?: string; abi?: unknown[]; address?: string }) => {
    const fn = args?.functionName
    if (!fn || !args?.address) return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
    // Permit2 allowance → tuple [amount, expiration, nonce]
    if (fn === 'allowance' && args.abi && Array.isArray(args.abi)) {
      const isPermit2 = args.abi.some(
        (item: Record<string, unknown>) => item.name === 'allowance' && Array.isArray(item.outputs) && item.outputs.length === 3,
      )
      if (isPermit2) return { data: [(1n << 160n) - 1n, 2000000000, 0], isLoading: false, isError: false, refetch: vi.fn() }
    }
    const defaults: Record<string, unknown> = {
      symbol: 'TOKEN', decimals: 18, balanceOf: parseEther('100'),
      allowance: 2n ** 256n - 1n,
      owner: TEST_USER,
      pendingOwner: '0x0000000000000000000000000000000000000000',
      positionManager: TEST_POS_MGR,
      getPoolId: TEST_POOL_ID,
      isPoolEnabled: true, isPoolStarted: false,
      poolStartedTimestamp: 1800000000n,
      getPoolOwners: [TEST_USER], isPoolOwner: true,
      poolManager: '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b',
      getPoolKeyParameters: '0x0000000000000000000000000000000000000000000000000000000000c80014',
    }
    return { data: defaults[fn] ?? undefined, isLoading: false, isError: false, refetch: vi.fn() }
  }),
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
}))

vi.mock('wagmi/actions', () => ({
  waitForTransactionReceipt: vi.fn().mockResolvedValue({}),
}))

vi.mock('wagmi/chains', () => ({
  bsc: { id: 56, name: 'BNB Smart Chain' },
  mainnet: { id: 1, name: 'Ethereum' },
  base: { id: 8453, name: 'Base' },
}))
