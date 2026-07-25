import BirdImage from '../BirdImage.jsx'

// Shared by the 30-day and 24-hour "most popular species" slides — same
// layout, just a different ranked species list and title passed in.
export default function TopSpecies({ species, title }) {
  const max = species[0]?.count || 1

  return (
    <div className="h-full flex flex-col p-8 bg-paper-raised overflow-hidden">
      <h2 className="text-2xl font-display font-bold text-ink mb-4">{title}</h2>
      {/* 2 columns of 5, filled column-major (grid-flow-col) so ranks 1-5 sit
          in the left column and 6-10 in the right — fewer rows per column
          means each row (and so each thumbnail) can be noticeably larger. */}
      <div className="grid grid-cols-2 grid-rows-5 grid-flow-col gap-x-6 gap-y-1 flex-1 min-h-0">
        {species.slice(0, 10).map((s, i) => (
          <div key={s.commonName} className="flex items-center gap-4 min-h-0">
            <span className="text-sm font-display font-bold text-forest w-5 text-right flex-shrink-0">
              {i + 1}
            </span>
            {/* Sized to the row's own height (rather than a fixed 80px) so it
                can never exceed what 5 rows actually fit in this panel's
                height — a fixed size taller than the row was overflowing
                into the row below, so consecutive thumbnails' backgrounds
                visually overlapped. This also means it's always as large as
                the available space allows, not capped below it. */}
            <BirdImage
              commonName={s.commonName}
              alt={s.commonName}
              width={96}
              className="h-full aspect-square rounded-lg object-contain bg-line-soft flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-ink leading-tight">{s.commonName}</span>
                <span className="text-sm text-ink-faint flex-shrink-0 tabular-nums">{s.count}</span>
              </div>
              <div className="h-1.5 bg-line-soft rounded-full overflow-hidden">
                <div
                  className="h-full bg-forest rounded-full"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
