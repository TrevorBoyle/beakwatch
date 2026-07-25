import { Fragment } from 'react'

export default function StatsBar({ todayStats, history, weather, isPlaying = true, onTogglePlaying = () => {} }) {
  const speciesCount = new Set(todayStats.map(d => d.commonName)).size

  const stats = [
    { label: 'species last 24hrs', value: speciesCount > 0 ? speciesCount : '—' },
    { label: 'in last 30 days', value: history?.speciesLast30Days ?? '—' },
    { label: 'ever recorded', value: history?.speciesAllTime ?? '—' },
    { label: 'new this week', value: history?.newThisWeek ?? '—' },
  ]

  return (
    <footer className="bg-paper-raised border-t border-line flex items-center justify-between px-7 py-3.5 text-[13px] text-ink-soft flex-shrink-0">
      {weather && (
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{weather.emoji}</span>
          <div>
            <p className="font-display font-semibold text-base text-ink leading-none">{weather.temp}°C</p>
            <p className="mt-0.5">{weather.label} · {weather.wind} km/h</p>
          </div>
          {(weather.sunrise || weather.sunset) && (
            <div className="ml-1 pl-2.5 border-l border-line">
              {weather.sunrise && <p>☀️ {weather.sunrise}</p>}
              {weather.sunset && <p className="mt-0.5">🌙 {weather.sunset}</p>}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-[18px]">
        {stats.map(({ label, value }, i) => (
          <Fragment key={label}>
            {i > 0 && <span className="w-[3px] h-[3px] rounded-full bg-line inline-block" aria-hidden="true" />}
            <span><strong className="text-ink font-bold">{value}</strong> {label}</span>
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-3.5 flex-shrink-0">
        <button
          type="button"
          onClick={onTogglePlaying}
          aria-label={isPlaying ? 'Pause slide rotation' : 'Resume slide rotation'}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-line-soft hover:bg-line text-ink-soft transition-colors"
        >
          {isPlaying ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <img src="/logo.jpg" alt="Gumtree Hollow" className="w-[65px] h-[65px] rounded-full object-cover" />
      </div>
    </footer>
  )
}
