import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

beforeEach(() => {
  vi.resetModules()
})

describe('Express server', () => {
  it('GET /api/recent normalises fields and combines date+time into timestamp', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { commonName: 'Redwing', scientificName: 'Turdus iliacus', confidence: 0.98, date: '2026-03-24', time: '19:02:21' },
      ],
    })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/recent')
    expect(res.status).toBe(200)
    expect(res.body[0].commonName).toBe('Redwing')
    expect(res.body[0].timestamp).toBe('2026-03-24T19:02:21')
    expect(res.body[0].confidence).toBe(0.98)
  })

  it('GET /api/today expands hourly_counts into flat {commonName, hour, count} items', async () => {
    const hourly = Array(24).fill(0)
    hourly[8] = 3
    hourly[9] = 5
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ common_name: 'Redwing', hourly_counts: hourly }],
    })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/today')
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual({ commonName: 'Redwing', hour: 8, count: 3 })
    expect(res.body).toContainEqual({ commonName: 'Redwing', hour: 9, count: 5 })
    expect(res.body.length).toBe(2)
  })

  it('GET /api/today falls back to live detections for today when daily analytics are empty', async () => {
    // Freeze at 11pm so every hour (0-23) counts as "already reached today" —
    // isolates the fallback-aggregation behavior from the rolling-window merge.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 23, 0, 0))
    const todayDateStr = '2026-01-15'

    global.fetch = vi.fn((url) => {
      if (url.includes(`daily?date=${todayDateStr}`)) {
        return Promise.resolve({ ok: true, json: async () => [] }) // analytics empty -> fallback
      }
      if (url.includes('/api/v2/detections/recent')) {
        return Promise.resolve({ ok: true, json: async () => [
          { commonName: 'Redwing', date: todayDateStr, time: '08:30:00' },
          { commonName: 'Redwing', date: todayDateStr, time: '08:45:00' },
          { commonName: 'Robin', date: todayDateStr, time: '09:15:00' },
        ]})
      }
      return Promise.resolve({ ok: true, json: async () => [] }) // yesterday's analytics — irrelevant here
    })

    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/today')
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual({ commonName: 'Redwing', hour: 8, count: 2 })
    expect(res.body).toContainEqual({ commonName: 'Robin', hour: 9, count: 1 })
    vi.useRealTimers()
  })

  it('GET /api/today builds a rolling 24h window: hours already reached today use today\'s counts, later hours use yesterday\'s', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 14, 0, 0)) // 2pm — hour 10 already passed today, hour 20 hasn't yet
    const todayDateStr = '2026-01-15'
    const yesterdayDateStr = '2026-01-14'

    global.fetch = vi.fn((url) => {
      if (url.includes(`daily?date=${todayDateStr}`)) {
        const hourly = Array(24).fill(0)
        hourly[10] = 4
        return Promise.resolve({ ok: true, json: async () => [{ common_name: 'Redwing', hourly_counts: hourly }] })
      }
      if (url.includes(`daily?date=${yesterdayDateStr}`)) {
        const hourly = Array(24).fill(0)
        hourly[20] = 7
        return Promise.resolve({ ok: true, json: async () => [{ common_name: 'Redwing', hourly_counts: hourly }] })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/today')
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual({ commonName: 'Redwing', hour: 10, count: 4 })
    expect(res.body).toContainEqual({ commonName: 'Redwing', hour: 20, count: 7 })
    vi.useRealTimers()
  })

  it('GET /api/today?date= fetches one specific calendar day without the rolling merge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        const hourly = Array(24).fill(0)
        hourly[5] = 2
        return [{ common_name: 'Wren', hourly_counts: hourly }]
      },
    })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/today?date=2026-02-01')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ commonName: 'Wren', hour: 5, count: 2 }])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toContain('date=2026-02-01')
  })

  it('GET /api/history aggregates three BirdNET-Go calls', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', count: 50, avg_confidence: 0.82 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', count: 50, avg_confidence: 0.82 }, { common_name: 'Hawfinch', count: 1, avg_confidence: 0.61 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', first_heard_date: '2026-07-15' }] })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/history')
    expect(res.status).toBe(200)
    expect(res.body.speciesLast30Days).toBe(1)
    expect(res.body.speciesAllTime).toBe(2)
    expect(res.body.newThisWeek).toBe(1)
    expect(res.body.top30Days[0]).toEqual({ commonName: 'Redwing', count: 50, avgConfidence: 0.82 })
    expect(res.body.rareVisitors[0]).toEqual({ commonName: 'Hawfinch', allTimeCount: 1, avgConfidence: 0.61 })
  })

  it('GET /api/history exposes a full confidenceBySpecies map covering every species BirdNET-Go has heard, not just the top30Days/rareVisitors slices', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { common_name: 'Redwing', count: 50, avg_confidence: 0.82 },
        { common_name: 'Hawfinch', count: 1, avg_confidence: 0.61 },
      ] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/history')
    expect(res.body.confidenceBySpecies).toEqual({ Redwing: 0.82, Hawfinch: 0.61 })
  })

  it('GET /api/history omits species from confidenceBySpecies when avg_confidence is missing', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', count: 50 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/history')
    expect(res.body.confidenceBySpecies).toEqual({})
  })

  it('GET /api/history queries the dedicated new-species endpoint (which tracks first_heard_date) for newThisWeek', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', count: 1 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', first_heard_date: '2026-07-15' }] })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/history')
    expect(res.body.newThisWeek).toBe(1)
    expect(global.fetch.mock.calls[2][0]).toContain('/api/v2/analytics/species/detections/new')
  })

  it('GET /api/history excludes a "new" species that no longer appears in the all-time summary, e.g. a deleted false positive', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ common_name: 'Redwing', count: 1 }] }) // Coot deleted, so it's gone from here
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { common_name: 'Redwing', first_heard_date: '2026-07-15' },
        { common_name: 'Eurasian Coot', first_heard_date: '2026-07-18' }, // stale "new" entry BirdNET-Go never cleaned up
      ] })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/history')
    expect(res.body.newThisWeek).toBe(1) // Coot excluded, not 2
  })

  it('GET /api/recent returns 502 when BirdNET-Go is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/recent')
    expect(res.status).toBe(502)
  })

  it('GET /api/server exposes the active server url and configured servers', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/server')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('active')
    expect(Array.isArray(res.body.servers)).toBe(true)
  })

  it('POST /api/server rejects unknown server urls with 400', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app)
      .post('/api/server')
      .set('Content-Type', 'application/json')
      .send({ url: 'http://not-configured' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Unknown server')
  })

  it('GET /birds rejects slugs containing path traversal with 400', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/birds/..%2f..%2fserver%2findex-320.jpg?name=Robin&w=320')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid image name')
  })

  it('GET /birds rejects slugs with dots or unexpected characters with 400', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/birds/..%5c..%5cfoo.jpg?name=Robin')
    expect(res.status).toBe(400)
  })

  it('GET /birds serves the question-mark placeholder when no cutout exists for the slug', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/birds/eurasian-robin.jpg?name=European%20Robin&w=320')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    const placeholder = await fs.readFile(join(__dirname, '..', 'public', 'birds', 'question-mark.png'))
    expect(res.body.equals(placeholder)).toBe(true)
  })

  it('GET /birds serves a user-supplied cutout instead of the placeholder when one exists for the slug', async () => {
    const cutoutPath = join(__dirname, '..', 'bird-cutouts', 'test-cutout-species.png')
    await fs.writeFile(cutoutPath, Buffer.from('pngbytes'))
    try {
      const { default: app } = await import('./index.js')
      const res = await request(app).get('/birds/test-cutout-species.jpg?name=Test%20Cutout%20Species&w=320')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.body.equals(Buffer.from('pngbytes'))).toBe(true)
    } finally {
      await fs.rm(cutoutPath, { force: true })
    }
  })

  it('GET unknown /api routes returns 404 JSON instead of the SPA shell', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })

  it('does not expose the X-Powered-By header', async () => {
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/server')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('survives a malformed BIRDNET_GO_URL with a clear warning instead of crashing', async () => {
    const prev = { url: process.env.BIRDNET_GO_URL, urls: process.env.BIRDNET_GO_URLS }
    process.env.BIRDNET_GO_URL = '192.168.1.10:8080' // missing http://
    delete process.env.BIRDNET_GO_URLS
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { default: app } = await import('./index.js')
      const res = await request(app).get('/api/server')
      expect(res.status).toBe(200)
      expect(res.body.servers).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('BIRDNET_GO_URL'))
    } finally {
      warn.mockRestore()
      if (prev.url === undefined) delete process.env.BIRDNET_GO_URL
      else process.env.BIRDNET_GO_URL = prev.url
      if (prev.urls !== undefined) process.env.BIRDNET_GO_URLS = prev.urls
    }
  })

  it('GET /api/weather returns temperature, wind, label, emoji, sunrise and sunset', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 12.4, weather_code: 2, wind_speed_10m: 8.7 },
        daily: { sunrise: ['2026-07-21T05:12'], sunset: ['2026-07-21T21:04'] },
      }),
    })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/weather')
    expect(res.status).toBe(200)
    expect(res.body.temp).toBe(12)
    expect(res.body.wind).toBe(9)
    expect(res.body.label).toBe('Partly cloudy')
    expect(res.body.emoji).toBe('⛅')
    expect(res.body.sunrise).toBe('05:12')
    expect(res.body.sunset).toBe('21:04')
  })

  it('GET /api/weather tolerates a missing daily block', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 12.4, weather_code: 2, wind_speed_10m: 8.7 },
      }),
    })
    const { default: app } = await import('./index.js')
    const res = await request(app).get('/api/weather')
    expect(res.status).toBe(200)
    expect(res.body.sunrise).toBeNull()
    expect(res.body.sunset).toBeNull()
  })
})
