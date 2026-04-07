import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import SqrtPriceX96 from '../../tools/SqrtPriceX96'

describe('SqrtPriceX96', () => {
  const ADDR_A = '0x0000000000000000000000000000000000000001'
  const ADDR_B = '0x0000000000000000000000000000000000000002'

  function fillForm(addrA: string, addrB: string, price: string) {
    const inputs = screen.getAllByRole('textbox')
    // inputs order: addrA, decA, symA, addrB, decB, symB, price
    fireEvent.change(inputs[0], { target: { value: addrA } })
    fireEvent.change(inputs[3], { target: { value: addrB } })
    fireEvent.change(inputs[6], { target: { value: price } })
  }

  it('renders token A and B input sections', () => {
    render(<SqrtPriceX96 />)
    expect(screen.getByText('Token A (sorted as token0 if address is lower)')).toBeInTheDocument()
    expect(screen.getByText('Token B')).toBeInTheDocument()
  })

  it('shows results for valid inputs', () => {
    render(<SqrtPriceX96 />)
    fillForm(ADDR_A, ADDR_B, '600')
    // Result area has kv-label "sqrtPriceX96"
    const resultArea = document.querySelector('.tool-result')!
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('sqrtPriceX96')).toBeInTheDocument()
    expect(within(resultArea as HTMLElement).getByText('Tick (approx)')).toBeInTheDocument()
  })

  it('shows token sort order', () => {
    render(<SqrtPriceX96 />)
    fillForm(ADDR_A, ADDR_B, '1')
    const resultArea = document.querySelector('.tool-result')!
    expect(within(resultArea as HTMLElement).getByText('Token Sort')).toBeInTheDocument()
  })

  it('swaps tokens when addrA > addrB', () => {
    render(<SqrtPriceX96 />)
    fillForm(ADDR_B, ADDR_A, '600')
    const resultArea = document.querySelector('.tool-result')!
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('sqrtPriceX96')).toBeInTheDocument()
  })

  it('price presets buttons work', () => {
    render(<SqrtPriceX96 />)
    fillForm(ADDR_A, ADDR_B, '')
    // "1:1" button — use getByRole to avoid matching the "1" text that appears elsewhere
    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
    const resultArea = document.querySelector('.tool-result')!
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('sqrtPriceX96')).toBeInTheDocument()
  })

  it('no result shown without price', () => {
    render(<SqrtPriceX96 />)
    fillForm(ADDR_A, ADDR_B, '')
    expect(document.querySelector('.tool-result')).toBeNull()
  })

  it('handles cross-decimal tokens', () => {
    render(<SqrtPriceX96 />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: ADDR_A } })
    fireEvent.change(inputs[1], { target: { value: '18' } }) // decA
    fireEvent.change(inputs[3], { target: { value: ADDR_B } })
    fireEvent.change(inputs[4], { target: { value: '6' } }) // decB
    fireEvent.change(inputs[6], { target: { value: '2000' } })
    const resultArea = document.querySelector('.tool-result')!
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('sqrtPriceX96')).toBeInTheDocument()
  })
})
