/**
 * Offline warm-up for the label editor.
 *
 * The label editor, fabric.js and the Niimbot Bluetooth driver are lazy chunks
 * that are not referenced from the HTML shell, so the service worker only caches
 * them after they were requested once. Without that, opening the editor offline
 * fails with "Failed to fetch" (ChunkLoadError). While the device is online we
 * request those chunks in idle time; the service worker stores them cache-first,
 * after which label editing and printing work without internet.
 */
let warmed = false

export function warmUpLabelEditorOffline() {
  if (warmed || typeof window === "undefined") return
  if (!navigator.onLine) {
    window.addEventListener("online", () => warmUpLabelEditorOffline(), { once: true })
    return
  }
  warmed = true
  const run = () => {
    void Promise.allSettled([
      import("@/components/screens/sklad/label/label-editor"),
      import("fabric"),
      import("niimbot-web-bluetooth"),
      import("@/components/BarcodeScannerModal"),
      import("@/components/sales-history/index"),
      import("@/components/screens/kassa/cash-history"),
      import("@/components/screens/kassa/cash-operation-dialog"),
    ]).then((results) => {
      if (results.some((r) => r.status === "rejected")) warmed = false
    })
  }
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}
