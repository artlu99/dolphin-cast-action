// Bump this together with the ?v= in index.html. QStorage keeps these files for hours.
import { detect, ready } from "./miniapp.js?v=2"
import { calls, durationSeconds, seedFrom } from "./sound.js?v=3"

const NODE = "https://haatz.quilibrium.com"
const $ = (selector) => document.querySelector(selector)

let audio
let playing = false
let nodes = []
let stopTimer
let chain
let karaokeTimer
let wordMarks = []
let cast
let listener

function status(text, err = false) {
  const el = $("#status")
  el.textContent = text
  el.className = err ? "err" : ""
}

// The cast text, one span per word, so karaoke can light words as they sing.
function planWords(source, paragraph) {
  wordMarks = []
  paragraph.replaceChildren()
  const text = (source || "").trim()
  const total = [...text].length || 1
  let index = 0
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue
    const width = [...token].length
    if (/^\s+$/.test(token)) paragraph.append(token)
    else {
      const span = document.createElement("span")
      span.className = "word"
      span.textContent = token
      paragraph.append(span)
      wordMarks.push({ el: span, start: index / total, end: (index + width) / total })
    }
    index += width
  }
}

function showCast(shown) {
  const box = $("#cast")
  const img = box.querySelector("img")
  const who = box.querySelector("b")
  const text = box.querySelector("p")
  if (shown.author?.pfpUrl && /^https:\/\//.test(shown.author.pfpUrl)) img.src = shown.author.pfpUrl
  else img.hidden = true
  who.textContent = shown.author?.username ? `@${shown.author.username}` : `fid ${shown.author?.fid ?? ""}`
  planWords(shown.text, text)
  box.hidden = false
}

async function loadCast() {
  const query = new URLSearchParams(location.search)
  const hash = query.get("castHash")?.match(/^(?:0x)?([0-9a-f]{40})$/i)?.[1]?.toLowerCase()
  const fid = Number(query.get("castFid")) || 0
  const ctx = await detect()
  ready()
  let found = ctx?.location?.type === "cast_share" ? ctx.location.cast : null
  if (!found && hash) {
    found = await fetch(`${NODE}/v2/farcaster/cast?type=hash&identifier=0x${hash}`)
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
  if (!found && hash && fid) found = { hash: "0x" + hash, text: "", author: { fid } }
  if (!found && !ctx && query.get("text") != null) found = { hash: "", text: query.get("text"), author: { fid: 0 } }
  return found
}

function clearKaraoke() {
  for (const mark of wordMarks) mark.el.classList.remove("sung")
}

// Words light up in step with the squeaks: characters map to time the same
// way durationSeconds does, one second per fourteen of them.
function singAlong(startAt, seconds) {
  const tick = () => {
    const t = audio.currentTime - startAt
    const done = t >= seconds
    for (const mark of wordMarks) mark.el.classList.toggle("sung", done || t >= mark.start * seconds)
    karaokeTimer = done ? 0 : requestAnimationFrame(tick)
  }
  karaokeTimer = requestAnimationFrame(tick)
}

// Everything a call feeds into: a low roof, an echo off the far wall, and
// the two mixed onto the destination. Rebuilt for every play so Stop ends
// the underwater tail with a short fade.
function underwater() {
  const master = audio.createGain()
  master.gain.value = 0.9
  const roof = audio.createBiquadFilter()
  roof.type = "lowpass"
  roof.frequency.value = 2400
  roof.Q.value = 0.6
  const delay = audio.createDelay(1)
  delay.delayTime.value = 0.16
  const loop = audio.createBiquadFilter()
  loop.type = "lowpass"
  loop.frequency.value = 1800
  const feedback = audio.createGain()
  feedback.gain.value = 0.34
  const wet = audio.createGain()
  wet.gain.value = 0.22
  master.connect(roof)
  roof.connect(audio.destination)
  roof.connect(delay)
  delay.connect(loop)
  loop.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(audio.destination)
  return master
}

function stop() {
  clearTimeout(stopTimer)
  cancelAnimationFrame(karaokeTimer)
  karaokeTimer = 0
  if (audio && chain) {
    const master = chain
    const now = audio.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
    setTimeout(() => master.disconnect(), 400)
  }
  chain = null
  for (const node of nodes) {
    try { node.stop() } catch { /* already stopped */ }
  }
  nodes = []
  playing = false
  clearKaraoke()
  $("#translate").textContent = "Translate"
}

function panner(pan) {
  if (!audio.createStereoPanner) return null
  const node = audio.createStereoPanner()
  node.pan.value = pan
  return node
}

function playWhistle(when, call) {
  const sweep = panner(call.pan)
  const osc = audio.createOscillator()
  const overtone = audio.createOscillator()
  const gain = audio.createGain()
  const bend = when + call.length * call.bend
  const high = call.pitch * 1.44
  osc.type = "sine"
  overtone.type = "sine"
  osc.frequency.setValueAtTime(call.pitch * call.from, when)
  osc.frequency.linearRampToValueAtTime(call.pitch * call.mid, bend)
  osc.frequency.linearRampToValueAtTime(call.pitch * call.to, when + call.length)
  overtone.frequency.setValueAtTime(high * call.from, when)
  overtone.frequency.linearRampToValueAtTime(high * call.mid, bend)
  overtone.frequency.linearRampToValueAtTime(high * call.to, when + call.length)
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(0.11, when + 0.06)
  gain.gain.exponentialRampToValueAtTime(0.001, when + call.length)
  const overtoneGain = audio.createGain()
  overtoneGain.gain.value = 0.22
  osc.connect(gain)
  overtone.connect(overtoneGain)
  overtoneGain.connect(gain)
  gain.connect(sweep || chain)
  sweep?.connect(chain)
  osc.start(when)
  overtone.start(when)
  osc.stop(when + call.length)
  overtone.stop(when + call.length)
  nodes.push(osc, overtone)
}

function playClicks(when, call) {
  const sweep = panner(call.pan)
  const rate = call.rate
  const count = Math.max(4, Math.floor(call.length * rate))
  const total = Math.ceil(call.length * audio.sampleRate)
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
  gain.connect(sweep || chain)
  sweep?.connect(chain)
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
  chain = underwater()
  const startAt = audio.currentTime + 0.05
  calls(seconds, seedFrom(text)).forEach((call) => {
    const when = startAt + call.at
    if (call.kind === "clicks") playClicks(when, call)
    else playWhistle(when, call)
  })
  playing = true
  singAlong(startAt, seconds)
  $("#translate").textContent = "Stop"
  status("Translating…")
  stopTimer = setTimeout(() => {
    playing = false
    nodes = []
    $("#translate").textContent = "Translate"
    status("Done.")
  }, seconds * 1000 + 200)
}

// Onboard dictation, whatever the device ships: Web Speech where it exists,
// the button stays hidden where it does not.
const speech = window.SpeechRecognition || window.webkitSpeechRecognition

function listen() {
  stop()
  const recognition = new speech()
  recognition.interimResults = true
  recognition.lang = navigator.language || "en-US"
  let said = ""
  let failed = false
  listener = recognition
  $("#speak").textContent = "Listening… tap to stop"
  status("Listening…")
  recognition.onresult = (event) => {
    said = ""
    for (let i = 0; i < event.results.length; i++) said += event.results[i][0].transcript
    status(`Listening… “${said.trim()}”`)
  }
  recognition.onerror = (event) => {
    failed = true
    listener = null
    $("#speak").textContent = "🎙️ Speak a cast"
    status(event.error === "not-allowed" ? "Microphone access was refused." : "Listening failed — try again.", true)
  }
  recognition.onend = () => {
    listener = null
    $("#speak").textContent = "🎙️ Speak a cast"
    if (failed) return
    const words = said.trim()
    if (!words) {
      status("Heard nothing — try again.", true)
      return
    }
    cast = { hash: "", text: words, author: { fid: 0, username: "you" } }
    showCast(cast)
    status(`“${words}”, in squeaks.`)
    play(words)
  }
  recognition.start()
}

const button = $("#translate")
const speak = $("#speak")
cast = await loadCast()
if (!cast) status("Open Dolphin from a cast’s ⋯ menu, or say something.", true)
else {
  showCast(cast)
  button.hidden = false
}
button.onclick = () => {
  if (playing) {
    stop()
    status("Stopped.")
    return
  }
  play(cast.text || "")
}
if (speech) {
  speak.hidden = false
  speak.onclick = () => (listener ? listener.stop() : listen())
}
