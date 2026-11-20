// How long the translation plays, and the whistles and click trains inside it.
// About one second per 14 characters. A short cast is a short call, a long one
// keeps going, and nothing runs past twenty seconds.

const PATTERN = [
  { kind: "whistle", length: 0.7 },
  { kind: "clicks", length: 0.32 },
  { kind: "whistle", length: 0.5 },
  { kind: "clicks", length: 0.22 },
]
const PAUSE = 0.07

export function durationSeconds(text) {
  const count = [...String(text ?? "").trim()].length
  if (!count) return 0
  return Math.min(20, Math.max(0.8, count / 14))
}

export function calls(duration) {
  const events = []
  let at = 0
  let index = 0
  while (at < duration - 0.05) {
    const step = PATTERN[index % PATTERN.length]
    const length = Math.min(step.length, Math.round((duration - at) * 1000) / 1000)
    if (length < 0.08) break
    events.push({
      at: Math.round(at * 1000) / 1000,
      kind: step.kind,
      length,
    })
    at += length + PAUSE
    index += 1
  }
  if (!events.length) events.push({ at: 0, kind: "whistle", length: Math.min(0.5, duration) })
  return events
}
