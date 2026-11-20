// The host wire for a Farcaster mini app. Enough to read the cast and dismiss the splash.
const rn = window.ReactNativeWebView
const pending = new Map()

function onMessage(data) {
  if (typeof data === "string") {
    try { data = JSON.parse(data) } catch { return }
  }
  if (!data || typeof data !== "object") return
  const waiter = pending.get(data.id)
  if (!waiter) return
  pending.delete(data.id)
  if (data.type === "HANDLER") waiter.reject(new Error(data.value?.value?.message || "mini app host error"))
  else waiter.resolve(data.value)
}

if (rn) document.addEventListener("FarcasterFrameCallback", (event) => onMessage(event.data))
else addEventListener("message", (event) => event.source === window.parent && onMessage(event.data))

function call(type, name, ...args) {
  const id = crypto.randomUUID()
  const message = { id, type, path: [name], argumentList: args.map((value) => ({ type: "RAW", value })) }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    rn ? rn.postMessage(JSON.stringify(message)) : window.parent.postMessage(message, "*")
  })
}

const apply = (name, ...args) => call("APPLY", name, ...args)

export async function detect() {
  if (!rn && window === window.parent) return null
  return Promise.race([
    call("GET", "context").catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
  ])
}

export const ready = () => apply("ready", {}).catch(() => {})
