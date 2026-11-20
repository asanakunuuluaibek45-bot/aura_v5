import { Capacitor } from "@capacitor/core"
import { Network } from "@capacitor/network"
import { App } from "@capacitor/app"

/**
 * WKWebView's navigator.onLine can remain true in airplane mode. Adapt that
 * standard browser surface to Capacitor Network so ALL existing PWA hooks,
 * action guards and the sync engine agree, without a second native UI policy.
 * Browser/Android PWA behavior is unchanged.
 */
export function startNativeConnectivity(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const original = Object.getOwnPropertyDescriptor(navigator, "onLine")
  let connected = false // Fail closed until the initial native status is known.
  let disposed = false
  let revision = 0
  const handles: Array<{ remove(): Promise<void> }> = []
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    enumerable: true,
    get: () => connected,
  })
  const publish = (value: boolean, force = false) => {
    if (disposed) return
    const changed = connected !== value
    connected = value
    if (changed || force) window.dispatchEvent(new Event(value ? "online" : "offline"))
  }
  // Notify already-mounted consumers as well as future navigator.onLine reads.
  publish(false, true)
  const refresh = async () => {
    const startedAt = ++revision
    try {
      const status = await Network.getStatus()
      // A delayed initial/resume query must not undo a newer network event.
      if (revision === startedAt) publish(status.connected)
    } catch {
      if (revision === startedAt) publish(false)
    }
  }
  const retain = async (promise: Promise<{ remove(): Promise<void> }>) => {
    const handle = await promise
    if (disposed) await handle.remove()
    else handles.push(handle)
  }
  void retain(Network.addListener("networkStatusChange", (status) => {
    revision++
    publish(status.connected)
  })).then(refresh, refresh)
  void retain(App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void refresh()
  })).catch(() => {})
  return () => {
    if (disposed) return
    disposed = true
    for (const handle of handles) void handle.remove().catch(() => {})
    if (original) Object.defineProperty(navigator, "onLine", original)
    else Reflect.deleteProperty(navigator, "onLine")
  }
}
