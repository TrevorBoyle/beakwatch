import { useState } from 'react'
import { useDetections } from './hooks/useDetections.js'
import { useTodayStats } from './hooks/useTodayStats.js'
import { useHistory } from './hooks/useHistory.js'
import { useWeather } from './hooks/useWeather.js'
import Sidebar from './components/Sidebar.jsx'
import StatsBar from './components/StatsBar.jsx'
import HeroRotator from './components/hero/HeroRotator.jsx'

export default function App() {
  const { detections, lastSuccessAt } = useDetections()
  const { todayStats } = useTodayStats()
  const { history } = useHistory()
  const { weather } = useWeather()
  // Lives here rather than inside HeroRotator since the play/pause control
  // sits in the footer (StatsBar) — a sibling, not a descendant.
  const [isPlaying, setIsPlaying] = useState(true)

  return (
    <div className="flex flex-col h-full bg-paper">
      <div className="flex flex-1 overflow-hidden">
        <main className="w-[78%] h-full overflow-hidden">
          <HeroRotator
            detections={detections}
            todayStats={todayStats}
            history={history}
            lastSuccessAt={lastSuccessAt}
            isPlaying={isPlaying}
          />
        </main>
        <aside className="w-[22%] h-full border-l border-line overflow-hidden bg-paper-raised">
          <Sidebar detections={detections} todayStats={todayStats} />
        </aside>
      </div>
      <StatsBar
        todayStats={todayStats}
        history={history}
        weather={weather}
        isPlaying={isPlaying}
        onTogglePlaying={() => setIsPlaying(p => !p)}
      />
    </div>
  )
}
