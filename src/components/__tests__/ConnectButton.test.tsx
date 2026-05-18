import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import ConnectButton from '../ConnectButton'
import { useAccount, useDisconnect, useBalance, useSwitchChain } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { parseEther } from 'viem'

const TEST_USER = '0xEe7b429Ea01F76102f053213463D4e95D5D24AE8'

// Restore the global setup.ts defaults before each test.
beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({
    address: TEST_USER,
    isConnected: true,
    chain: { id: 56, name: 'BNB Smart Chain' },
  } as any)
  vi.mocked(useDisconnect).mockReturnValue({ disconnect: vi.fn() } as any)
  vi.mocked(useBalance).mockReturnValue({
    data: { value: parseEther('10'), formatted: '10', symbol: 'BNB', decimals: 18 },
  } as any)
  vi.mocked(useSwitchChain).mockReturnValue({ switchChain: vi.fn() } as any)
  vi.mocked(useAppKit).mockReturnValue({ open: vi.fn(), close: vi.fn() } as any)
})

describe('ConnectButton', () => {
  describe('connected state', () => {
    it('shows truncated address', () => {
      renderWithProviders(<ConnectButton />)
      expect(screen.getByText('0xEe7b...4AE8')).toBeInTheDocument()
    })

    it('shows balance', () => {
      renderWithProviders(<ConnectButton />)
      const balanceEl = document.querySelector('.balance')
      expect(balanceEl).toBeTruthy()
      expect(balanceEl!.textContent).toContain('10.0000')
      expect(balanceEl!.textContent).toContain('BNB')
    })

    it('shows chain selector with supported chains', () => {
      renderWithProviders(<ConnectButton />)
      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()
      expect(select).toHaveValue('56')
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(4)
      expect(options[0]).toHaveTextContent('BNB Smart Chain')
      expect(options[1]).toHaveTextContent('Ethereum')
      expect(options[2]).toHaveTextContent('Base')
      expect(options[3]).toHaveTextContent('Arbitrum One')
    })

    it('calls switchChain when chain selector changes', () => {
      const mockSwitchChain = vi.fn()
      vi.mocked(useSwitchChain).mockReturnValue({ switchChain: mockSwitchChain } as any)
      renderWithProviders(<ConnectButton />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
      expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 1 })
    })

    it('shows disconnect button', () => {
      renderWithProviders(<ConnectButton />)
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    })

    it('calls disconnect when clicking Disconnect', () => {
      const mockDisconnect = vi.fn()
      vi.mocked(useDisconnect).mockReturnValue({ disconnect: mockDisconnect } as any)
      renderWithProviders(<ConnectButton />)
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
      expect(mockDisconnect).toHaveBeenCalledTimes(1)
    })

    it('shows PositionManager and Permit2 addresses', () => {
      renderWithProviders(<ConnectButton />)
      expect(screen.getByText('PositionManager:')).toBeInTheDocument()
      expect(screen.getByText('Permit2:')).toBeInTheDocument()
    })
  })

  describe('disconnected state', () => {
    beforeEach(() => {
      vi.mocked(useAccount).mockReturnValue({
        address: undefined,
        isConnected: false,
        chain: undefined,
      } as any)
    })

    it('shows connect wallet button', () => {
      renderWithProviders(<ConnectButton />)
      expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument()
    })

    it('does not show disconnect button', () => {
      renderWithProviders(<ConnectButton />)
      expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
    })

    it('calls appkit open when clicking connect', () => {
      const mockOpen = vi.fn()
      vi.mocked(useAppKit).mockReturnValue({ open: mockOpen, close: vi.fn() } as any)
      renderWithProviders(<ConnectButton />)
      fireEvent.click(screen.getByRole('button', { name: 'Connect Wallet' }))
      expect(mockOpen).toHaveBeenCalledTimes(1)
    })
  })
})
