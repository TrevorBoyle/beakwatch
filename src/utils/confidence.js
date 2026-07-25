// Tiers mirror BirdNET-Go's own confidence coloring: 70%+ reads as reliably
// identified (green), 50-69% as plausible but worth a second look (orange),
// and below 50% as closer to a coin flip (darker orange) — the tier most
// likely to include misidentifications, so it gets the most insistent color.
export function confidenceTier(value) {
  if (value >= 0.7) return { bg: 'bg-forest-soft', text: 'text-forest' }
  if (value >= 0.5) return { bg: 'bg-amber-soft', text: 'text-amber' }
  return { bg: 'bg-amber-dark-soft', text: 'text-amber-dark' }
}
