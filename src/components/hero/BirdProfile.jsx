import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import BirdImage from '../BirdImage.jsx'
import Badge from '../Badge.jsx'
import { useWikipediaExtract } from '../../hooks/useWikipediaExtract.js'
import { useProfileSpecies } from '../../hooks/useProfileSpecies.js'
import { timeAgo } from '../../utils/formatters.js'
import { confidenceTier } from '../../utils/confidence.js'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Some species' Wikipedia summaries run to 7-8 sentences — far more than the
// panel has room for. Rather than let CSS overflow crop the text mid-sentence
// (or mid-word), render every sentence, measure against the available box,
// and drop trailing sentences one at a time until it fits. Keyed by species
// in the parent so each new bird starts from the full extract again.
export function ClampedExtract({ extract }) {
  const sentences = useMemo(
    () => extract.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) ?? [extract],
    [extract]
  )
  const contentRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(sentences.length)

  useLayoutEffect(() => {
    const content = contentRef.current
    const container = content?.parentElement
    if (!content || !container || visibleCount <= 1) return
    if (content.scrollHeight > container.clientHeight) {
      setVisibleCount(n => n - 1)
    }
  }, [visibleCount, sentences])

  return (
    <div ref={contentRef} className="space-y-1.5">
      {sentences.slice(0, visibleCount).map((sentence, i) => (
        <p key={i} className="text-[13px] leading-snug text-ink-soft">{sentence}</p>
      ))}
    </div>
  )
}

export default function BirdProfile({ detections, todayStats, history }) {
  // Deliberately its own pick — independent from "Last Identified"'s
  // rarity-weighted one — so the two screens don't just show the same bird.
  // See useProfileSpecies for the selection itself.
  const detection = useProfileSpecies(detections, todayStats, history)
  const extract = useWikipediaExtract(detection?.commonName)
  const avgConfidence = history?.confidenceBySpecies?.[detection?.commonName] ?? null
  const confidenceStyle = avgConfidence != null ? confidenceTier(avgConfidence) : null

  const { hourly, todayTotal, maxCount, peakHour } = useMemo(() => {
    const hourly = Array(24).fill(0)
    for (const d of todayStats) {
      if (d.commonName === detection?.commonName) hourly[d.hour] += d.count
    }
    const todayTotal = hourly.reduce((a, b) => a + b, 0)
    const maxCount = Math.max(1, ...hourly)
    const peakHour = todayTotal > 0 ? hourly.indexOf(maxCount) : null
    return { hourly, todayTotal, maxCount, peakHour }
  }, [todayStats, detection?.commonName])

  if (!detection) return null

  const currentHour = new Date().getHours()

  return (
    <div className="h-full flex bg-paper-raised">

      {/* Left: photo, contained so it never upscales */}
      <div className="relative w-[38%] flex-shrink-0 overflow-hidden bg-hero-overlay">
        <div className="absolute inset-0 pt-12">
          <BirdImage
            commonName={detection.commonName}
            alt={detection.commonName}
            width={800}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-hero-overlay/80 via-hero-overlay/10 to-transparent" />
        {/* One combined badge rather than two stacked ones — avoids needing
            a separate narrow-viewport layout just to keep a second badge
            from colliding with the first. */}
        <div className="absolute top-6 left-6">
          <Badge variant="dark">Species Profile · {timeAgo(detection.timestamp)}</Badge>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-7 pb-7">
          <h2 className="text-3xl xl:text-4xl font-display font-bold text-white leading-tight tracking-tight">
            {detection.commonName}
          </h2>
          {detection.scientificName && (
            <p className="text-base font-display text-white/50 italic mt-1">{detection.scientificName}</p>
          )}
        </div>
      </div>

      {/* Right: info panel */}
      <div className="flex-1 flex flex-col px-8 py-8 overflow-hidden gap-4">

        {/* Wikipedia extract */}
        <div className="flex-1 min-h-0 overflow-hidden flex items-center">
          {extract ? (
            <ClampedExtract key={detection.commonName} extract={extract} />
          ) : (
            <div className="space-y-2.5">
              {[100, 90, 95, 80].map(w => (
                <div key={w} className="h-4 bg-line-soft rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
        </div>

        {/* Stats row */}
        {(todayTotal > 0 || avgConfidence != null) && (
          <div className="flex gap-6 flex-shrink-0">
            {todayTotal > 0 && (
              <div className="bg-forest-soft rounded-xl px-5 py-2 text-center">
                <p className="text-2xl font-display font-bold text-ink">{todayTotal}</p>
                <p className="text-xs text-ink-soft mt-0.5">detections last 24hrs</p>
              </div>
            )}
            {todayTotal > 0 && peakHour !== null && (
              <div className="bg-line-soft rounded-xl px-5 py-2 text-center">
                <p className="text-2xl font-display font-bold text-ink">{peakHour}:00</p>
                <p className="text-xs text-ink-soft mt-0.5">peak hour</p>
              </div>
            )}
            {avgConfidence != null && (
              <div className={`${confidenceStyle.bg} rounded-xl px-5 py-2 text-center`}>
                <p className={`text-2xl font-display font-bold ${confidenceStyle.text}`}>
                  {Math.round(avgConfidence * 100)}%
                </p>
                <p className="text-xs text-ink-soft mt-0.5">avg. confidence</p>
              </div>
            )}
          </div>
        )}

        {/* Hourly bar chart */}
        {todayTotal > 0 && (
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
                Activity last 24hrs by hour
              </p>
              {/* Bar height is always the detection count that hour — color
                  only ever means one extra thing (today's busiest hour), so
                  it's a single hue at two opacities rather than a second
                  color scale that would need its own explanation. */}
              <div className="flex items-center gap-3 text-[11px] text-ink-faint">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--color-forest)' }} />
                  Peak hour
                </span>
                <span className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid #D98F35' }}
                  />
                  Now
                </span>
              </div>
            </div>
            <div className="flex items-end gap-px h-11 pt-2">
              {HOURS.map(h => {
                const isCurrent = h === currentHour
                const isPeak = h === peakHour
                return (
                  <div key={h} className="flex-1 h-full relative">
                    <div className="absolute inset-0 rounded-sm bg-line-soft" />
                    {hourly[h] > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-sm transition-all"
                        style={{
                          height: `${Math.max(4, (hourly[h] / maxCount) * 100)}%`,
                          backgroundColor: 'var(--color-forest)',
                          opacity: isPeak ? 1 : 0.45,
                        }}
                      />
                    )}
                    {isCurrent && (
                      <span
                        aria-hidden="true"
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{
                          top: '-7px',
                          width: 0,
                          height: 0,
                          borderLeft: '4px solid transparent',
                          borderRight: '4px solid transparent',
                          borderTop: '6px solid #D98F35',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-ink-faint mt-1.5 px-px">
              {['0h', '6h', '12h', '18h', '23h'].map(l => <span key={l}>{l}</span>)}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
