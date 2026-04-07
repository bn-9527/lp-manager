import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/render'
import App from '../../App'

// useQueryClient is NOT in setup.ts global mock, so mock it here
// (AddLiquidity component uses useQueryClient)
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })) }
})

describe('App', () => {
  it('renders title', () => {
    renderWithProviders(<App />)
    expect(screen.getByRole('heading', { name: 'V4 LP Manager' })).toBeInTheDocument()
  })

  it('renders three main tabs', () => {
    renderWithProviders(<App />)
    // Use getByRole to match tab buttons specifically, avoiding collision with content text
    const buttons = screen.getAllByRole('button')
    const tabNames = buttons.map(b => b.textContent)
    expect(tabNames).toContain('Add Liquidity')
    expect(tabNames).toContain('Hook Manager')
    expect(tabNames).toContain('Tools')
  })

  it('defaults to Add Liquidity tab', () => {
    renderWithProviders(<App />)
    // All tabs are rendered (display:none for inactive), so check the active tab button
    const addLiqBtn = screen.getByRole('button', { name: 'Add Liquidity' })
    expect(addLiqBtn.className).toContain('active')
  })

  it('switches to Hook Manager tab', () => {
    renderWithProviders(<App />)
    // Click the main tab button "Hook Manager" — there are multiple buttons but
    // the main-tabs buttons come first in the DOM
    const mainTabs = screen.getAllByRole('button')
    const hookTab = mainTabs.find(b => b.textContent === 'Hook Manager' && b.closest('.main-tabs'))
    fireEvent.click(hookTab ?? screen.getByText('Hook Manager'))
    expect(screen.getByText('Initialize Pool')).toBeInTheDocument()
  })

  it('switches to Tools tab', () => {
    renderWithProviders(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByText('Fee \u2192 TickSpacing')).toBeInTheDocument()
  })

  it('shows commit hash in footer', () => {
    renderWithProviders(<App />)
    expect(screen.getByText('build test-abc1234')).toBeInTheDocument()
  })
})
