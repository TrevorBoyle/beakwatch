import express from 'express'
import { existsSync, promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Skip in tests so the suite controls its own env and never inherits a
// developer's local server/.env (which would make assertions non-hermetic).
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: join(__dirname, '.env') })
}
const app = express()
app.disable('x-powered-by')
app.use(express.json())
const PORT = process.env.PORT || 2325
const BIRD_CUTOUTS_DIR = join(__dirname, '..', 'bird-cutouts')
const QUESTION_MARK_PATH = join(__dirname, '..', 'public', 'birds', 'question-mark.png')
const LAT = process.env.LAT || '51.5074'
const LON = process.env.LON || '-0.1278'

// Configure one or more BirdNET-Go servers via env:
//   BIRDNET_GO_URLS=http://host1:8080,http://host2:8080
//   BIRDNET_GO_NAMES=Garden,Office          (optional display names)
// A single BIRDNET_GO_URL is also accepted for the common case.
const SERVERS = (() => {
  const urls = (process.env.BIRDNET_GO_URLS || process.env.BIRDNET_GO_URL || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const names = (process.env.BIRDNET_GO_NAMES || '').split(',').map(s => s.trim())
  if (urls.length === 0) {
    console.warn('[server] No BirdNET-Go URL configured. Set BIRDNET_GO_URL in .env')
  }
  return urls.flatMap((url, i) => {
    try {
      return [{ url, name: names[i] || new URL(url).hostname }]
    } catch {
      console.error(`[server] Invalid BIRDNET_GO_URL "${url}" — must be a full URL incl. protocol, e.g. http://192.168.1.10:8080`)
      return []
    }
  })
})()
let activeServerUrl = SERVERS[0]?.url ?? null

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr() {
  return localDateStr()
}

function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateStr(d)
}

async function birdnetFetch(path) {
  const res = await fetch(`${activeServerUrl}${path}`)
  if (!res.ok) throw new Error(`BirdNET-Go ${res.status}: ${path}`)
  return res.json()
}

// GET /api/server — current active server + all options (with names)
app.get('/api/server', (req, res) => {
  res.json({ active: activeServerUrl, servers: SERVERS })
})

// POST /api/server — switch active server { url }
app.post('/api/server', (req, res) => {
  const { url } = req.body
  if (!SERVERS.some(s => s.url === url)) return res.status(400).json({ error: 'Unknown server' })
  activeServerUrl = url
  res.json({ active: activeServerUrl })
})

// GET /api/recent — last 20 detections, newest first
// BirdNET-Go: GET /api/v2/detections/recent?limit=20
// Field notes: camelCase (commonName, scientificName), timestamp is null — combine date+time
app.get('/api/recent', async (req, res) => {
  try {
    const data = await birdnetFetch('/api/v2/detections/recent?limit=200')
    res.json(data.map(d => ({
      commonName: d.commonName,
      scientificName: d.scientificName,
      confidence: d.confidence,
      timestamp: `${d.date}T${d.time}`,
    })))
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Per-species hourly-count array (index 0-23) for one calendar day.
// Tries analytics/daily first; falls back to aggregating live detections if empty.
async function fetchDayHourly(date) {
  const daily = await birdnetFetch(`/api/v2/analytics/species/daily?date=${date}`)
  const bySpecies = {}
  if (Array.isArray(daily) && daily.length > 0) {
    for (const s of daily) {
      if (!Array.isArray(s.hourly_counts)) continue
      bySpecies[s.common_name] = s.hourly_counts
    }
    return bySpecies
  }
  const recent = await birdnetFetch('/api/v2/detections/recent?limit=2000')
  for (const d of recent) {
    if (d.date !== date) continue
    const hour = d.time ? parseInt(d.time.slice(0, 2), 10) : null
    if (hour === null || isNaN(hour)) continue
    bySpecies[d.commonName] = bySpecies[d.commonName] ?? Array(24).fill(0)
    bySpecies[d.commonName][hour] += 1
  }
  return bySpecies
}

function flattenHourly(bySpecies) {
  const flat = []
  for (const [commonName, hours] of Object.entries(bySpecies)) {
    hours.forEach((count, hour) => { if (count > 0) flat.push({ commonName, hour, count }) })
  }
  return flat
}

// GET /api/today — flat [{commonName, hour, count}] for the rolling 24 hours
// ending now, keyed by calendar hour-of-day (0-23). For hours already
// reached today we use today's count; for hours today hasn't reached yet
// we use yesterday's count at that same hour — together they span exactly
// the last 24 hours, so the heatmap never shows empty "hasn't happened
// yet" hours early in the day. Accepts optional ?date=YYYY-MM-DD to fetch
// one specific calendar day instead (skips the rolling merge — for testing).
app.get('/api/today', async (req, res) => {
  try {
    if (req.query.date) {
      return res.json(flattenHourly(await fetchDayHourly(req.query.date)))
    }

    const currentHour = new Date().getHours()
    const [todayHourly, yesterdayHourly] = await Promise.all([
      fetchDayHourly(todayStr()),
      fetchDayHourly(daysAgoStr(1)),
    ])
    const names = new Set([...Object.keys(todayHourly), ...Object.keys(yesterdayHourly)])
    const merged = {}
    for (const name of names) {
      const t = todayHourly[name] ?? Array(24).fill(0)
      const y = yesterdayHourly[name] ?? Array(24).fill(0)
      merged[name] = Array.from({ length: 24 }, (_, h) => (h <= currentHour ? t[h] : y[h]))
    }
    res.json(flattenHourly(merged))
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// GET /api/history — aggregated stats: top 30-day species, rare visitors, counts
// Combines three BirdNET-Go calls in parallel
app.get('/api/history', async (req, res) => {
  try {
    // "New this week" needs BirdNET-Go's /detections/new endpoint specifically
    // — it's the one that tracks first_heard_date, i.e. genuinely first-ever
    // sightings, which /analytics/species/summary has no concept of (it just
    // reports "any activity in this window", which would settle into meaning
    // "heard at all this week" rather than "new" once the season's already-
    // common species start recurring week to week). The catch: BirdNET-Go
    // tracks "new" separately from the main detections log, so it can go
    // stale — deleting a detection later (e.g. a reviewed false positive)
    // doesn't retroactively remove its "new" entry. Cross-checking against
    // the all-time summary (which reflects deletions) filters those out.
    const [summary30, allTime, newSpecies] = await Promise.all([
      birdnetFetch(`/api/v2/analytics/species/summary?start_date=${daysAgoStr(30)}&end_date=${todayStr()}`).catch(() => []),
      birdnetFetch(`/api/v2/analytics/species/summary?start_date=2010-01-01&end_date=${todayStr()}`).catch(() => []),
      birdnetFetch(`/api/v2/analytics/species/detections/new?start_date=${daysAgoStr(7)}&end_date=${todayStr()}`).catch(() => []),
    ])

    const top30Days = [...summary30]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(s => ({ commonName: s.common_name, count: s.count, avgConfidence: s.avg_confidence ?? null }))

    const rareVisitors = [...allTime]
      .sort((a, b) => a.count - b.count)
      .slice(0, 16)
      .map(s => ({ commonName: s.common_name, allTimeCount: s.count, avgConfidence: s.avg_confidence ?? null }))

    // Keyed by every species BirdNET-Go has ever heard (not just the top30Days/
    // rareVisitors slices above) — the Species Profile slide can spotlight any
    // species, not only the ones in those two lists.
    const confidenceBySpecies = {}
    for (const s of allTime) {
      if (s.avg_confidence != null) confidenceBySpecies[s.common_name] = s.avg_confidence
    }

    const allTimeNames = new Set(allTime.map(s => s.common_name))
    const newThisWeekCount = new Set(
      newSpecies.map(s => s.common_name).filter(name => allTimeNames.has(name))
    ).size

    res.json({
      top30Days,
      rareVisitors,
      confidenceBySpecies,
      speciesLast30Days: summary30.length,
      speciesAllTime: allTime.length,
      newThisWeek: newThisWeekCount,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// GET /api/weather — current conditions from Open-Meteo
const WMO_LABELS = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm',
}
const WMO_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌦️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️',
}
app.get('/api/weather', async (req, res) => {
  try {
    // auto = Open-Meteo picks the timezone for the lat/lon, so weather timestamps
    // match the kiosk's deployment location without us hard-coding Europe/London.
    // daily=sunrise,sunset (today only, forecast_days=1) rides along on the same call.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset&forecast_days=1&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto`
    const data = await fetch(url).then(r => r.json())
    const { temperature_2m: temp, weather_code: code, wind_speed_10m: wind } = data.current
    // Sunrise/sunset come back as local ISO timestamps, e.g. "2026-07-21T05:12" — slice the HH:MM.
    const sunrise = data.daily?.sunrise?.[0]?.slice(11, 16) ?? null
    const sunset = data.daily?.sunset?.[0]?.slice(11, 16) ?? null
    res.json({
      temp: Math.round(temp),
      wind: Math.round(wind),
      code,
      label: WMO_LABELS[code] ?? 'Unknown',
      emoji: WMO_EMOJI[code] ?? '🌡️',
      sunrise,
      sunset,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// GET /birds/:filename — a user-supplied cutout if one exists for the slug,
// otherwise the question-mark placeholder.
app.get('/birds/:filename', async (req, res, next) => {
  const m = req.params.filename.match(/^(.+)\.jpg$/)
  if (!m) return next()
  const slug = m[1]
  // Slugs come from toSlug() client-side and are always [a-z0-9-]. Anything
  // else (encoded slashes, dots) could escape bird-cutouts/ via path traversal.
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid image name' })
  const name = req.query.name
  if (!name) return next()

  try {
    // A user-supplied cutout (see bird-cutouts/README.md) takes priority
    // everywhere a bird image is shown — not just the Collage panel — and,
    // like /collage, avoids long-lived caching since it may get swapped out
    // by hand. Width is ignored: these are served as-is, no resizing pipeline.
    try {
      const reference = await fs.readFile(join(BIRD_CUTOUTS_DIR, `${slug}.png`))
      res.set('Content-Type', 'image/png')
      res.set('Cache-Control', 'no-cache')
      return res.send(reference)
    } catch { /* no cutout for this species — fall through to the placeholder */ }

    // Not immutable/long-lived: a species with no reference cutout today can
    // get one added at any time, at this same URL, so this shouldn't stick
    // around in a browser cache once that happens.
    const placeholder = await fs.readFile(QUESTION_MARK_PATH)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-cache')
    res.send(placeholder)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /collage/:filename — user-supplied bird cutout illustrations for the
// Collage panel (see bird-cutouts/README.md). Pure disk-serve — nothing is
// generated here, so a missing file is just a 404 and the frontend quietly
// leaves that species out of the collage. Unlike /birds, these files get
// swapped out by hand as their owner iterates on the artwork, so this
// deliberately avoids long-lived caching — no-cache forces a revalidation
// (cheap: small local files, no upstream call) instead of `immutable`
// leaving a stale image stuck in someone's browser for a year.
app.get('/collage/:filename', async (req, res, next) => {
  if (!/^[a-z0-9-]+\.png$/.test(req.params.filename)) return next()
  try {
    const buf = await fs.readFile(join(BIRD_CUTOUTS_DIR, req.params.filename))
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-cache')
    res.send(buf)
  } catch {
    res.status(404).end()
  }
})

// Unknown API paths get a JSON 404 rather than falling through to the SPA shell.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

app.use(express.static(join(__dirname, '..', 'dist')))

app.get('*path', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
})

if (process.env.NODE_ENV !== 'test') {
  if (!existsSync(join(__dirname, '..', 'dist', 'index.html'))) {
    console.warn('[server] dist/index.html not found — run `npm run build` first, or use `npm run dev` for development')
  }
  app.listen(PORT, () => console.log(`Beakwatch running on http://localhost:${PORT}`))
}

export default app
