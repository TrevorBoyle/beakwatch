const VARIANTS = {
  dark: 'bg-hero-overlay/70 backdrop-blur-sm text-white/90 text-xs font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full border border-white/20',
  subtle: 'bg-white/16 backdrop-blur-sm text-white/85 text-xs px-3 py-1.5 rounded-full border border-white/20',
  light: 'bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-full border border-white/30',
}

export default function Badge({ variant = 'dark', className = '', children }) {
  return <span className={`${VARIANTS[variant]} ${className}`}>{children}</span>
}
