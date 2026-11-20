// Bump this together with the ?v= in index.html. QStorage keeps these files for hours.
import { detect, ready } from "./miniapp.js?v=2"
import { calls, durationSeconds } from "./sound.js?v=2"

const NODE = "https://haatz.quilibrium.com"
const $ = (selector) => document.querySelector(selector)

let audio
let playing = false
let nodes = []
let stopTimer

function status(text, err = false) {
  const el = $("#status")
  el.textContent = text
  el.className = err ? "err" : ""
}

function showCast(cast) {
  const box = $("#cast")
  const img = box.querySelector("img")
  const who = box.querySelector("b")
  const text = box.querySelector("p")
  if (cast.author?.pfpUrl && /^https:\/\//.test(cast.author.pfpUrl)) img.src = cast.author.pfpUrl
  else img.hidden = true
  who.textContent = cast.author?.username ? `@${cast.author.username}` : `fid ${cast.author?.fid ?? ""}`
  text.textContent = cast.text || ""
  box.hidden = false
}

async function loadCast() {
  const query = new URLSearchParams(location.search)
  const hash = query.get("castHash")?.match(/^(?:0x)?([0-9a-f]{40})$/i)?.[1]?.toLowerCase()
  const fid = Number(query.get("castFid")) || 0
  const ctx = await detect()
  ready()
  let cast = ctx?.location?.type === "cast_share" ? ctx.location.cast : null
  if (!cast && hash) {
    cast = await fetch(`${NODE}/v2/farcaster/cast?type=hash&identifier=0x${hash}`)
      .then((response) => response.json())
      .then((body) => body.cast && {
        hash: body.cast.hash,
        text: body.cast.text,
        author: {
          fid: body.cast.author.fid,
          username: body.cast.author.username,
          pfpUrl: body.cast.author.pfp_url,
        },
      }, () => null)
  }
  if (!cast && hash && fid) cast = { hash: "0x" + hash, text: "", author: { fid } }
  if (!cast && !ctx && query.get("text") != null) cast = { hash: "", text: query.get("text"), author: { fid: 0 } }
  return cast
}

function stop() {
  clearTimeout(stopTimer)
  for (const node of nodes) {
    try { node.stop() } catch { /* already stopped */ }
  }
  nodes = []
  playing = false
  $("#translate").textContent = "Translate"
}

function playWhistle(when, length, index) {
  const osc = audio.createOscillator()
  const overtone = audio.createOscillator()
  const gain = audio.createGain()
  const base = 3200 + (index % 3) * 380
  osc.type = "sine"
  overtone.type = "sine"
  osc.frequency.setValueAtTime(base * 0.72, when)
  osc.frequency.linearRampToValueAtTime(base * 1.55, when + length * 0.42)
  osc.frequency.linearRampToValueAtTime(base * 0.9, when + length)
  overtone.frequency.setValueAtTime(base * 1.44, when)
  overtone.frequency.linearRampToValueAtTime(base * 3.1, when + length * 0.42)
  overtone.frequency.linearRampToValueAtTime(base * 1.8, when + length)
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(0.11, when + 0.06)
  gain.gain.exponentialRampToValueAtTime(0.001, when + length)
  const overtoneGain = audio.createGain()
  overtoneGain.gain.value = 0.22
  osc.connect(gain)
  overtone.connect(overtoneGain)
  overtoneGain.connect(gain)
  gain.connect(audio.destination)
  osc.start(when)
  overtone.start(when)
  osc.stop(when + length)
  overtone.stop(when + length)
  nodes.push(osc, overtone)
}

function playClicks(when, length) {
  const rate = 70
  const count = Math.max(4, Math.floor(length * rate))
  const total = Math.ceil(length * audio.sampleRate)
  const buffer = audio.createBuffer(1, total, audio.sampleRate)
  const data = buffer.getChannelData(0)
  const click = Math.floor(audio.sampleRate * 0.0012)
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * (total - click))
    for (let j = 0; j < click && start + j < total; j++) {
      const env = 1 - j / click
      data[start + j] += (Math.random() * 2 - 1) * env * env
    }
  }
  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = "highpass"
  filter.frequency.value = 2500
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.45, when)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(audio.destination)
  source.start(when)
  nodes.push(source)
}

function play(text) {
  const seconds = durationSeconds(text)
  if (!seconds) {
    status("Nothing to translate.", true)
    return
  }
  stop()
  audio ||= new AudioContext()
  if (audio.state === "suspended") audio.resume()
  const startAt = audio.currentTime + 0.05
  calls(seconds).forEach((call, index) => {
    const when = startAt + call.at
    if (call.kind === "clicks") playClicks(when, call.length)
    else playWhistle(when, call.length, index)
  })
  playing = true
  $("#translate").textContent = "Stop"
  status("Translating…")
  stopTimer = setTimeout(() => {
    playing = false
    nodes = []
    $("#translate").textContent = "Translate"
    status("Done.")
  }, seconds * 1000 + 200)
}

const button = $("#translate")
const cast = await loadCast()
if (!cast) status("Open Dolphin from a cast’s ⋯ menu.", true)
else {
  showCast(cast)
  button.hidden = false
  button.onclick = () => {
    if (playing) {
      stop()
      status("Stopped.")
      return
    }
    play(cast.text || "")
  }
}
