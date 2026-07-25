import { useMemo } from 'react'
import BirdImage from './BirdImage.jsx'
import { timeAgo } from '../utils/formatters.js'
import { useServer } from '../hooks/useServer.js'

export default function Sidebar({ detections, todayStats }) {
  const todayCountBySpecies = useMemo(() => {
    const map = {}
    for (const d of todayStats) map[d.commonName] = (map[d.commonName] ?? 0) + d.count
    return map
  }, [todayStats])

  const uniqueDetections = useMemo(() => {
    const seen = new Set()
    return detections.filter(d => {
      if (seen.has(d.commonName)) return false
      seen.add(d.commonName)
      return true
    })
  }, [detections])
  const { serverInfo, switchServer } = useServer()

  return (
    <div className="flex flex-col h-full bg-paper-raised">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-robin-red opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-robin-red" />
            </span>
            <span className="text-xs font-bold tracking-widest text-robin-red">LIVE</span>
          </div>
          <h2 className="text-lg font-display font-semibold text-ink leading-tight">Recently Identified</h2>
        </div>
        {serverInfo && serverInfo.servers.length > 1 && (
          <button
            onClick={switchServer}
            aria-label={`Switch to ${serverInfo.servers.find(s => s.url !== serverInfo.active)?.name ?? 'other server'}`}
            className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-soft bg-line-soft hover:bg-line px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
            {serverInfo.servers.find(s => s.url === serverInfo.active)?.name ?? serverInfo.active}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
        {uniqueDetections.map(d => {
          const todayCount = todayCountBySpecies[d.commonName]
          return (
            <div key={d.commonName} className="flex items-center gap-4 px-5 py-2 border-b border-line">
              <BirdImage
                commonName={d.commonName}
                alt={d.commonName}
                width={80}
                className="w-20 h-20 rounded-xl object-contain bg-line-soft flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink leading-snug">{d.commonName}</p>
                <p className="text-sm text-ink-faint mt-0.5">{timeAgo(d.timestamp)}</p>
                {todayCount != null && (
                  <p className="text-xs text-forest font-medium mt-1">{todayCount} last 24hrs</p>
                )}
              </div>
            </div>
          )
        })}
        <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-paper-raised to-transparent pointer-events-none" />
      </div>
    </div>
  )
}
