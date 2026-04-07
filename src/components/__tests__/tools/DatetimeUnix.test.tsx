import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DatetimeUnix from '../../tools/DatetimeUnix'

describe('DatetimeUnix', () => {
  it('renders date, time inputs and Now button', () => {
    render(<DatetimeUnix />)
    expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 1772294340')).toBeInTheDocument()
  })

  it('converts unix timestamp to UTC datetime', () => {
    render(<DatetimeUnix />)
    const input = screen.getByPlaceholderText('e.g. 1772294340')
    fireEvent.change(input, { target: { value: '1700000000' } })
    // 1700000000 = 2023-11-14T22:13:20Z
    // "Timestamp" label appears in the result area as a kv-label.
    // Use the result container to scope queries.
    const resultArea = document.querySelector('.tool-result')!
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('1700000000')).toBeInTheDocument()
    expect(within(resultArea as HTMLElement).getByText('2023-11-14T22:13:20.000Z')).toBeInTheDocument()
  })

  it('shows timestamp in ms', () => {
    render(<DatetimeUnix />)
    const input = screen.getByPlaceholderText('e.g. 1772294340')
    fireEvent.change(input, { target: { value: '1700000000' } })
    const resultArea = document.querySelector('.tool-result')!
    expect(within(resultArea as HTMLElement).getByText('1700000000000')).toBeInTheDocument()
  })

  it('clears result for empty input', () => {
    render(<DatetimeUnix />)
    const input = screen.getByPlaceholderText('e.g. 1772294340')
    fireEvent.change(input, { target: { value: '1700000000' } })
    expect(document.querySelector('.tool-result')).toBeTruthy()
    fireEvent.change(input, { target: { value: '' } })
    expect(document.querySelector('.tool-result')).toBeNull()
  })

  it('handles invalid input gracefully', () => {
    render(<DatetimeUnix />)
    const input = screen.getByPlaceholderText('e.g. 1772294340')
    fireEvent.change(input, { target: { value: 'not-a-number' } })
    // No result section should appear
    expect(document.querySelector('.tool-result')).toBeNull()
  })

  it('Now button fills current time', () => {
    render(<DatetimeUnix />)
    fireEvent.click(screen.getByRole('button', { name: 'Now' }))
    // After clicking Now, the result area should appear with "Timestamp" label
    const resultArea = document.querySelector('.tool-result')
    expect(resultArea).toBeTruthy()
    expect(within(resultArea as HTMLElement).getByText('Timestamp')).toBeInTheDocument()
    expect(within(resultArea as HTMLElement).getByText('ISO 8601')).toBeInTheDocument()
  })
})
