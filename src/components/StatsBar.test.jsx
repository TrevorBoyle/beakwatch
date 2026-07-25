import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StatsBar from './StatsBar.jsx'

const todayStats = [
  { commonName: 'Wren' },
  { commonName: 'Robin' },
  { commonName: 'Wren' },
]

const history = {
  speciesLast30Days: 50,
  speciesAllTime: 124,
  newThisWeek: 3,
}

// Text is split across nested spans; use textContent check on the footer
function statText(container) {
  return container.querySelector('footer').textContent.replace(/\s+/g, ' ').trim()
}

describe('StatsBar', () => {
  it('shows count of distinct species in the last 24hrs', () => {
    const { container } = render(<StatsBar todayStats={todayStats} history={history} />)
    expect(statText(container)).toMatch(/2 species last 24hrs/)
  })

  it('shows last-30-day species count from history', () => {
    const { container } = render(<StatsBar todayStats={todayStats} history={history} />)
    expect(statText(container)).toMatch(/50 in last 30 days/)
  })

  it('shows all-time species count', () => {
    const { container } = render(<StatsBar todayStats={todayStats} history={history} />)
    expect(statText(container)).toMatch(/124 ever/)
  })

  it('shows new-this-week count', () => {
    const { container } = render(<StatsBar todayStats={todayStats} history={history} />)
    expect(statText(container)).toMatch(/3 new this week/)
  })

  it('shows sunrise and sunset alongside weather when present', () => {
    const weather = { emoji: '☀️', temp: 21, label: 'Clear', wind: 5, sunrise: '05:12', sunset: '21:04' }
    const { container } = render(<StatsBar todayStats={todayStats} history={history} weather={weather} />)
    expect(statText(container)).toMatch(/05:12/)
    expect(statText(container)).toMatch(/21:04/)
  })

  it('omits the sunrise/sunset block when weather has neither', () => {
    const weather = { emoji: '☀️', temp: 21, label: 'Clear', wind: 5, sunrise: null, sunset: null }
    const { container } = render(<StatsBar todayStats={todayStats} history={history} weather={weather} />)
    expect(statText(container)).not.toMatch(/🌙/)
  })

  it('renders dashes when data is not yet loaded', () => {
    render(<StatsBar todayStats={[]} history={null} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows a pause control when playing', () => {
    render(<StatsBar todayStats={todayStats} history={history} isPlaying={true} />)
    expect(screen.getByRole('button', { name: 'Pause slide rotation' })).toBeInTheDocument()
  })

  it('shows a resume control when paused', () => {
    render(<StatsBar todayStats={todayStats} history={history} isPlaying={false} />)
    expect(screen.getByRole('button', { name: 'Resume slide rotation' })).toBeInTheDocument()
  })

  it('calls onTogglePlaying when the play/pause button is clicked', () => {
    const onTogglePlaying = vi.fn()
    render(<StatsBar todayStats={todayStats} history={history} isPlaying={true} onTogglePlaying={onTogglePlaying} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause slide rotation' }))
    expect(onTogglePlaying).toHaveBeenCalledTimes(1)
  })
})
