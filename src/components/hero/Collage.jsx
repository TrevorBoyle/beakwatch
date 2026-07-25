import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { collageImageUrl } from '../../utils/preload.js'
import { hashStr, mulberry32, seededShuffle, seededRandomFor } from '../../utils/seededRandom.js'

const MARGIN = 14 // px breathing room on all four edges

const FILL_FACTOR = 0.75 //0.65 target fraction of the usable area covered by tile "circles" — high enough to read as densely packed, not a perfect 100% (some paper peeking through between tiles is part of the scattered-poster look)
const SIZE_MIN_MULT = 0.55 // smallest tile vs. the average circle size for this many species
const SIZE_MAX_MULT = 1.7 // largest tile vs. average — the most frequent species should dominate visibly
const PADDING = 0.0 // 0.12 0.22 invisible buffer added to each tile's radius for spacing purposes only (not its rendered size) — the cutouts are now trimmed tight to the bird with no built-in whitespace, so without this the birds themselves visibly overlap rather than just their (previously blank) tile corners
const OVERLAP_ALLOWANCE = 0.0 //0.12 fraction of two tiles' combined *padded* radii they're allowed to overlap — this plus PADDING is what still gives the scatter some organic overlap without the birds themselves colliding much
const MIN_SEPARATION = 0.55 // reject placements deeper than this (fraction of combined padded radii) so one tile never nearly disappears behind another
const EDGE_BLEED = 0.3 // fraction of a tile's own radius allowed to spill past the usable-area edge, so border tiles crop naturally instead of leaving a hard empty margin
const SPIRAL_STEP = 5 // px the search radius grows per step
const SPIRAL_ANGLE_STEP = 0.4 // radians per step
const MAX_SPIRAL_STEPS = 2000
const JITTER_PX = 1 // small random nudge applied to each tile's final rendered position (not used for collision math) — keeps the scatter from reading as too precisely computed
const FLIP_CHANCE = 0.5 // odds a tile is mirrored horizontally, so birds aren't all facing the same way
const LAYOUT_REFRESH_INTERVAL = 3 * 60_000 // re-randomize the whole scatter periodically — otherwise it's frozen for as long as this slide stays on screen, which is unnoticeable during normal rotation (it unmounts within seconds) but very noticeable if the app is paused here
const RESIZE_SETTLE_MS = 200 // debounce ResizeObserver commits by this long — the panel's measured size can shift slightly just after mount (e.g. a web font finishing its swap and reflowing the shared page layout), and committing that transient size would otherwise be visible as tiles briefly appearing then relocating

// Places tiles with a word-cloud-style outward spiral search using a seeded
// PRNG: largest/most-frequent species go first and claim the center, then
// each subsequent tile spirals outward from the center until it finds a spot
// that doesn't overlap existing tiles by more than OVERLAP_ALLOWANCE.
// Controlled overlap (rather than a strict non-overlapping pack) is what
// gives the scatter its chaotic, filled-in look instead of reading as a
// grid. layoutSeed is a fresh random value from the component below —
// generated on mount and re-rolled periodically — folded into the hash seed
// so the whole layout (order, positions, jitter, flips) comes out different
// each time, while staying fixed between reseeds.
function buildLayout(items, usableW, usableH, layoutSeed) {
  const n = items.length
  if (n === 0) return []

  const measured = usableW > 0 && usableH > 0
  if (!measured) {
    // First mount (no real measurement yet) or a non-browser test
    // environment with no ResizeObserver — keep tiles in the DOM already,
    // just zero-sized until real dimensions land.
    return items.map(s => ({ commonName: s.commonName, cx: 0, cy: 0, size: 0, z: 0, flip: false }))
  }

  const seed = `${layoutSeed}:${items.map(s => s.commonName).sort().join('|')}`
  const rand = mulberry32(hashStr(seed))

  const counts = items.map(s => s.count)
  const minCount = Math.min(...counts)
  const maxCount = Math.max(...counts)

  const usableArea = usableW * usableH
  const avgArea = (usableArea * FILL_FACTOR) / n
  const avgR = Math.sqrt(avgArea / Math.PI)

  const cx0 = usableW / 2
  const cy0 = usableH / 2
  // The spiral's x-step is stretched by the panel's own aspect ratio so it
  // fills a wide-short 1024x600 panel sideways rather than spiralling into a
  // circle and leaving the side corners empty.
  const aspect = usableW / usableH
  const maxSearchRadius = Math.sqrt(usableW * usableW + usableH * usableH) / 2 + avgR * SIZE_MAX_MULT

  // Placement order is shuffled rather than largest-first — which species
  // claims the best (most central) ground is itself part of the randomness
  // being asked for, not just each tile's final position.
  const order = seededShuffle(items.map((_, i) => i), rand)

  const placed = []
  const results = new Array(n)

  order.forEach(idx => {
    const s = items[idx]
    const t = maxCount === minCount ? 0.5 : Math.sqrt((s.count - minCount) / (maxCount - minCount))
    const r = avgR * (SIZE_MIN_MULT + t * (SIZE_MAX_MULT - SIZE_MIN_MULT))
    const rc = r * (1 + PADDING) // collision radius — used for inter-tile spacing only, not the rendered size or the canvas-edge bounds check below

    const startAngle = rand() * Math.PI * 2
    let bestPos = null
    let bestScore = Infinity

    for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
      const radius = step * SPIRAL_STEP
      if (radius > maxSearchRadius) break
      const angle = startAngle + step * SPIRAL_ANGLE_STEP
      const x = cx0 + Math.cos(angle) * radius * aspect
      const y = cy0 + Math.sin(angle) * radius

      // Bounds are checked against the tile's own rendered edge (center ± r),
      // not the center point itself — checking the center against a small
      // bleed offset would let up to a full radius hang off-canvas, not just
      // the intended EDGE_BLEED fraction of it.
      const bleed = r * EDGE_BLEED
      if (
        (x - r) < -bleed ||
        (x + r) > usableW + bleed ||
        (y - r) < -bleed ||
        (y + r) > usableH + bleed
      ) continue

      let overlapCost = 0
      let tooClose = false
      for (const p of placed) {
        const dx = x - p.cx, dy = y - p.cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = (rc + p.rc) * (1 - OVERLAP_ALLOWANCE)
        if (dist < minDist) {
          const depth = minDist - dist
          overlapCost += depth * depth
          if (dist < (rc + p.rc) * MIN_SEPARATION) tooClose = true
        }
      }
      if (tooClose) continue

      if (overlapCost < bestScore) {
        bestScore = overlapCost
        bestPos = { x, y }
        if (overlapCost === 0) break
      }
    }

    const pos = bestPos ?? { x: cx0 + (rand() - 0.5) * usableW, y: cy0 + (rand() - 0.5) * usableH }
    // Collision math for tiles placed after this one uses the clean pos —
    // the jitter below is a purely cosmetic final nudge, not fed back in.
    placed.push({ cx: pos.x, cy: pos.y, rc })
    const jx = (seededRandomFor(`${seed}:${s.commonName}:jx`) - 0.5) * 2 * JITTER_PX
    const jy = (seededRandomFor(`${seed}:${s.commonName}:jy`) - 0.5) * 2 * JITTER_PX
    const flip = seededRandomFor(`${seed}:${s.commonName}:flip`) < FLIP_CHANCE
    results[idx] = {
      commonName: s.commonName,
      cx: pos.x + jx,
      cy: pos.y + jy,
      size: r * 2,
      // Stacking is by size, not placement order — order is now shuffled
      // (see above), so it no longer means "smaller ones placed later."
      // Smaller tiles render on top so overlaps never bury a small bird
      // entirely behind a big one.
      z: Math.round(-r),
      flip,
    }
  })

  return results
}

export default function Collage({ species = [] }) {
  const [failed, setFailed] = useState(() => new Set())
  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  // Seeds the whole scatter (order, positions, jitter, flips) — set once on
  // mount, which already means a fresh layout each time this slide rotates
  // back into view (it unmounts entirely when the hero rotator moves away,
  // see HeroRotator.jsx). Also re-rolled on a timer so it doesn't stay
  // frozen if the app is paused on this slide for a long stretch.
  const [layoutSeed, setLayoutSeed] = useState(() => Math.random())

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return
    let settleId = null
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      clearTimeout(settleId)
      settleId = setTimeout(() => setContainerSize({ w: width, h: height }), RESIZE_SETTLE_MS)
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); clearTimeout(settleId) }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setLayoutSeed(Math.random()), LAYOUT_REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const handleError = useCallback((commonName) => {
    setFailed(prev => (prev.has(commonName) ? prev : new Set(prev).add(commonName)))
  }, [])

  // Species without a cutout in bird-cutouts/ yet (see that folder's README)
  // are quietly dropped rather than shown as a broken image.
  const items = useMemo(
    () => species.filter(s => !failed.has(s.commonName)),
    [species, failed]
  )

  const usableW = Math.max(0, containerSize.w - MARGIN * 2)
  const usableH = Math.max(0, containerSize.h - MARGIN * 2)
  const layout = useMemo(
    () => buildLayout(items, usableW, usableH, layoutSeed),
    [items, usableW, usableH, layoutSeed]
  )

  // Forces every tile to remount (and so replay the fade-in animation below)
  // whenever the *arrangement* actually changes, rather than snapping
  // silently: going from unmeasured to measured, the measured size itself
  // changing (rounded, so subpixel noise doesn't retrigger this — covers a
  // real window resize, but also a settled size that still differs from
  // what RESIZE_SETTLE_MS committed), the species set changing (a new
  // detection joins the merged list while this slide is already on screen),
  // or the periodic reseed timer above.
  const layoutKey = `${Math.round(usableW)}x${Math.round(usableH)}:${layoutSeed}:${items.map(s => s.commonName).sort().join('|')}`

  if (items.length === 0) return null

  return (
    <div className="relative h-full bg-paper overflow-hidden">
      {/* isolate: without it, this div doesn't establish its own stacking
          context (position:absolute + overflow-hidden alone don't), so
          tiles with a negative z-index (see buildLayout's size-based
          stacking) could escape to the page's root stacking context
          instead of staying scoped to this panel — in practice rendering
          them invisible, not just mis-ordered. */}
      <div ref={containerRef} className="absolute inset-0 isolate">
        {layout.map(item => (
          <img
            key={`${item.commonName}:${layoutKey}`}
            src={collageImageUrl(item.commonName)}
            alt={item.commonName}
            onError={() => handleError(item.commonName)}
            className="absolute object-contain collage-tile"
            style={{
              width: item.size,
              height: item.size,
              left: MARGIN + item.cx,
              top: MARGIN + item.cy,
              transform: `translate(-50%, -50%)${item.flip ? ' scaleX(-1)' : ''}`,
              zIndex: item.z,
            }}
          />
        ))}
      </div>
    </div>
  )
}
