import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import FeeToTickSpacing from '../../tools/FeeToTickSpacing'

describe('FeeToTickSpacing', () => {
  it('renders input and preset buttons', () => {
    render(<FeeToTickSpacing />)
    expect(screen.getByPlaceholderText('e.g. 0.025')).toBeInTheDocument()
    // Preset buttons: "0.01%", "0.05%", "0.3%", "1%"
    expect(screen.getByRole('button', { name: '0.01%' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0.05%' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0.3%' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1%' })).toBeInTheDocument()
  })

  it('shows preset tickSpacing for 0.05% (fee=500)', () => {
    render(<FeeToTickSpacing />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 0.025'), { target: { value: '0.05' } })
    // fee=500 -> tickSpacing=10 (preset)
    // The result area shows tickSpacing in a prominent span; the table also has "10"
    // Use the .tool-result area to check the main output
    const resultArea = document.querySelector('.tool-result')!
    expect(within(resultArea as HTMLElement).getByText('10')).toBeInTheDocument()
    expect(screen.getByText('fee=500')).toBeInTheDocument()
  })

  it('shows preset tickSpacing for 0.3% (fee=3000)', () => {
    render(<FeeToTickSpacing />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 0.025'), { target: { value: '0.3' } })
    // fee=3000 -> tickSpacing=60 (preset); check in result area
    const resultArea = document.querySelector('.tool-result')!
    expect(within(resultArea as HTMLElement).getByText('60')).toBeInTheDocument()
  })

  it('clicking preset button fills input', () => {
    render(<FeeToTickSpacing />)
    fireEvent.click(screen.getByRole('button', { name: '0.05%' }))
    const input = screen.getByPlaceholderText('e.g. 0.025') as HTMLInputElement
    expect(input.value).toBe('0.05')
  })

  it('renders reference table', () => {
    render(<FeeToTickSpacing />)
    expect(screen.getByText('Fee Rate')).toBeInTheDocument()
    // "TickSpacing" appears as both a table header and in the result area.
    // Target the table header specifically.
    const table = document.querySelector('.fee-table')!
    expect(within(table as HTMLElement).getByText('TickSpacing')).toBeInTheDocument()
  })

  it('shows dash for empty input', () => {
    render(<FeeToTickSpacing />)
    // The result area shows "-" when no valid fee
    const resultArea = document.querySelector('.tool-result')!
    expect(within(resultArea as HTMLElement).getByText('-')).toBeInTheDocument()
  })
})
