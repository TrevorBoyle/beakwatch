import { confidenceTier } from '../utils/confidence.js'

// value is a 0-1 fraction, as returned by BirdNET-Go's avg_confidence.
export default function ConfidenceBadge({ value, className = '' }) {
  if (value == null) return null
  const { bg, text } = confidenceTier(value)
  return (
    <span className={`${bg} ${text} text-xs font-bold px-2 py-0.5 rounded-full ${className}`}>
      {Math.round(value * 100)}%
    </span>
  )
}
