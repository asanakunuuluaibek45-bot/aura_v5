"use client"

/**
 * Нативный сканер штрихкодов/QR на базе Google ML Kit (@capacitor-mlkit/barcode-scanning).
 * Используется в iOS-приложении Capacitor, где WebView не поддерживает BarcodeDetector,
 * а ZXing в JS работает медленно. Камера рендерится нативно ПОД WebView,
 * поэтому на время сканирования фон страницы делается прозрачным.
 */
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"

export type NativeScanPoint = { x: number; y: number }
export type NativeScanResult = { rawValue: string; points: NativeScanPoint[] }

type Plugin = typeof import("@capacitor-mlkit/barcode-scanning")

let pluginPromise: Promise<Plugin> | null = null
function loadPlugin() {
  pluginPromise ??= import("@capacitor-mlkit/barcode-scanning")
  return pluginPromise
}

export const NATIVE_SCANNER_BODY_CLASS = "barcode-scanner-active"

/** Нативный ML Kit используем только в iOS-оболочке, где плагин зарегистрирован. */
export function canUseNativeScanner(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "ios" &&
      Capacitor.isPluginAvailable("BarcodeScanner")
    )
  } catch {
    return false
  }
}

export async function ensureNativeCameraPermission(): Promise<boolean> {
  const { BarcodeScanner } = await loadPlugin()
  const current = await BarcodeScanner.checkPermissions()
  if (current.camera === "granted" || current.camera === "limited") return true
  const requested = await BarcodeScanner.requestPermissions()
  return requested.camera === "granted" || requested.camera === "limited"
}

export type NativeScanSession = {
  stop: () => Promise<void>
  toggleTorch: () => Promise<boolean>
  isTorchAvailable: () => Promise<boolean>
}

export async function startNativeScan(
  onBarcodes: (results: NativeScanResult[]) => void,
  facing: "environment" | "user" = "environment",
): Promise<NativeScanSession> {
  const { BarcodeScanner, BarcodeFormat, LensFacing } = await loadPlugin()
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1

  document.documentElement.classList.add(NATIVE_SCANNER_BODY_CLASS)
  document.body.classList.add(NATIVE_SCANNER_BODY_CLASS)

  let listener: PluginListenerHandle | null = null
  let stopped = false

  const cleanupDom = () => {
    document.documentElement.classList.remove(NATIVE_SCANNER_BODY_CLASS)
    document.body.classList.remove(NATIVE_SCANNER_BODY_CLASS)
  }

  try {
    listener = await BarcodeScanner.addListener("barcodesScanned", (event) => {
      if (stopped) return
      const results: NativeScanResult[] = []
      for (const barcode of event.barcodes ?? []) {
        const rawValue = barcode.rawValue || barcode.displayValue
        if (!rawValue) continue
        // cornerPoints приходят в физических пикселях экрана — переводим в CSS-пиксели.
        const points = (barcode.cornerPoints ?? []).map(([x, y]) => ({ x: x / dpr, y: y / dpr }))
        results.push({ rawValue, points })
      }
      if (results.length) onBarcodes(results)
    })

    await BarcodeScanner.startScan({
      formats: [
        BarcodeFormat.QrCode,
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.UpcA,
        BarcodeFormat.DataMatrix,
      ],
      lensFacing: facing === "user" ? LensFacing.Front : LensFacing.Back,
    })
  } catch (error) {
    stopped = true
    await listener?.remove().catch(() => undefined)
    cleanupDom()
    throw error
  }

  let torchOn = false
  return {
    stop: async () => {
      if (stopped) return
      stopped = true
      try {
        if (torchOn) await BarcodeScanner.disableTorch().catch(() => undefined)
        await listener?.remove()
        await BarcodeScanner.stopScan()
      } catch {
        /* ignore */
      } finally {
        cleanupDom()
      }
    },
    toggleTorch: async () => {
      await BarcodeScanner.toggleTorch()
      const state = await BarcodeScanner.isTorchEnabled()
      torchOn = state.enabled
      return torchOn
    },
    isTorchAvailable: async () => {
      try {
        return (await BarcodeScanner.isTorchAvailable()).available
      } catch {
        return false
      }
    },
  }
}
