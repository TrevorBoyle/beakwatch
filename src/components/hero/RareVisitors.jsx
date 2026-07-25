import BirdImage from '../BirdImage.jsx'
import ConfidenceBadge from '../ConfidenceBadge.jsx'

export default function RareVisitors({ species }) {
  return (
    <div className="h-full flex flex-col p-8 bg-paper-raised">
      <h2 className="text-2xl font-display font-bold text-ink mb-1">Rare Visitors</h2>
      <p className="text-sm text-ink-faint mb-5">Least frequently heard</p>
      {/* 4x2 rather than 4x3 — forcing grid-rows-N to fill the panel's
          height stretched each cell into a non-square rectangle, unlike the
          square thumbnails used everywhere else in the app. Cells are now
          aspect-square (sized purely off the 4-column width), and the grid
          is vertically centered rather than stretched to fill the taller
          panel — fewer species shown (8), but every tile is a true square.
          No rank badge: the detection count already says how rare each one
          is. */}
      <div className="grid grid-cols-4 gap-3 flex-1 min-h-0 content-center">
        {species.slice(0, 8).map(s => (
          <div key={s.commonName} className="relative aspect-square rounded-lg overflow-hidden bg-line-soft">
            <BirdImage
              commonName={s.commonName}
              alt={s.commonName}
              width={400}
              className="absolute inset-0 w-full h-full object-contain"
            />
            {/* Light paper-toned scrim rather than the dark vignette used on
                photo-forward screens elsewhere — this panel is a grid of
                small tiles, not one big hero photo, and a dark bottom edge
                on every tile read as its own separate dark theme instead of
                matching the rest of the app's palette. Custom stops (rather
                than the default 0/50/100 spread) keep it tight to the text
                area at the bottom instead of washing out the bird's color
                across the whole tile. The stop directly behind the text is
                fully opaque (not just mostly) — against a solid dark bird
                like the Little Raven, even 30% see-through was enough to
                darken the backing and kill ink-on-paper contrast. Only the
                zone above the text fades toward transparent. */}
            <div className="absolute inset-0 bg-gradient-to-t from-paper from-0% via-paper via-[25%] to-transparent to-[45%]" />
            {s.avgConfidence != null && (
              <div className="absolute top-2 left-2">
                <ConfidenceBadge value={s.avgConfidence} />
              </div>
            )}
            <div className="absolute bottom-2.5 left-2.5 right-2.5">
              <p className="text-ink font-display font-semibold text-sm leading-tight truncate">{s.commonName}</p>
              <p className="text-ink-soft text-xs mt-0.5">
                {s.allTimeCount} {s.allTimeCount === 1 ? 'detection' : 'detections'} ever
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
