import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { collageImageUrl } from '../../utils/preload.js'
import { hashStr, mulberry32, seededShuffle, seededRandomFor } from '../../utils/seededRandom.js'

const MARGIN = 14 // px breathing room on all four edges

const FILL_FACTOR = 0.75
const SIZE_MIN_MULT = 0.55 // smallest tile vs. the average circle size for this many species — also the fixed size used for every frequency-layer tile below (see FREQ_SIZE below)
const SIZE_MAX_MULT = 1.7
const PADDING = 0.0
const OVERLAP_ALLOWANCE = 0.0
const MIN_SEPARATION = 0.55
const EDGE_BLEED = 0.3
const SPIRAL_STEP = 5
const SPIRAL_ANGLE_STEP = 0.4
const MAX_SPIRAL_STEPS = 2000
const JITTER_PX = 1
const FLIP_CHANCE = 0.5
const LAYOUT_REFRESH_INTERVAL = 3 * 60_000
const RESIZE_SETTLE_MS = 200

// Frequency layer (the scattered backdrop of repeated small tiles) tuning.
// It can hold far more tiles than the front layer at one fixed small size,
// so it's allowed to pack much tighter/overlap far more than the front layer
// — otherwise most placements would fail outright and get dumped at a random
// fallback spot instead of a spiral-searched one.
const FREQ_LIMIT = 100 // tally frequency over this many of the most recent identifications
const FREQ_OVERLAP_ALLOWANCE = 0.5
const FREQ_MIN_SEPARATION = 0.2
const FREQ_EDGE_BLEED = 0.3
const FREQ_MAX_SPIRAL_STEPS = 600
const FREQ_JITTER_PX = 3

// Same word-cloud-style outward spiral placement as Collage.jsx's buildLayout,
// specialized for a single fixed tile radius rather than per-item sizing —
// the frequency layer's tiles are all the same size (see freqR in the
// component below), so there's no need to rank/size by count here, only to
// scatter a lot of same-size tiles with generous overlap allowed.
function buildFrequencyLayout(tiles, usableW, usableH, layoutSeed, freqR) {
  const n = tiles.length
  if (n === 0) return []

  const measured = usableW > 0 && usableH > 0
  if (!measured || freqR <= 0) {
    return tiles.map(t => ({ commonName: t.commonName, key: t.key, cx: 0, cy: 0, size: 0, flip: false }))
  }

  const seed = `${layoutSeed}:freq:${tiles.map(t => t.key).join('|')}`
  const rand = mulberry32(hashStr(seed))

  const cx0 = usableW / 2
  const cy0 = usableH / 2
  const aspect = usableW / usableH
  const maxSearchRadius = Math.sqrt(usableW * usableW + usableH * usableH) / 2 + freqR

  const order = seededShuffle(tiles.map((_, i) => i), rand)
  const placed = []
  const results = new Array(n)

  order.forEach(idx => {
    const t = tiles[idx]
    const r = freqR
    const startAngle = rand() * Math.PI * 2
    let bestPos = null
    let bestScore = Infinity

    for (let step = 0; step < FREQ_MAX_SPIRAL_STEPS; step++) {
      const radius = step * SPIRAL_STEP
      if (radius > maxSearchRadius) break
      const angle = startAngle + step * SPIRAL_ANGLE_STEP
      const x = cx0 + Math.cos(angle) * radius * aspect
      const y = cy0 + Math.sin(angle) * radius

      const bleed = r * FREQ_EDGE_BLEED
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
        const minDist = (r + p.r) * (1 - FREQ_OVERLAP_ALLOWANCE)
        if (dist < minDist) {
          const depth = minDist - dist
          overlapCost += depth * depth
          if (dist < (r + p.r) * FREQ_MIN_SEPARATION) tooClose = true
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
    placed.push({ cx: pos.x, cy: pos.y, r })
    const jx = (seededRandomFor(`${seed}:${t.key}:jx`) - 0.5) * 2 * FREQ_JITTER_PX
    const jy = (seededRandomFor(`${seed}:${t.key}:jy`) - 0.5) * 2 * FREQ_JITTER_PX
    const flip = seededRandomFor(`${seed}:${t.key}:flip`) < FLIP_CHANCE
    results[idx] = {
      commonName: t.commonName,
      key: t.key,
      cx: pos.x + jx,
      cy: pos.y + jy,
      size: r * 2,
      flip,
    }
  })

  return results
}

// Identical to Collage.jsx's buildLayout — this front layer is a duplicate of
// that view, sized/placed the same way, rendered on top of the frequency
// backdrop below.
function buildLayout(items, usableW, usableH, layoutSeed) {
  const n = items.length
  if (n === 0) return []

  const measured = usableW > 0 && usableH > 0
  if (!measured) {
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
  const aspect = usableW / usableH
  const maxSearchRadius = Math.sqrt(usableW * usableW + usableH * usableH) / 2 + avgR * SIZE_MAX_MULT

  const order = seededShuffle(items.map((_, i) => i), rand)

  const placed = []
  const results = new Array(n)

  order.forEach(idx => {
    const s = items[idx]
    const t = maxCount === minCount ? 0.5 : Math.sqrt((s.count - minCount) / (maxCount - minCount))
    const r = avgR * (SIZE_MIN_MULT + t * (SIZE_MAX_MULT - SIZE_MIN_MULT))
    const rc = r * (1 + PADDING)

    const startAngle = rand() * Math.PI * 2
    let bestPos = null
    let bestScore = Infinity

    for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
      const radius = step * SPIRAL_STEP
      if (radius > maxSearchRadius) break
      const angle = startAngle + step * SPIRAL_ANGLE_STEP
      const x = cx0 + Math.cos(angle) * radius * aspect
      const y = cy0 + Math.sin(angle) * radius

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
    placed.push({ cx: pos.x, cy: pos.y, rc })
    const jx = (seededRandomFor(`${seed}:${s.commonName}:jx`) - 0.5) * 2 * JITTER_PX
    const jy = (seededRandomFor(`${seed}:${s.commonName}:jy`) - 0.5) * 2 * JITTER_PX
    const flip = seededRandomFor(`${seed}:${s.commonName}:flip`) < FLIP_CHANCE
    results[idx] = {
      commonName: s.commonName,
      cx: pos.x + jx,
      cy: pos.y + jy,
      size: r * 2,
      z: Math.round(-r),
      flip,
    }
  })

  return results
}

// Tallies how many times each species appears in the most recent `limit`
// detections (newest-first, as useDetections returns them) — this is a raw
// recency count, independent of the curated/capped species list the front
// layer uses, so a species can show up here even if it didn't make the
// front layer's top-N cut (and vice versa).
function recentFrequencyList(detections, limit) {
  const counts = new Map()
  detections.slice(0, limit).forEach(d => {
    if (!d.commonName) return
    counts.set(d.commonName, (counts.get(d.commonName) ?? 0) + 1)
  })
  return [...counts.entries()].map(([commonName, count]) => ({ commonName, count }))
}

// One tile per occurrence — a species heard 50 times in the window renders
// 50 individual (randomly flipped, scattered) cutouts, not one scaled-up tile.
function expandToTiles(freqList) {
  const tiles = []
  freqList.forEach(({ commonName, count }) => {
    for (let i = 0; i < count; i++) {
      tiles.push({ commonName, key: `${commonName}#${i}` })
    }
  })
  return tiles
}

export default function CollageFrequency({ species = [], detections = [] }) {
  const [failed, setFailed] = useState(() => new Set())
  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
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

  const items = useMemo(
    () => species.filter(s => !failed.has(s.commonName)),
    [species, failed]
  )

  const freqTiles = useMemo(() => {
    const list = recentFrequencyList(detections, FREQ_LIMIT)
    return expandToTiles(list).filter(t => !failed.has(t.commonName))
  }, [detections, failed])

  const usableW = Math.max(0, containerSize.w - MARGIN * 2)
  const usableH = Math.max(0, containerSize.h - MARGIN * 2)

  const layout = useMemo(
    () => buildLayout(items, usableW, usableH, layoutSeed),
    [items, usableW, usableH, layoutSeed]
  )

  // Fixed tile size for every frequency-layer tile: the same "smallest tile"
  // size the front layer would use for its own species count, so the two
  // layers read as one consistent scale rather than the backdrop looking
  // arbitrarily sized relative to the foreground.
  const freqR = useMemo(() => {
    // Falls back to sizing off the frequency layer's own tile count on the
    // rare chance the front layer is empty while recent detections aren't
    // (in practice the front layer's species list already folds in recent
    // detections, so this is mostly a defensive fallback).
    const n = items.length || freqTiles.length
    if (n === 0 || usableW <= 0 || usableH <= 0) return 0
    const usableArea = usableW * usableH
    const avgArea = (usableArea * FILL_FACTOR) / n
    const avgR = Math.sqrt(avgArea / Math.PI)
    return avgR * SIZE_MIN_MULT
  }, [items.length, freqTiles.length, usableW, usableH])

  const freqLayout = useMemo(
    () => buildFrequencyLayout(freqTiles, usableW, usableH, layoutSeed, freqR),
    [freqTiles, usableW, usableH, layoutSeed, freqR]
  )

  const layoutKey = `${Math.round(usableW)}x${Math.round(usableH)}:${layoutSeed}:${items.map(s => s.commonName).sort().join('|')}`
  const freqLayoutKey = `${Math.round(usableW)}x${Math.round(usableH)}:${layoutSeed}:${freqTiles.map(t => t.key).join('|')}`

  if (items.length === 0 && freqTiles.length === 0) return null

  return (
    <div className="relative h-full bg-paper overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 isolate">
        {freqLayout.map(item => (
          <img
            key={`${item.key}:${freqLayoutKey}`}
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
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 isolate">
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
