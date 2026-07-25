import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useFeaturedDetection } from '../../hooks/useFeaturedDetection.js'
import { pickProfileSpecies } from '../../hooks/useProfileSpecies.js'
import LastIdentified from './LastIdentified.jsx'
import BirdProfile from './BirdProfile.jsx'
import DailyTopBirds from './DailyTopBirds.jsx'
import TopSpecies from './TopSpecies.jsx'
import RareVisitors from './RareVisitors.jsx'
import Collage from './Collage.jsx'
import CollageFrequency from './CollageFrequency.jsx'
import NoActivity from './NoActivity.jsx'
import { birdImageUrl, collageImageUrl, preloadImages } from '../../utils/preload.js'

const SLIDE_INTERVAL = 20_000
const NO_ACTIVITY_WINDOW = 30 * 60_000
const STALE_THRESHOLD = 5 * 60_000
// Generous headroom above the current species count so a rarely-heard
// (or brand new) visitor never quietly loses a tie-break and drops out of
// the collage entirely — better to let tiles get smaller as more species
// accumulate than to arbitrarily hide the least common ones.
const MAX_COLLAGE_SPECIES = 50

// Merges recent detections + 30-day top species + rare visitors into one
// deduplicated, frequency-sorted list for the Collage panel — the sort
// order doubles as each tile's size rank (see Collage.jsx's tierClass).
// Prefers the most authoritative count available for each species: 30-day
// detection count, then all-time count, then a tally from recent detections
// for species history hasn't caught up with yet.
function collageSpeciesList({ detections, history }) {
  const counts = new Map()
  const bump = (commonName, count) => {
    if (!commonName) return
    counts.set(commonName, Math.max(counts.get(commonName) ?? 0, count))
  }
  ;(history?.top30Days ?? []).forEach(s => bump(s.commonName, s.count))
  ;(history?.rareVisitors ?? []).forEach(s => bump(s.commonName, s.allTimeCount))

  const recentCounts = new Map()
  detections.slice(0, 20).forEach(d => {
    if (!d.commonName) return
    recentCounts.set(d.commonName, (recentCounts.get(d.commonName) ?? 0) + 1)
  })
  recentCounts.forEach((count, commonName) => bump(commonName, count))

  return [...counts.entries()]
    .map(([commonName, count]) => ({ commonName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLLAGE_SPECIES)
}

// todayStats is one row per (species, hour) — collapse to one ranked total
// per species for the 24-hour "Most Popular Species" slide, the same shape
// history.top30Days already comes in.
function todaySpeciesList(todayStats) {
  const counts = new Map()
  for (const d of todayStats) {
    if (!d.commonName) continue
    counts.set(d.commonName, (counts.get(d.commonName) ?? 0) + d.count)
  }
  return [...counts.entries()]
    .map(([commonName, count]) => ({ commonName, count }))
    .sort((a, b) => b.count - a.count)
}

function slideImageUrls(key, { detections, todayStats, history }) {
  switch (key) {
    case 'last':
      return detections[0] ? [birdImageUrl(detections[0].commonName, 1000)] : []
    case 'profile': {
      const species = pickProfileSpecies(detections, todayStats, history)
      return species ? [birdImageUrl(species.commonName, 800)] : []
    }
    case 'today':
      return todayStats.slice(0, 15).map(s => birdImageUrl(s.commonName, 28))
    case 'top24':
      return todaySpeciesList(todayStats).slice(0, 10).map(s => birdImageUrl(s.commonName, 40))
    case 'top30':
      return (history?.top30Days ?? []).slice(0, 10).map(s => birdImageUrl(s.commonName, 40))
    case 'rare':
      return (history?.rareVisitors ?? []).slice(0, 6).map(s => birdImageUrl(s.commonName, 400))
    case 'collage':
    case 'collageFrequency':
      return collageSpeciesList({ detections, history }).map(s => collageImageUrl(s.commonName))
    default:
      return []
  }
}

function isNetworkStale(lastSuccessAt) {
  return Date.now() - lastSuccessAt > STALE_THRESHOLD
}

function isRecentActivityStale(detections) {
  if (detections.length === 0) return true
  const latest = new Date(detections[0].timestamp).getTime()
  return Date.now() - latest > NO_ACTIVITY_WINDOW
}

export default function HeroRotator({ detections, todayStats = [], history, lastSuccessAt, isPlaying = true }) {
  const [slideIndex, setSlideIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef(null)
  const tidRef = useRef(null)

  const recentStale = isRecentActivityStale(detections)

  // "Last Identified" / "Species Profile" show this rather than the literal
  // detections[0] — a rarity-weighted pick so the display isn't dominated by
  // whichever 1-2 species chirp constantly. See useFeaturedDetection for the
  // weighting itself.
  const featured = useFeaturedDetection(detections, history)

  // A repeat back-to-back detection is spotlight-*eligible*, but a coin flip
  // decides whether it actually shows — otherwise a species that visits
  // constantly (and so racks up back-to-back detections far more often than
  // anyone else) would win Spotlight almost every time it appeared. Spotlight
  // only applies when the featured pick IS the actual latest sighting (not
  // an older rare one still being held), and that sighting repeated back-to-
  // back. The flip is memoized on the latest detection's timestamp so it's
  // drawn once per new detection, not re-rolled on every render/rotation tick.
  // latestTimestamp is an intentional cache-invalidation key, not a value the callback reads.
  const latestTimestamp = detections[0]?.timestamp
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spotlightRoll = useMemo(() => Math.random(), [latestTimestamp])
  const isRepeatDetection =
    featured &&
    detections.length >= 2 &&
    detections[0].commonName === featured.commonName &&
    detections[1].commonName === featured.commonName
  const isSpotlight = isRepeatDetection && spotlightRoll < 0.5

  const collageSpecies = useMemo(
    () => collageSpeciesList({ detections, history }),
    [detections, history]
  )

  const todayTopSpecies = useMemo(() => todaySpeciesList(todayStats), [todayStats])

  // Each slide carries a human title so we can name the ones currently waiting
  // on data. Only slides with data join the rotation, rather than showing a
  // contradictory "resting" screen for one still waiting on data.
  const catalog = useMemo(() => [
    { key: 'last', title: 'Last Identified', available: detections.length > 0 && !recentStale && !isNetworkStale(lastSuccessAt) },
    { key: 'profile', title: 'Species Profile', available: detections.length > 0 },
    { key: 'today', title: 'Activity Patterns', available: todayStats.length > 0 },
    { key: 'collageFrequency', title: 'Recent Frequency', available: collageSpecies.length > 0 },
    { key: 'top24', title: 'Most Popular Species (24hrs)', available: todayTopSpecies.length > 0 },
    { key: 'top30', title: 'Most Popular Species (30 days)', available: (history?.top30Days?.length ?? 0) > 0 },
    { key: 'rare', title: 'Rare Visitors', available: (history?.rareVisitors?.length ?? 0) > 0 },
    { key: 'collage', title: 'Collage', available: collageSpecies.length > 0 },
  ], [detections, todayStats, history, lastSuccessAt, recentStale, collageSpecies, todayTopSpecies])

  const slides = useMemo(() => catalog.filter(s => s.available).map(s => s.key), [catalog])

  const availableRef = useRef(slides)
  availableRef.current = slides

  const advance = useCallback(() => {
    setVisible(false)
    tidRef.current = setTimeout(() => {
      setSlideIndex(i => (i + 1) % (availableRef.current.length || 1))
      setVisible(true)
    }, 500)
  }, [])

  // When paused, this just clears any existing timer and stops — advancing
  // only happens via the manual click-through handler below, which still
  // works while paused since it doesn't go through here.
  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current)
    if (!isPlaying) return
    intervalRef.current = setInterval(advance, SLIDE_INTERVAL)
  }, [advance, isPlaying])

  useEffect(() => {
    startInterval()
    return () => { clearInterval(intervalRef.current); clearTimeout(tidRef.current) }
  }, [startInterval])

  useEffect(() => {
    if (slides.length === 0) return
    const nextKey = slides[(slideIndex + 1) % slides.length]
    preloadImages(slideImageUrls(nextKey, { detections, todayStats, history }))
  }, [slideIndex, slides, detections, todayStats, history])

  function handleActivate() {
    clearTimeout(tidRef.current)
    advance()
    startInterval()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleActivate()
    }
  }

  if (slides.length === 0) return <NoActivity />

  const currentSlide = slides[slideIndex % slides.length]
  const todayCount = currentSlide === 'last'
    ? todayStats.filter(d => d.commonName === featured?.commonName).reduce((sum, d) => sum + d.count, 0)
    : 0

  return (
    <div className="relative h-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Advance to next slide"
        className="h-full motion-safe:transition-opacity motion-safe:duration-500 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
      >
        {currentSlide === 'last' && (
          <LastIdentified
            detection={featured}
            isSpotlight={isSpotlight}
            todayCount={todayCount}
          />
        )}
        {currentSlide === 'profile' && <BirdProfile detections={detections} todayStats={todayStats} history={history} />}
        {currentSlide === 'today' && <DailyTopBirds todayStats={todayStats} />}
        {currentSlide === 'top24' && <TopSpecies species={todayTopSpecies} title="Most Popular Species: 24 hours" />}
        {currentSlide === 'top30' && <TopSpecies species={history.top30Days} title="Most Popular Species: 30 Days" />}
        {currentSlide === 'rare' && <RareVisitors species={history.rareVisitors} />}
        {currentSlide === 'collage' && <Collage species={collageSpecies} />}
        {currentSlide === 'collageFrequency' && <CollageFrequency species={collageSpecies} detections={detections} />}
      </div>
    </div>
  )
}
