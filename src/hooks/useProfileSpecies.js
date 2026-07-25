import { useState, useRef, useEffect } from 'react'

const REROLL_INTERVAL = 3 * 60_000 // periodic reroll — mainly matters if the app is paused on this slide for a while; a fresh pick already happens naturally each time it rotates back into view, since this component unmounts whenever it isn't the current slide
const UNCOMMON_THRESHOLD = 0.6 // a species heard today counts as "uncommon" if its 30-day count is below this fraction of the most-heard species' count

// Which species to feature on "Species Profile" — deliberately independent
// from "Last Identified"'s own rarity-weighted pick (useFeaturedDetection),
// so the two screens don't just show the same bird. Prefers a species that's
// both recent (heard in the last 24hrs) AND uncommon, so an unusual visitor
// gets surfaced here even if it isn't currently "featured" elsewhere; falls
// back to any species heard in the last 24hrs, picked at random, if none of
// today's species qualify as uncommon (already an improvement on always
// picking whichever species chirped the most today, since the pool is
// deduped by species rather than weighted by detection count).
// Exported separately (rather than just used internally) so HeroRotator can
// reuse the same logic to preload the right image ahead of time.
export function pickProfileSpecies(detections, todayStats, history) {
  const todayNames = [...new Set(todayStats.map(d => d.commonName))]

  if (todayNames.length === 0) {
    // Nothing heard yet today — fall back to whatever's most recent overall.
    return detections[0] ?? null
  }

  const countByName = new Map((history?.top30Days ?? []).map(s => [s.commonName, s.count]))
  const maxCount = Math.max(1, ...countByName.values())

  // No 30-day history at all counts as maximally uncommon — a brand new
  // visitor should be just as eligible as a rarely-heard regular.
  const uncommonNames = todayNames.filter(name => {
    const count = countByName.get(name)
    const commonness = count == null ? 0 : count / maxCount
    return commonness < UNCOMMON_THRESHOLD
  })

  const pool = uncommonNames.length > 0 ? uncommonNames : todayNames
  const chosenName = pool[Math.floor(Math.random() * pool.length)]

  return detections.find(d => d.commonName === chosenName) ?? detections[0] ?? null
}

export function useProfileSpecies(detections, todayStats, history) {
  const [species, setSpecies] = useState(() => pickProfileSpecies(detections, todayStats, history))

  // Re-picking should only happen on mount and on the periodic timer below —
  // not on every poll tick — so latest args are read from a ref rather than
  // being effect dependencies.
  const latestArgsRef = useRef()
  latestArgsRef.current = { detections, todayStats, history }

  useEffect(() => {
    const id = setInterval(() => {
      const { detections, todayStats, history } = latestArgsRef.current
      setSpecies(pickProfileSpecies(detections, todayStats, history))
    }, REROLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return species
}
