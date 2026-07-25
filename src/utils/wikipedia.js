const cache = new Map()

const STORAGE_PREFIX = 'wiki:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

function loadFromStorage(prefix, key) {
  try {
    const raw = localStorage.getItem(prefix + key)
    if (!raw) return null
    const { t, v } = JSON.parse(raw)
    if (Date.now() - t > TTL_MS) {
      localStorage.removeItem(prefix + key)
      return null
    }
    return v
  } catch { return null }
}

function saveToStorage(prefix, key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify({ t: Date.now(), v: value }))
  } catch { /* quota exceeded or storage unavailable — ignore */ }
}

// Fetches the Wikipedia summary — extract text + photoUrl — for the "fun
// fact" copy shown on the Species Profile / Last Identified slides.
export async function fetchWikipedia(commonName) {
  if (cache.has(commonName)) {
    return cache.get(commonName)
  }

  const stored = loadFromStorage(STORAGE_PREFIX, commonName)
  if (stored) {
    cache.set(commonName, stored)
    return stored
  }

  const promise = (async () => {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(commonName)}`
      const res = await fetch(url)
      if (!res.ok) return { extract: null, photoUrl: null, attribution: null }
      const data = await res.json()
      return {
        extract: data.extract ?? null,
        photoUrl: null,
        attribution: null,
      }
    } catch {
      return { extract: null, photoUrl: null, attribution: null }
    }
  })()

  cache.set(commonName, promise)
  const result = await promise
  cache.set(commonName, result)
  saveToStorage(STORAGE_PREFIX, commonName, result)
  return result
}
