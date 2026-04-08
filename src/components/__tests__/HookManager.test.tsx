import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import HookManager from '../HookManager'
import { parseEther } from 'viem'
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { TEST_USER, TEST_TX_HASH, TEST_POOL_ID, createDefaultReadContract } from '../../test/wagmi-mocks'

const defaultReadContract = createDefaultReadContract()

// Restore all wagmi mock defaults before each test
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
  vi.mocked(useWaitForTransactionReceipt).mockReturnValue({
    isLoading: false,
    isSuccess: false,
  } as any)
})

describe('HookManager', () => {
  describe('render states', () => {
    it('shows connect prompt when not connected', () => {
      vi.mocked(useAccount).mockReturnValue({
        address: undefined,
        isConnected: false,
        chain: undefined,
      } as any)
      renderWithProviders(<HookManager />)
      expect(screen.getByText('Connect your wallet to manage hooks')).toBeInTheDocument()
    })

    it('shows manager UI when connected', () => {
      renderWithProviders(<HookManager />)
      expect(screen.getByText('Hook Manager')).toBeInTheDocument()
    })
  })

  describe('protocol switching', () => {
    it('shows PCS CL and Uni V4 tabs', () => {
      renderWithProviders(<HookManager />)
      expect(screen.getByRole('button', { name: 'PCS CL' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Uni V4' })).toBeInTheDocument()
    })

    it('defaults to Uni V4', () => {
      renderWithProviders(<HookManager />)
      expect(screen.getByRole('button', { name: 'Uni V4' }).className).toContain('active')
    })

    it('switches to PCS CL protocol', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByRole('button', { name: 'PCS CL' }))
      expect(screen.getByRole('button', { name: 'PCS CL' }).className).toContain('active')
    })
  })

  describe('hook info display', () => {
    it('shows owner with YOU badge when user is owner', () => {
      renderWithProviders(<HookManager />)
      expect(screen.getByText('YOU')).toBeInTheDocument()
    })

    it('shows owner address', () => {
      renderWithProviders(<HookManager />)
      // Owner address rendered via info-value span (not AddressLink)
      expect(screen.getByText(TEST_USER)).toBeInTheDocument()
    })

    it('shows pending owner when set', () => {
      const pendingAddr = '0x1234567890123456789012345678901234567890'
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        const fn = args?.functionName
        if (fn === 'pendingOwner') return { data: pendingAddr, isLoading: false, isError: false, refetch: vi.fn() } as any
        return defaultReadContract(args)
      })
      renderWithProviders(<HookManager />)
      expect(screen.getByText('Pending Owner:')).toBeInTheDocument()
      expect(screen.getByText(pendingAddr)).toBeInTheDocument()
    })
  })

  describe('collapsible sections', () => {
    it('all 7 operation panels are rendered', () => {
      renderWithProviders(<HookManager />)
      expect(screen.getByText('Initialize Pool')).toBeInTheDocument()
      expect(screen.getByText('Pool Status')).toBeInTheDocument()
      expect(screen.getByText('Whitelist Management')).toBeInTheDocument()
      expect(screen.getByText('Set Pool Start Time')).toBeInTheDocument()
      expect(screen.getByText('Set Position Manager')).toBeInTheDocument()
      expect(screen.getByText('Emergency Withdraw')).toBeInTheDocument()
      expect(screen.getByText('Ownership Transfer')).toBeInTheDocument()
    })

    it('clicking section header expands it', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Initialize Pool'))
      expect(screen.getByText('sqrtPriceX96')).toBeInTheDocument()
    })

    it('clicking again collapses', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Initialize Pool'))
      expect(screen.getByText('sqrtPriceX96')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Initialize Pool'))
      expect(screen.queryByText('sqrtPriceX96')).not.toBeInTheDocument()
    })
  })

  describe('pool parameters', () => {
    it('shows Pool ID when tokens and fee are valid', () => {
      renderWithProviders(<HookManager />)
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
      expect(screen.getByText('Pool ID:')).toBeInTheDocument()
    })
  })

  describe('Initialize Pool', () => {
    it('button disabled when not owner', () => {
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        if (args?.functionName === 'owner') return { data: '0x0000000000000000000000000000000000000001', isLoading: false, isError: false, refetch: vi.fn() } as any
        return defaultReadContract(args)
      })
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Initialize Pool'))
      expect(screen.getByRole('button', { name: 'Not Hook Owner' })).toBeDisabled()
    })

    it('shows sqrtPriceX96 field when expanded', () => {
      renderWithProviders(<HookManager />)
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
      fireEvent.click(screen.getByText('Initialize Pool'))
      expect(screen.getByText('sqrtPriceX96')).toBeInTheDocument()
    })
  })

  describe('Whitelist Management', () => {
    function fillPoolParams() {
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
    }

    it('shows add owners textarea', () => {
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Whitelist Management'))
      // The whitelist section uses a <textarea> — locate it by tag name
      const textarea = document.querySelector('textarea')
      expect(textarea).toBeTruthy()
      expect(textarea!.placeholder).toBe('0x...')
    })

    it('calls addPoolOwners with correct poolId and addresses', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Whitelist Management'))
      const textarea = document.querySelector('textarea')!
      const newAddr = '0x1234567890123456789012345678901234567890'
      fireEvent.change(textarea, { target: { value: newAddr } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Pool Owners' }))
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('addPoolOwners')
      // 验证 args: [poolId, addresses[]]
      expect(callArgs.args[0]).toBe(TEST_POOL_ID) // poolId
      expect(callArgs.args[1]).toEqual([newAddr]) // 地址列表
    })

    it('removePoolOwners shows confirm dialog with count', () => {
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Whitelist Management'))
      // mock: getPoolOwners=[TEST_USER] → 应有 1 个 checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
      fireEvent.click(checkboxes[0])
      const removeBtn = screen.getByText(/Remove.*Owner/)
      fireEvent.click(removeBtn)
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Remove 1 pool owner'))
    })

    it('removePoolOwners calls writeContractAsync with correct args', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Whitelist Management'))
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0])
      fireEvent.click(screen.getByText(/Remove.*Owner/))
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('removePoolOwners')
      expect(callArgs.args[0]).toBe(TEST_POOL_ID)
      expect(callArgs.args[1]).toEqual([TEST_USER]) // 选中的 owner
    })
  })

  describe('Emergency Withdraw', () => {
    it('shows 3 withdraw type radios', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      expect(screen.getByLabelText(/ETH\/ERC20 \(Safe\)/)).toBeInTheDocument()
      expect(screen.getByLabelText(/ERC20 \(Unsafe\)/)).toBeInTheDocument()
      expect(screen.getByLabelText(/ERC721/)).toBeInTheDocument()
    })

    it('shows confirm dialog before emergency withdraw', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      const tokenInputs = screen.getAllByPlaceholderText('0x...')
      fireEvent.change(tokenInputs[tokenInputs.length - 1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      const btns = screen.getAllByText('Emergency Withdraw')
      const btn = btns.find(el => el.tagName === 'BUTTON')!
      // FIX: 去掉 if(btn) 防止静默通过
      expect(btn).toBeTruthy()
      fireEvent.click(btn)
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Emergency withdraw'))
    })

    it('shows Token ID input when ERC721 selected', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      fireEvent.click(screen.getByLabelText(/ERC721/))
      expect(screen.getByPlaceholderText('e.g. 12345')).toBeInTheDocument()
    })
  })

  describe('Ownership Transfer', () => {
    it('shows transfer ownership form', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Ownership Transfer'))
      expect(screen.getByText('New Owner Address')).toBeInTheDocument()
    })

    it('transfer shows confirm dialog', () => {
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Ownership Transfer'))
      const inputs = screen.getAllByPlaceholderText('0x...')
      const ownerInput = inputs[inputs.length - 1]
      fireEvent.change(ownerInput, { target: { value: '0x1234567890123456789012345678901234567890' } })
      fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }))
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Transfer hook ownership'))
    })

    it('calls writeContractAsync with transferOwnership and correct address', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      const targetAddr = '0x1234567890123456789012345678901234567890'
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Ownership Transfer'))
      const inputs = screen.getAllByPlaceholderText('0x...')
      const ownerInput = inputs[inputs.length - 1]
      fireEvent.change(ownerInput, { target: { value: targetAddr } })
      fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }))
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('transferOwnership')
      expect(callArgs.args).toEqual([targetAddr]) // 验证传入的地址
    })

    it('shows Accept Ownership when user is pending owner', () => {
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        if (args?.functionName === 'owner') return { data: '0x0000000000000000000000000000000000000001', isLoading: false, isError: false, refetch: vi.fn() } as any
        if (args?.functionName === 'pendingOwner') return { data: TEST_USER, isLoading: false, isError: false, refetch: vi.fn() } as any
        return defaultReadContract(args)
      })
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Ownership Transfer'))
      expect(screen.getByRole('button', { name: 'Accept Ownership' })).toBeInTheDocument()
      expect(screen.getByText('You are the pending owner. Click below to accept ownership.')).toBeInTheDocument()
    })
  })

  describe('Set Position Manager', () => {
    it('calls setPositionManager with correct address', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      const targetAddr = '0x1234567890123456789012345678901234567890'
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Set Position Manager'))
      const inputs = screen.getAllByPlaceholderText('0x...')
      const pmInput = inputs[inputs.length - 1]
      fireEvent.change(pmInput, { target: { value: targetAddr } })
      const btns = screen.getAllByText('Set Position Manager')
      const btn = btns.find(el => el.tagName === 'BUTTON')!
      expect(btn).toBeTruthy()
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('setPositionManager')
      expect(callArgs.args).toEqual([targetAddr])
    })
  })

  describe('Set Pool Start Time', () => {
    function fillPoolParams() {
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
    }

    it('calls setPoolStartTime with correct poolId and timestamp', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Set Pool Start Time'))
      // 通过 datetime-local 输入设置时间
      const datetimeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
      expect(datetimeInput).toBeTruthy()
      fireEvent.change(datetimeInput, { target: { value: '2026-06-01T12:00' } })
      const btn = screen.getByRole('button', { name: 'Set Pool Start Time' })
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('setPoolStartTime')
      expect(callArgs.args[0]).toBe(TEST_POOL_ID)
      // 2026-06-01T12:00Z → Unix timestamp
      const expectedTs = BigInt(Math.floor(new Date('2026-06-01T12:00:00Z').getTime() / 1000))
      expect(callArgs.args[1]).toBe(expectedTs)
    })
  })

  describe('Pool Status display', () => {
    function fillPoolParams() {
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
    }

    it('displays pool enabled/started status and timestamp', () => {
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Pool Status'))
      // mock: isPoolEnabled=true, isPoolStarted=false, poolStartedTimestamp=1800000000n
      expect(screen.getByText('true')).toBeInTheDocument()  // enabled
      expect(screen.getByText('false')).toBeInTheDocument() // started
      // timestamp 1800000000 → 2027-01-15 08:00:00 UTC
      expect(screen.getByText(/1800000000/)).toBeInTheDocument()
    })

    it('displays pool owners list', () => {
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Pool Status'))
      // mock: getPoolOwners=[TEST_USER]
      expect(screen.getByText('Pool Owners (1)')).toBeInTheDocument()
      // Owner address truncated via AddressLink
      expect(screen.getByText(`${TEST_USER.slice(0, 6)}...${TEST_USER.slice(-4)}`)).toBeInTheDocument()
    })

    it('shows No pool owners when list is empty', () => {
      vi.mocked(useReadContract).mockImplementation((args?: any) => {
        if (args?.functionName === 'getPoolOwners') return { data: [], isLoading: false, isError: false, refetch: vi.fn() } as any
        return defaultReadContract(args)
      })
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Pool Status'))
      expect(screen.getByText('No pool owners')).toBeInTheDocument()
    })
  })

  describe('Initialize Pool submit', () => {
    function fillPoolParams() {
      const inputs = screen.getAllByRole('textbox')
      fireEvent.change(inputs[1], { target: { value: '0x0000000000000000000000000000000000000000' } })
      fireEvent.change(inputs[2], { target: { value: '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487' } })
    }

    it('calls initializePool with correct PoolKey for Uni V4', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      renderWithProviders(<HookManager />)
      fillPoolParams()
      fireEvent.click(screen.getByText('Initialize Pool'))
      // 设置 datetime
      const datetimeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
      fireEvent.change(datetimeInput, { target: { value: '2026-06-01T12:00' } })
      // 点击 Initialize Pool 提交按钮（跳过 collapsible header 的 role="button"）
      const btns = screen.getAllByRole('button', { name: /Initialize Pool/ })
      const submitBtn = btns.find(el => el.tagName === 'BUTTON')!
      expect(submitBtn).toBeTruthy()
      fireEvent.click(submitBtn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('initializePool')
      // Uni V4 PoolKey: {currency0, currency1, fee, tickSpacing, hooks}
      const poolKey = callArgs.args[0]
      // token0 < token1 排序
      expect(poolKey.currency0.toLowerCase()).toBe('0x0000000000000000000000000000000000000000')
      expect(poolKey.currency1.toLowerCase()).toBe('0xcbd7c163818189ceb07b50fd4974e78b029fc487')
      expect(poolKey.fee).toBe(500) // 默认 fee
      expect(poolKey.tickSpacing).toBe(10) // feeToTickSpacing(500)
      // sqrtPriceX96 应为正数
      const sqrtPrice = callArgs.args[2]
      expect(sqrtPrice).toBeGreaterThan(0n)
    })
  })

  describe('Emergency Withdraw data validation', () => {
    it('calls emergencyWithdraw with correct token address', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      const tokenAddr = '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487'
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      const tokenInputs = screen.getAllByPlaceholderText('0x...')
      fireEvent.change(tokenInputs[tokenInputs.length - 1], { target: { value: tokenAddr } })
      const btns = screen.getAllByText('Emergency Withdraw')
      const btn = btns.find(el => el.tagName === 'BUTTON')!
      expect(btn).toBeTruthy()
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('emergencyWithdraw')
      expect(callArgs.args).toEqual([tokenAddr])
    })

    it('calls emergencyWithdrawERC20Unsafe when unsafe selected', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      const tokenAddr = '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487'
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      fireEvent.click(screen.getByLabelText(/ERC20 \(Unsafe\)/))
      const tokenInputs = screen.getAllByPlaceholderText('0x...')
      fireEvent.change(tokenInputs[tokenInputs.length - 1], { target: { value: tokenAddr } })
      const btns = screen.getAllByText('Emergency Withdraw')
      const btn = btns.find(el => el.tagName === 'BUTTON')!
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      expect(mockWriteAsync.mock.calls[0][0].functionName).toBe('emergencyWithdrawERC20Unsafe')
    })

    it('calls emergencyWithdrawERC721 with token address and tokenId', async () => {
      const mockWriteAsync = vi.fn().mockResolvedValue(TEST_TX_HASH)
      vi.mocked(useWriteContract).mockReturnValue({
        writeContractAsync: mockWriteAsync,
        isPending: false,
      } as any)
      const tokenAddr = '0xCBD7C163818189Ceb07B50Fd4974E78B029fc487'
      renderWithProviders(<HookManager />)
      fireEvent.click(screen.getByText('Emergency Withdraw'))
      fireEvent.click(screen.getByLabelText(/ERC721/))
      const tokenInputs = screen.getAllByPlaceholderText('0x...')
      fireEvent.change(tokenInputs[tokenInputs.length - 1], { target: { value: tokenAddr } })
      fireEvent.change(screen.getByPlaceholderText('e.g. 12345'), { target: { value: '42' } })
      const btns = screen.getAllByText('Emergency Withdraw')
      const btn = btns.find(el => el.tagName === 'BUTTON')!
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockWriteAsync).toHaveBeenCalledTimes(1)
      })
      const callArgs = mockWriteAsync.mock.calls[0][0]
      expect(callArgs.functionName).toBe('emergencyWithdrawERC721')
      expect(callArgs.args[0]).toBe(tokenAddr)
      expect(callArgs.args[1]).toBe(42n) // BigInt(tokenId)
    })
  })

  describe('unsupported chain', () => {
    it('shows warning for unsupported chain', () => {
      vi.mocked(useAccount).mockReturnValue({
        address: TEST_USER,
        isConnected: true,
        chain: { id: 999, name: 'Unknown' },
      } as any)
      renderWithProviders(<HookManager />)
      expect(screen.getByText(/not supported/)).toBeInTheDocument()
    })
  })

  describe('tx status', () => {
    it('shows confirming state hook is called', () => {
      vi.mocked(useWaitForTransactionReceipt).mockReturnValue({
        isLoading: true,
        isSuccess: false,
      } as any)
      renderWithProviders(<HookManager />)
      expect(vi.mocked(useWaitForTransactionReceipt)).toHaveBeenCalled()
    })
  })
})
