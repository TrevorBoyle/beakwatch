import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import CollageFrequency from './CollageFrequency.jsx'

const species = [
  { commonName: 'Red Wattlebird', count: 171 },
  { commonName: 'Rainbow Lorikeet', count: 98 },
  { commonName: 'Eastern Spinebill', count: 10 },
]

function detectionsFor(counts) {
  // newest-first, matching useDetections' shape
  const out = []
  Object.entries(counts).forEach(([commonName, count]) => {
    for (let i = 0; i < count; i++) out.push({ commonName, timestamp: new Date().toISOString() })
  })
  return out
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CollageFrequency', () => {
  it('renders a cutout image for every front-layer species', () => {
    render(<CollageFrequency species={species} detections={[]} />)
    expect(screen.getByAltText('Red Wattlebird')).toBeInTheDocument()
    expect(screen.getByAltText('Rainbow Lorikeet')).toBeInTheDocument()
    expect(screen.getByAltText('Eastern Spinebill')).toBeInTheDocument()
  })

  it('renders one tile per occurrence in the recent detections for the frequency layer', () => {
    const detections = detectionsFor({ 'Red Wattlebird': 5, 'Rainbow Lorikeet': 2 })
    render(<CollageFrequency species={species} detections={detections} />)
    expect(screen.getAllByAltText('Red Wattlebird').length).toBe(1 /* front layer */ + 5)
    expect(screen.getAllByAltText('Rainbow Lorikeet').length).toBe(1 + 2)
    expect(screen.getAllByAltText('Eastern Spinebill').length).toBe(1) // front layer only, no recent detections
  })

  it('only tallies frequency over the most recent 100 detections', () => {
    const detections = detectionsFor({ 'Red Wattlebird': 120 })
    render(<CollageFrequency species={species} detections={detections} />)
    expect(screen.getAllByAltText('Red Wattlebird').length).toBe(1 + 100)
  })

  it('renders nothing when there are no species and no recent detections', () => {
    const { container } = render(<CollageFrequency species={[]} detections={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still renders the frequency layer even when the front layer has no species', () => {
    const detections = detectionsFor({ Wren: 3 })
    render(<CollageFrequency species={[]} detections={detections} />)
    expect(screen.getAllByAltText('Wren').length).toBe(3)
  })

  it('drops a front-layer tile once its image fails to load, without affecting the others', () => {
    render(<CollageFrequency species={species} detections={[]} />)
    fireEvent.error(screen.getByAltText('Rainbow Lorikeet'))
    expect(screen.queryByAltText('Rainbow Lorikeet')).not.toBeInTheDocument()
    expect(screen.getByAltText('Red Wattlebird')).toBeInTheDocument()
    expect(screen.getByAltText('Eastern Spinebill')).toBeInTheDocument()
  })

  it('drops every frequency-layer tile for a species once its image fails to load', () => {
    const detections = detectionsFor({ 'Rainbow Lorikeet': 4 })
    render(<CollageFrequency species={species} detections={detections} />)
    const [first] = screen.getAllByAltText('Rainbow Lorikeet')
    fireEvent.error(first)
    expect(screen.queryByAltText('Rainbow Lorikeet')).not.toBeInTheDocument()
  })

  it('re-randomizes the layout on a timer, e.g. while paused on this slide', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    render(<CollageFrequency species={species} detections={[]} />)
    const callsAfterMount = randomSpy.mock.calls.length

    act(() => { vi.advanceTimersByTime(3 * 60_000) })
    expect(randomSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })
})
