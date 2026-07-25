import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useProfileSpecies } from './useProfileSpecies.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function detection(commonName, minutesAgo = 0) {
  return { commonName, timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString() }
}

const history = {
  top30Days: [
    { commonName: 'Red Wattlebird', count: 200 },
    { commonName: 'Rainbow Lorikeet', count: 100 },
    { commonName: 'Eastern Spinebill', count: 4 },
  ],
}

describe('useProfileSpecies', () => {
  it('falls back to the most recent detection when nothing has been heard today', () => {
    const detections = [detection('Red Wattlebird')]
    const { result } = renderHook(() => useProfileSpecies(detections, [], history))
    expect(result.current.commonName).toBe('Red Wattlebird')
  })

  it('returns null when there is no data at all', () => {
    const { result } = renderHook(() => useProfileSpecies([], [], null))
    expect(result.current).toBeNull()
  })

  it('picks the one species heard today when only one qualifies', () => {
    const detections = [detection('Rainbow Lorikeet')]
    const todayStats = [{ commonName: 'Rainbow Lorikeet', hour: 8, count: 5 }]
    const { result } = renderHook(() => useProfileSpecies(detections, todayStats, history))
    expect(result.current.commonName).toBe('Rainbow Lorikeet')
  })

  it('prefers an uncommon species heard today over a common one, regardless of the random roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999) // would pick the last/common one if the uncommon filter weren't applied
    const detections = [detection('Red Wattlebird'), detection('Eastern Spinebill', 10)]
    const todayStats = [
      { commonName: 'Red Wattlebird', hour: 8, count: 50 }, // common (200/200 = 100%)
      { commonName: 'Eastern Spinebill', hour: 9, count: 2 }, // uncommon (4/200 = 2%)
    ]
    const { result } = renderHook(() => useProfileSpecies(detections, todayStats, history))
    expect(result.current.commonName).toBe('Eastern Spinebill')
  })

  it('treats a species with no 30-day history as uncommon, so a brand new visitor gets preferred', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const detections = [detection('Red Wattlebird'), detection('Firetail Finch', 10)]
    const todayStats = [
      { commonName: 'Red Wattlebird', hour: 8, count: 50 },
      { commonName: 'Firetail Finch', hour: 9, count: 1 },
    ]
    const { result } = renderHook(() => useProfileSpecies(detections, todayStats, history))
    expect(result.current.commonName).toBe('Firetail Finch')
  })

  it('falls back to any species heard today when none of them qualify as uncommon', () => {
    const detections = [detection('Red Wattlebird'), detection('Rainbow Lorikeet', 10)]
    const todayStats = [
      { commonName: 'Red Wattlebird', hour: 8, count: 50 },
      { commonName: 'Rainbow Lorikeet', hour: 9, count: 30 },
    ]
    vi.spyOn(Math, 'random').mockReturnValue(0) // picks the first in the pool
    const { result } = renderHook(() => useProfileSpecies(detections, todayStats, history))
    expect(['Red Wattlebird', 'Rainbow Lorikeet']).toContain(result.current.commonName)
  })

  it('re-rolls on a timer, e.g. while paused on this slide', () => {
    const detections = [detection('Red Wattlebird'), detection('Eastern Spinebill', 10)]
    const todayStats = [
      { commonName: 'Red Wattlebird', hour: 8, count: 50 },
      { commonName: 'Eastern Spinebill', hour: 9, count: 2 },
    ]
    const randomSpy = vi.spyOn(Math, 'random')
    renderHook(() => useProfileSpecies(detections, todayStats, history))
    const callsAfterMount = randomSpy.mock.calls.length

    act(() => { vi.advanceTimersByTime(3 * 60_000) })
    expect(randomSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })
})
