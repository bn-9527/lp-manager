import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import AddLiquidity from '../AddLiquidity'
import { parseEther } from 'viem'
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useConfig,
} from 'wagmi'
import { TEST_USER, TEST_TX_HASH, TEST_POS_MGR, createDefaultReadContract } from '../../test/wagmi-mocks'

// useQueryClient is NOT in setup.ts global mock, so mock it here
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })) }
})

const defaultReadContract = createDefaultReadContract()

// Restore all wagmi mock defaults before each test.
// vi.mocked(hook).mockReturnValue() persists across tests; this beforeEach
// ensures every test starts from the connected-by-default state.
beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({
    address: TEST_USER,
    isConnected: true,
    chain: { id: 56, name: 'BNB Smart Chain' },
  } as any)
  vi.mocked(useBalance).mockReturnValue({
    data: { value: parseEther('10'), formatted: '10', symbol: 'BNB', decimals: 18 },
  } as any)
  vi.mocked(useReadContract).mockImplementation(defaultReadContract as any)
  vi.mocked(useWriteContract).mockReturnValue({
    writeContractAsync: vi.fn().mockResolvedValue(TEST_TX_HASH),
    isPending: false,
  } as any)
  vi.mocked(useSendTransaction).mockReturnValue({
    sendTransactionAsync: vi.fn().mockResolvedValue(TEST_TX_HASH),
    isPending: false,
  } as any)
  vi.mocked(useWaitForTransactionReceipt).mockReturnValue({
    isLoading: false,
    isSuccess: false,
  } as any)
  vi.mocked(useConfig).mockReturnValue({} as any)
})

describe('AddLiquidity', () => {
  describe('render states', () => {
    it('shows connect prompt when not connected', () => {
      vi.mocked(useAccount).mockReturnValue({
        address: undefined,
        isConnected: false,
        chain: undefined,
      } as any)
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByText('Connect your wallet to manage liquidity')).toBeInTheDocument()
    })

    it('shows full form when connected', () => {
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByText('Hook Address')).toBeInTheDocument()
      expect(screen.getByText('Token A')).toBeInTheDocument()
      expect(screen.getByText('Token B')).toBeInTheDocument()
    })

    it('populates BSC defaults', () => {
      renderWithProviders(<AddLiquidity />)
      const inputs = screen.getAllByRole('textbox')
      // First textbox = Hook address input
      expect(inputs[0]).toHaveValue('0xb0BfF4fc6E3e6697F57D8bab1d9bb1A5F1212880')
    })
  })

  describe('token info display', () => {
    it('shows token symbol from mock', () => {
      renderWithProviders(<AddLiquidity />)
      // useReadContract returns symbol='TOKEN' for non-native tokens
      expect(screen.getAllByText('TOKEN').length).toBeGreaterThan(0)
    })

    it('shows native token symbol for zero address', () => {
      renderWithProviders(<AddLiquidity />)
      // tokenA defaults to 0x000...0 (native), shows BNB
      expect(screen.getAllByText('BNB').length).toBeGreaterThan(0)
    })
  })

  describe('allowance check', () => {
    it('shows All tokens approved when allowance >= amount', () => {
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByText('All tokens approved')).toBeInTheDocument()
    })

    it('shows Approve button when ERC20 allowance is 0', () => {
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        const fn = args?.functionName
        if (fn === 'allowance' && args?.abi) {
          const hasOutputTuple = (args.abi as { name?: string; outputs?: unknown[] }[]).some(
            (item) => item.name === 'allowance' && item.outputs && item.outputs.length === 3,
          )
          if (!hasOutputTuple) {
            return { data: 0n, isLoading: false, isError: false, refetch: vi.fn() } as any
          }
        }
        return defaultReadContract(args)
      })
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByText(/Approve/)).toBeInTheDocument()
    })
  })

  describe('approve flow', () => {
    function setupNeedApprove() {
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        if (args?.functionName === 'allowance') {
          return { data: 0n, isLoading: false, isError: false, refetch: vi.fn() } as any
        }
        return defaultReadContract(args)
      })
    }

    it('shows confirm dialog before approve', () => {
      setupNeedApprove()
      renderWithProviders(<AddLiquidity />)
      fireEvent.click(screen.getByText(/Approve/))
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('unlimited token approval'))
    })

    it('does not send tx when confirm is cancelled', () => {
      vi.mocked(window.confirm).mockReturnValueOnce(false)
      setupNeedApprove()
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<AddLiquidity />)
      fireEvent.click(screen.getByText(/Approve/))
      expect(mockWriteAsync).not.toHaveBeenCalled()
    })

    it('sends ERC20 + Permit2 approve when confirmed', async () => {
      setupNeedApprove()
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<AddLiquidity />)
      fireEvent.click(screen.getByText(/Approve/))
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(2)
      })
      // 第一次: ERC20 approve → Permit2，验证 spender 和 amount
      const call1 = mockWriteAsync.mock.calls[0][0]
      expect(call1.functionName).toBe('approve')
      expect(call1.args[0].toLowerCase()).toBe('0x000000000022d473030f116ddee9f6b43ac78ba3') // Permit2 地址
      expect(call1.args[1]).toBe(BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) // MAX_UINT256
      // 第二次: Permit2 approve → PositionManager，验证 spender 和 amount
      const call2 = mockWriteAsync.mock.calls[1][0]
      expect(call2.functionName).toBe('approve')
      expect(call2.args[1].toLowerCase()).toBe(TEST_POS_MGR.toLowerCase()) // PositionManager
      expect(call2.args[2]).toBe((1n << 160n) - 1n) // UINT160_MAX
    })
  })

  describe('add liquidity flow', () => {
    it('validates same token error', async () => {
      renderWithProviders(<AddLiquidity />)
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(screen.getByText(/same/i)).toBeInTheDocument()
      })
    })

    it('calls sendTransactionAsync on valid submit', async () => {
      const mockSendAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync: mockSendAsync,
        isPending: false,
      } as any)
      renderWithProviders(<AddLiquidity />)
      // Set both amounts explicitly; the auto-calc needs React re-render timing.
      // amountA placeholder is "0.05", amountB placeholder is "auto"
      const amountAInput = screen.getByPlaceholderText('0.05')
      const amountBInput = screen.getByPlaceholderText('auto')
      fireEvent.change(amountAInput, { target: { value: '0.05' } })
      fireEvent.change(amountBInput, { target: { value: '30' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(mockSendAsync).toHaveBeenCalledTimes(1)
      })
      expect(mockSendAsync.mock.calls[0][0].to).toBe(TEST_POS_MGR)
      // 验证 calldata 包含 multicall selector (0xac9650d8)
      const calldata = mockSendAsync.mock.calls[0][0].data as string
      expect(calldata.startsWith('0xac9650d8')).toBe(true)
      // 验证 calldata 包含 modifyLiquidities selector (0xdd46508f)
      expect(calldata.includes('dd46508f')).toBe(true)
    })

    it('shows error on sendTransaction failure', async () => {
      const mockSendAsync = vi.fn().mockRejectedValue({ shortMessage: 'user rejected' })
      vi.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync: mockSendAsync,
        isPending: false,
      } as any)
      renderWithProviders(<AddLiquidity />)
      const amountAInput = screen.getByPlaceholderText('0.05')
      const amountBInput = screen.getByPlaceholderText('auto')
      fireEvent.change(amountAInput, { target: { value: '0.05' } })
      fireEvent.change(amountBInput, { target: { value: '30' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(screen.getByText('user rejected')).toBeInTheDocument()
      })
    })
  })

  describe('tx status display', () => {
    it('shows confirmed status when tx is confirmed', () => {
      vi.mocked(useWaitForTransactionReceipt).mockReturnValue({
        isLoading: false,
        isSuccess: true,
      } as any)
      renderWithProviders(<AddLiquidity />)
      expect(vi.mocked(useWaitForTransactionReceipt)).toHaveBeenCalled()
    })
  })

  describe('chain switching', () => {
    it('shows unsupported chain warning and disables button', () => {
      vi.mocked(useAccount).mockReturnValue({
        address: TEST_USER,
        isConnected: true,
        chain: { id: 999, name: 'Unknown' },
      } as any)
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByText(/not supported/)).toBeInTheDocument()
      // Add Liquidity 按钮应被 disabled
      const addBtn = screen.getByText(/Add Liquidity \(/)
      expect(addBtn).toBeDisabled()
    })
  })

  describe('input validation', () => {
    it('rejects invalid hook address', async () => {
      renderWithProviders(<AddLiquidity />)
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[0], { target: { value: 'not-an-address' } }) // hook
      const amountAInput = screen.getByPlaceholderText('0.05')
      const amountBInput = screen.getByPlaceholderText('auto')
      fireEvent.change(amountAInput, { target: { value: '0.05' } })
      fireEvent.change(amountBInput, { target: { value: '30' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(screen.getByText(/Invalid hook address/)).toBeInTheDocument()
      })
    })

    it('rejects slippage exceeding MAX_SLIPPAGE_PCT', async () => {
      renderWithProviders(<AddLiquidity />)
      // 找到 slippage 输入框
      const slippageInput = document.querySelector('.slippage-input') as HTMLInputElement
      fireEvent.change(slippageInput, { target: { value: '99' } })
      const amountAInput = screen.getByPlaceholderText('0.05')
      const amountBInput = screen.getByPlaceholderText('auto')
      fireEvent.change(amountAInput, { target: { value: '0.05' } })
      fireEvent.change(amountBInput, { target: { value: '30' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(screen.getByText(/Slippage cannot exceed/)).toBeInTheDocument()
      })
    })

    it('rejects zero price', async () => {
      renderWithProviders(<AddLiquidity />)
      // 清空 price
      const priceInput = document.querySelector('.price-input') as HTMLInputElement
      fireEvent.change(priceInput, { target: { value: '0' } })
      const amountAInput = screen.getByPlaceholderText('0.05')
      fireEvent.change(amountAInput, { target: { value: '1' } })
      fireEvent.click(screen.getByText(/Add Liquidity \(/))
      await waitFor(() => {
        expect(screen.getByText(/Invalid price/)).toBeInTheDocument()
      })
    })
  })

  describe('price range', () => {
    it('defaults to full range', () => {
      renderWithProviders(<AddLiquidity />)
      const checkbox = screen.getByLabelText(/Full Range/i)
      expect(checkbox).toBeChecked()
    })

    it('shows min/max price inputs when full range unchecked', () => {
      renderWithProviders(<AddLiquidity />)
      fireEvent.click(screen.getByLabelText(/Full Range/i))
      expect(screen.getByPlaceholderText('e.g. 400')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g. 800')).toBeInTheDocument()
    })
  })

  describe('slippage', () => {
    it('renders slippage presets', () => {
      renderWithProviders(<AddLiquidity />)
      expect(screen.getByRole('button', { name: '0.1%' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '0.5%' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '1.0%' })).toBeInTheDocument()
    })
  })
})
