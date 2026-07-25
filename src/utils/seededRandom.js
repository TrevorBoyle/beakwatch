// Deterministic PRNG helpers shared by the hero rotator's scatter layouts
// (Collage, CollageFrequency) so re-renders with the same seed reproduce the
// same arrangement, while a fresh seed (see each caller's layoutSeed) gives a
// fully different one.

export function hashStr(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle(array, rand) {
  const shuffled = array.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// A one-off random value independently hashed from its own key, rather than
// the next draw off a shared sequential stream — pulling several
// structurally-similar values (jitter x, jitter y, flip) at a fixed stride
// from one mulberry32 stream risks correlation between them for some seeds
// (e.g. every draw at that stride landing on the same side of 0.5).
// Hashing a distinct string per value sidesteps that entirely.
export function seededRandomFor(key) {
  return mulberry32(hashStr(key))()
}
