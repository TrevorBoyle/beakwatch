import BirdImage from '../BirdImage.jsx'
import Badge from '../Badge.jsx'
import { useWikipediaExtract } from '../../hooks/useWikipediaExtract.js'

export default function LastIdentified({ detection, isSpotlight, todayCount }) {
  const extract = useWikipediaExtract(detection?.commonName)

  if (!detection) return null

  return (
    <div className="relative h-full overflow-hidden bg-hero-overlay">
      {/* Top edge reserved for the badge — inset-0 let the photo run
          straight behind the pill with nothing but the gradient (which is
          near-transparent up there) protecting it. */}
      <BirdImage
        commonName={detection.commonName}
        alt={detection.commonName}
        width={1000}
        className="absolute inset-x-0 bottom-0 top-20 object-contain"
      />
      {/* Confined to the bottom ~60% (measured: the name/sciname/stat text
          block runs ~56% of the panel's height) rather than the full height
          — a long, mostly-dark fade is exactly the kind of gradient that
          bands visibly on 8-bit displays, so shortening the distance it
          travels still helps even at this size. A subtle noise layer on top
          covers the rest: it breaks up the smooth color steps that cause
          banding in the first place, so this can stay tall enough to back
          the whole text block without the name washing out. */}
      <div className="absolute bottom-0 inset-x-0 h-3/5 bg-gradient-to-t from-hero-overlay/90 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute bottom-0 inset-x-0 h-3/5 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* slide label badge */}
      <div className="absolute top-6 left-6">
        <Badge variant="dark">{isSpotlight ? 'Species Spotlight' : 'Recently Identified'}</Badge>
      </div>

      {/* bottom content */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 pt-16">
        <h2 className="text-5xl font-display font-bold text-white leading-tight tracking-tight">
          {detection.commonName}
        </h2>
        {detection.scientificName && (
          <p className="text-lg font-display text-white/50 mt-1 italic">{detection.scientificName}</p>
        )}
        {isSpotlight && todayCount != null && (
          <p className="text-2xl text-white/75 mt-3 font-light">
            {todayCount} detections last 24hrs
          </p>
        )}
        {!isSpotlight && extract && (
          <p className="text-base text-white/70 mt-4 max-w-xl leading-relaxed line-clamp-3">
            {extract}
          </p>
        )}
      </div>
    </div>
  )
}
