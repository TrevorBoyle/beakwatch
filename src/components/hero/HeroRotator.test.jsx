import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import HeroRotator from './HeroRotator.jsx'

vi.mock('./LastIdentified.jsx', () => ({
  default: ({ isSpotlight }) => <div data-spotlight={isSpotlight ? 'true' : 'false'}>LastIdentified</div>,
}))
vi.mock('./BirdProfile.jsx', () => ({ default: () => <div>BirdProfile</div> }))
vi.mock('./DailyTopBirds.jsx', () => ({ default: () => <div>DailyTopBirds</div> }))
vi.mock('./TopSpecies.jsx', () => ({
  default: ({ title, species }) => (
    <div>
      {title}
      {species?.map(s => <span key={s.commonName}>{s.commonName}:{s.count}</span>)}
    </div>
  ),
}))
vi.mock('./RareVisitors.jsx', () => ({ default: () => <div>RareVisitors</div> }))
vi.mock('./NoActivity.jsx', () => ({ default: () => <div>NoActivity</div> }))

const recentWithActivity = [
  { commonName: 'Wren', timestamp: new Date().toISOString(), confidence: 0.9 },
  { commonName: 'Robin', timestamp: new Date(Date.now() - 60_000).toISOString(), confidence: 0.8 },
]

const props = {
  detections: recentWithActivity,
  todayStats: [{ commonName: 'Wren', hour: 8, count: 35 }],
  history: { top30Days: [{ commonName: 'Wren', count: 100 }], rareVisitors: [{ commonName: 'Hawfinch', allTimeCount: 1 }] },
  lastSuccessAt: Date.now(),
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('HeroRotator', () => {
  it('starts on the LastIdentified slide', () => {
    render(<HeroRotator {...props} />)
    expect(screen.getByText('LastIdentified')).toBeInTheDocument()
  })

  it('advances to the next slide after the slide interval', () => {
    render(<HeroRotator {...props} />)
    act(() => { vi.advanceTimersByTime(20_000) })
    act(() => { vi.advanceTimersByTime(500) }) // crossfade
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
  })

  it('skips LastIdentified but still rotates other slides when detections are older than 30 minutes', () => {
    const staleDetections = [
      { commonName: 'Wren', timestamp: new Date(Date.now() - 31 * 60_000).toISOString(), confidence: 0.9 },
    ]
    render(<HeroRotator {...props} detections={staleDetections} />)
    // BirdProfile is the first available slide (Last Identified skipped)
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
  })

  it('skips LastIdentified when lastSuccessAt is stale, but shows other slides', () => {
    render(<HeroRotator {...props} lastSuccessAt={Date.now() - 6 * 60_000} />)
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
  })

  it('shows NoActivity only when all data sources are empty', () => {
    render(<HeroRotator
      detections={[]}
      todayStats={[]}
      history={{ top30Days: [], rareVisitors: [] }}
      lastSuccessAt={Date.now()}
    />)
    expect(screen.getByText('NoActivity')).toBeInTheDocument()
  })

  it('shows Species Spotlight when top 2 detections are the same species and the coin flip wins', () => {
    const sameSpecies = [
      { commonName: 'Wren', timestamp: new Date().toISOString(), confidence: 0.9 },
      { commonName: 'Wren', timestamp: new Date(Date.now() - 5_000).toISOString(), confidence: 0.8 },
    ]
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.5 — coin flip wins
    const { container } = render(<HeroRotator {...props} detections={sameSpecies} />)
    expect(container.querySelector('[data-spotlight="true"]')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('does not show Species Spotlight when the coin flip loses, even with a repeat species', () => {
    const sameSpecies = [
      { commonName: 'Wren', timestamp: new Date().toISOString(), confidence: 0.9 },
      { commonName: 'Wren', timestamp: new Date(Date.now() - 5_000).toISOString(), confidence: 0.8 },
    ]
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // >= 0.5 — coin flip loses
    const { container } = render(<HeroRotator {...props} detections={sameSpecies} />)
    expect(container.querySelector('[data-spotlight="false"]')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('never shows Species Spotlight when the top 2 detections are different species, regardless of the coin flip', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // would win the flip if it were even considered
    const { container } = render(<HeroRotator {...props} />) // Wren, then Robin
    expect(container.querySelector('[data-spotlight="false"]')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('does not inject a resting slide when only some data is missing', () => {
    const stale = [
      { commonName: 'Wren', timestamp: new Date(Date.now() - 3 * 60 * 60_000).toISOString(), confidence: 0.9 },
    ]
    // Stale detections (Last Identified unavailable) + no today data (Activity
    // Patterns unavailable), but 30-day history present.
    render(<HeroRotator {...props} detections={stale} todayStats={[]} />)

    // First available slide is BirdProfile — no resting/NoActivity in rotation
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
    expect(screen.queryByText('NoActivity')).not.toBeInTheDocument()

    // Rotating through the available slides never surfaces NoActivity
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByText('NoActivity')).not.toBeInTheDocument()
  })

  it('shows no "panels hidden" notice when every slide has data', () => {
    render(<HeroRotator {...props} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('skips the 30-day slide when history has no 30-day data', () => {
    render(<HeroRotator {...props} history={{ ...props.history, top30Days: [] }} />)
    // slides: last → profile → today → collageFrequency → top24 → rare (30-day excluded)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('Most Popular Species: 24 hours')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('RareVisitors')).toBeInTheDocument()
  })

  it('skips the 24-hour slide when there is no today data, but still shows the 30-day one', () => {
    render(<HeroRotator {...props} todayStats={[]} />)
    // "today" (Activity Patterns) and "top24" both need todayStats — with
    // none, they're both skipped: last → profile → collageFrequency → top30
    // (top30 present; collageFrequency only needs the merged species list,
    // not todayStats, so it stays in the rotation)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('Most Popular Species: 30 Days')).toBeInTheDocument()
  })

  it('shows the 24-hour slide with species totalled across hours, ranked highest first', () => {
    render(<HeroRotator {...props} todayStats={[
      { commonName: 'Wren', hour: 8, count: 5 },
      { commonName: 'Wren', hour: 9, count: 7 },
      { commonName: 'Robin', hour: 8, count: 3 },
    ]} />)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('Most Popular Species: 24 hours')).toBeInTheDocument()
    expect(screen.getByText('Wren:12')).toBeInTheDocument() // 5 + 7, summed across hours
    expect(screen.getByText('Robin:3')).toBeInTheDocument()
  })

  it('does not auto-advance when isPlaying is false', () => {
    render(<HeroRotator {...props} isPlaying={false} />)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('LastIdentified')).toBeInTheDocument()
  })

  it('still advances on manual click while paused, without resuming auto-play', () => {
    render(<HeroRotator {...props} isPlaying={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Advance to next slide' }))
    act(() => { vi.advanceTimersByTime(500) }) // crossfade
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()

    // No further auto-advance after the manual click, since still paused
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
  })

  it('resumes auto-advancing once isPlaying flips back to true', () => {
    const { rerender } = render(<HeroRotator {...props} isPlaying={false} />)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('LastIdentified')).toBeInTheDocument()

    rerender(<HeroRotator {...props} isPlaying={true} />)
    act(() => { vi.advanceTimersByTime(20_000) }); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('BirdProfile')).toBeInTheDocument()
  })
})
