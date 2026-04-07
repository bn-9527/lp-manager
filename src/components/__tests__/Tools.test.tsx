import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Tools from '../Tools'

describe('Tools', () => {
  it('renders three tool tabs', () => {
    render(<Tools />)
    // Use getByRole to target tab buttons, avoiding collision with content text
    expect(screen.getByRole('button', { name: 'Fee \u2192 TickSpacing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Datetime \u2192 Unix' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sqrtPriceX96' })).toBeInTheDocument()
  })

  it('shows FeeToTickSpacing by default', () => {
    render(<Tools />)
    // FeeToTickSpacing renders a single input with this placeholder
    expect(screen.getByPlaceholderText('e.g. 0.025')).toBeInTheDocument()
  })

  it('switches to DatetimeUnix tab', () => {
    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Datetime \u2192 Unix' }))
    expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 1772294340')).toBeInTheDocument()
  })

  it('switches to SqrtPriceX96 tab', () => {
    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'sqrtPriceX96' }))
    expect(screen.getByText('Token A (sorted as token0 if address is lower)')).toBeInTheDocument()
  })
})
