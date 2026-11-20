// How long the translation plays, and the whistles and click trains inside it.
// About one second per 14 characters. A short cast is a short call, a long one
// keeps going, and nothing runs past twenty seconds.
//
// The text also seeds the song. A hash of the words picks every pitch,
// contour, click rate, and the drift across the stereo field, so the same
// cast sings the same song every time, and no two casts sound alike.

const PATTERN = [
  { kind: "whistle", length: 0.7 },
  { kind: "clicks", length: 0.32 },
  { kind: "whistle", length: 0.5 },
  { kind: "clicks", length: 0.22 },
]
const PAUSE = 0.07
const CONTOURS = [
  { from: 0.72, mid: 1.55, to: 0.9, bend: 0.42 },
  { from: 0.9, mid: 1.5, to: 0.65, bend: 0.5 },
  { from: 1.3, mid: 0.8, to: 1.0, bend: 0.45 },
  { from: 0.7, mid: 1.2, to: 1.55, bend: 0.6 },
  { from: 1.45, mid: 0.75, to: 0.85, bend: 0.4 },
]

// FNV-1a, one round per UTF-8 byte.
export function seedFrom(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""))
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// mulberry32. Small, fast, and mirrored bit for bit in sound.py.
function rng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round3 = (value) => Math.round(value * 1000) / 1000

export function durationSeconds(text) {
  const count = [...String(text ?? "").trim()].length
  if (!count) return 0
  return Math.min(20, Math.max(0.8, count / 14))
}

export function calls(duration, seed = 0) {
  const events = []
  const random = rng(seed)
  let pan = (random() * 2 - 1) * 0.5
  const drift = () => {
    pan = Math.max(-0.85, Math.min(0.85, pan + (random() * 2 - 1) * 0.6))
    return round3(pan)
  }
  let at = 0
  let index = 0
  while (at < duration - 0.05) {
    const step = PATTERN[index % PATTERN.length]
    const jitter = 0.75 + random() * 0.5
    const length = Math.min(step.length * jitter, round3(duration - at))
    if (length < 0.08) break
    const event = { at: round3(at), kind: step.kind, length: round3(length), pan: drift() }
    if (step.kind === "whistle") {
      event.pitch = Math.round(2200 + random() * 2200)
      Object.assign(event, CONTOURS[Math.floor(random() * CONTOURS.length)])
    } else {
      event.rate = Math.round(55 + random() * 45)
    }
    events.push(event)
    at += length + PAUSE
    index += 1
  }
  if (!events.length) {
    const event = { at: 0, kind: "whistle", length: round3(Math.min(0.5, duration)), pan: drift() }
    event.pitch = Math.round(2200 + random() * 2200)
    Object.assign(event, CONTOURS[Math.floor(random() * CONTOURS.length)])
    events.push(event)
  }
  return events
}
