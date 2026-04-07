/**
 * wagmi hooks 的模块级 mock 工厂。
 * 每个 hook 有合理默认返回值，测试用例通过 vi.mocked(useXxx).mockReturnValue(...) 覆盖。
 *
 * useReadContract 通过 functionName 参数路由返回不同默认值，
 * 覆盖 ERC20 (symbol/decimals/balanceOf/allowance) 和 hook 合约 (owner/isPoolEnabled 等) 读取。
 *
 * 使用方式: 在测试文件中用 vi.hoisted() 创建 mock 实例，然后在 vi.mock('wagmi', ...) 中引用。
 * vi.hoisted 确保变量在 vi.mock 提升后仍可访问。
 */
import { vi } from 'vitest'
import { parseEther } from 'viem'

// 测试用常量地址
export const TEST_USER = '0xEe7b429Ea01F76102f053213463D4e95D5D24AE8'
export const TEST_HOOK_V4 = '0xb0B41e49082B9Ae0fFc6387abf3690cAfF972880'
export const TEST_HOOK_CL = '0xB0b313A71F597079505243564F139030fA93a31c'
export const TEST_POS_MGR = '0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b'
export const TEST_TX_HASH = '0xabc123def456789012345678901234567890123456789012345678901234abcd' as const
export const TEST_POOL_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const

// useReadContract 根据 functionName 返回的默认值
const READ_CONTRACT_DEFAULTS: Record<string, unknown> = {
  symbol: 'TOKEN',
  decimals: 18,
  balanceOf: parseEther('100'),
  // ERC20 allowance → Permit2: MAX_UINT256 (已授权)
  allowance: 2n ** 256n - 1n,
  // hook contract reads
  owner: TEST_USER,
  pendingOwner: '0x0000000000000000000000000000000000000000',
  positionManager: TEST_POS_MGR,
  getPoolId: TEST_POOL_ID,
  isPoolEnabled: true,
  isPoolStarted: false,
  poolStartedTimestamp: 1800000000n,
  getPoolOwners: [TEST_USER],
  isPoolOwner: true,
  poolManager: '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b',
  getPoolKeyParameters: '0x0000000000000000000000000000000000000000000000000000000000c80014',
}

// Permit2 allowance 返回 [amount, expiration, nonce] tuple
const PERMIT2_ALLOWANCE = [(1n << 160n) - 1n, 2000000000, 0]

export const mockWriteContractAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
export const mockSendTransactionAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
export const mockConnect = vi.fn()
export const mockDisconnect = vi.fn()
export const mockSwitchChain = vi.fn()

/**
 * 注册 wagmi 和相关模块的 vi.mock。
 * 必须在测试文件顶层调用（vi.mock 会被 vitest 提升到文件顶部）。
 */
export function createWagmiMockFactory() {
  return {
    useAccount: vi.fn(() => ({
      address: TEST_USER,
      isConnected: true,
      chain: { id: 56, name: 'BNB Smart Chain' },
    })),

    useConnect: vi.fn(() => ({
      connectors: [
        { uid: 'mock-1', name: 'Mock Wallet' },
        { uid: 'mock-2', name: 'WalletConnect' },
      ],
      connect: mockConnect,
      isPending: false,
    })),

    useDisconnect: vi.fn(() => ({ disconnect: mockDisconnect })),

    useBalance: vi.fn(() => ({
      data: { value: parseEther('10'), formatted: '10', symbol: 'BNB', decimals: 18 },
    })),

    useSwitchChain: vi.fn(() => ({ switchChain: mockSwitchChain })),

    useReadContract: vi.fn((args?: { functionName?: string; abi?: unknown[]; address?: string }) => {
      const fn = args?.functionName
      if (!fn || !args?.address) return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }

      // Permit2 allowance 返回 tuple 格式
      if (fn === 'allowance' && args.abi && Array.isArray(args.abi)) {
        const hasOutputTuple = args.abi.some(
          (item: { name?: string; outputs?: { name?: string }[] }) =>
            item.name === 'allowance' && item.outputs && item.outputs.length === 3,
        )
        if (hasOutputTuple) {
          return { data: PERMIT2_ALLOWANCE, isLoading: false, isError: false, refetch: vi.fn() }
        }
      }

      const data = READ_CONTRACT_DEFAULTS[fn]
      return { data: data ?? undefined, isLoading: false, isError: false, refetch: vi.fn() }
    }),

    useWriteContract: vi.fn(() => ({
      writeContractAsync: mockWriteContractAsync,
      isPending: false,
    })),

    useSendTransaction: vi.fn(() => ({
      sendTransactionAsync: mockSendTransactionAsync,
      isPending: false,
    })),

    useWaitForTransactionReceipt: vi.fn(() => ({
      isLoading: false,
      isSuccess: false,
    })),

    useConfig: vi.fn(() => ({})),
  }
}
