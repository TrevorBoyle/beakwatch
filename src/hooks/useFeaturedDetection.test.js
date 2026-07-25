import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useFeaturedDetection } from './useFeaturedDetection.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const history = {
  top30Days: [
    { commonName: 'Red Wattlebird', count: 200 },
    { commonName: 'Rainbow Lorikeet', count: 100 },
    { commonName: 'Eastern Spinebill', count: 4 },
  ],
}

function detection(commonName, minutesAgo = 0) {
  return { commonName, timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString() }
}

describe('useFeaturedDetection', () => {
  it('features the first detection on mount', () => {
    const { result } = renderHook(() => useFeaturedDetection([detection('Red Wattlebird')], history))
    expect(result.current.commonName).toBe('Red Wattlebird')
  })

  it('always refreshes to a newer sighting of the same featured species', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999) // would reject any switch if a roll were involved
    const first = [detection('Red Wattlebird', 5)]
    const { result, rerender } = renderHook(({ detections }) => useFeaturedDetection(detections, history), {
      initialProps: { detections: first },
    })
    const second = [detection('Red Wattlebird', 0)]
    rerender({ detections: second })
    expect(result.current.timestamp).toBe(second[0].timestamp)
  })

  it('almost always features a brand new species with no 30-day history', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999) // deliberately hostile roll
    const first = [detection('Red Wattlebird', 5)]
    const { result, rerender } = renderHook(({ detections }) => useFeaturedDetection(detections, history), {
      initialProps: { detections: first },
    })
    const second = [detection('Firetail Finch', 0), ...first]
    rerender({ detections: second })
    expect(result.current.commonName).toBe('Firetail Finch')
  })

  it('usually declines to re-feature a very common species (high roll)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const first = [detection('Eastern Spinebill', 5)]
    const { result, rerender } = renderHook(({ detections }) => useFeaturedDetection(detections, history), {
      initialProps: { detections: first },
    })
    const second = [detection('Red Wattlebird', 0), ...first]
    rerender({ detections: second })
    expect(result.current.commonName).toBe('Eastern Spinebill')
  })

  it('can still switch to a common species on a lucky low roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0001)
    const first = [detection('Eastern Spinebill', 5)]
    const { result, rerender } = renderHook(({ detections }) => useFeaturedDetection(detections, history), {
      initialProps: { detections: first },
    })
    const second = [detection('Red Wattlebird', 0), ...first]
    rerender({ detections: second })
    expect(result.current.commonName).toBe('Red Wattlebird')
  })

  it('force-switches once the featured sighting is older than the max age, regardless of roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const first = [detection('Eastern Spinebill', 60)] // 60 minutes old — past FEATURE_MAX_AGE
    const { result, rerender } = renderHook(({ detections }) => useFeaturedDetection(detections, history), {
      initialProps: { detections: first },
    })
    const second = [detection('Red Wattlebird', 0), ...first]
    rerender({ detections: second })
    expect(result.current.commonName).toBe('Red Wattlebird')
  })
})
