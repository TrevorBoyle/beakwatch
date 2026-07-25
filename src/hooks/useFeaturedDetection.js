import { useState, useRef, useEffect, useMemo } from 'react'

const FEATURE_MAX_AGE = 45 * 60_000 // don't let a rare sighting hold the spot forever if nothing else comes along
const MIN_SWITCH_PROBABILITY = 0.05 // even the most common species gets a small chance, so the screen never feels frozen on one bird

// Rather than always showing the literal most recent detection — which just
// reflects whichever species chirps most — this weights which sighting gets
// "featured" by rarity: a species with a high 30-day count needs a lucky
// dice roll to take the spot, while a species with little/no history is
// almost guaranteed to. This is what keeps a kiosk display from being
// dominated by the one or two most frequent visitors.
export function useFeaturedDetection(detections, history) {
  const commonnessByName = useMemo(() => {
    const map = new Map()
    for (const s of history?.top30Days ?? []) map.set(s.commonName, s.count)
    return map
  }, [history])

  const maxCommonCount = useMemo(() => {
    let max = 1
    for (const count of commonnessByName.values()) if (count > max) max = count
    return max
  }, [commonnessByName])

  const [featured, setFeatured] = useState(() => detections[0] ?? null)
  const featuredRef = useRef(featured)
  featuredRef.current = featured

  const latest = detections[0]
  const latestTimestamp = latest?.timestamp
  const latestCommonName = latest?.commonName

  // Only re-evaluate when a genuinely new detection has arrived (a new
  // timestamp+species pair), not on every polling tick — otherwise the same
  // detection would re-roll its odds repeatedly while it sits at index 0.
  useEffect(() => {
    if (!latest) return
    const current = featuredRef.current

    if (!current || latestCommonName === current.commonName) {
      setFeatured(latest)
      return
    }

    const age = Date.now() - new Date(current.timestamp).getTime()
    if (age > FEATURE_MAX_AGE) {
      setFeatured(latest)
      return
    }

    // No 30-day history yet at all counts as maximally rare — a brand new
    // visitor should essentially always get featured immediately.
    const count = commonnessByName.get(latestCommonName)
    const commonness = count == null ? 0 : count / maxCommonCount
    const switchProbability = Math.max(MIN_SWITCH_PROBABILITY, (1 - commonness) ** 2)
    if (Math.random() < switchProbability) setFeatured(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTimestamp, latestCommonName])

  return featured
}
