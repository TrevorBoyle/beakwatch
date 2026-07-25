import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import Collage from './Collage.jsx'

const species = [
  { commonName: 'Red Wattlebird', count: 171 },
  { commonName: 'Rainbow Lorikeet', count: 98 },
  { commonName: 'Eastern Spinebill', count: 10 },
]

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Collage', () => {
  it('renders a cutout image for every species', () => {
    render(<Collage species={species} />)
    expect(screen.getByAltText('Red Wattlebird')).toBeInTheDocument()
    expect(screen.getByAltText('Rainbow Lorikeet')).toBeInTheDocument()
    expect(screen.getByAltText('Eastern Spinebill')).toBeInTheDocument()
  })

  it('renders nothing when there are no species', () => {
    const { container } = render(<Collage species={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('drops a tile once its image fails to load, without affecting the others', () => {
    render(<Collage species={species} />)
    fireEvent.error(screen.getByAltText('Rainbow Lorikeet'))
    expect(screen.queryByAltText('Rainbow Lorikeet')).not.toBeInTheDocument()
    expect(screen.getByAltText('Red Wattlebird')).toBeInTheDocument()
    expect(screen.getByAltText('Eastern Spinebill')).toBeInTheDocument()
  })

  it('re-randomizes the layout on a timer, e.g. while paused on this slide', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    render(<Collage species={species} />)
    const callsAfterMount = randomSpy.mock.calls.length

    act(() => { vi.advanceTimersByTime(3 * 60_000) })
    expect(randomSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('does not re-randomize before the refresh interval elapses', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    render(<Collage species={species} />)
    const callsAfterMount = randomSpy.mock.calls.length

    act(() => { vi.advanceTimersByTime(60_000) }) // 1 of 3 minutes
    expect(randomSpy.mock.calls.length).toBe(callsAfterMount)
  })

  it('remounts tiles on a periodic reseed so the fade-in replays instead of snapping to the new spot', () => {
    vi.useFakeTimers()
    render(<Collage species={species} />)
    const before = screen.getByAltText('Red Wattlebird')

    act(() => { vi.advanceTimersByTime(3 * 60_000) })
    const after = screen.getByAltText('Red Wattlebird')
    expect(after).not.toBe(before)
  })

  it('remounts tiles when the species list changes so a new arrival re-fades the whole scatter', () => {
    const { rerender } = render(<Collage species={species} />)
    const before = screen.getByAltText('Red Wattlebird')

    rerender(<Collage species={[...species, { commonName: 'Noisy Miner', count: 5 }]} />)
    const after = screen.getByAltText('Red Wattlebird')
    expect(after).not.toBe(before)
  })
})
