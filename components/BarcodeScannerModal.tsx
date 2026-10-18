"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, EyeOff, Image as ImageIcon, Keyboard, RefreshCw, X, Zap, ZapOff } from "lucide-react"
import { playScanBeep } from "@/lib/sound"

interface BarcodeScannerProps {
  onClose: () => void
  onScan: (code: string) => void
}

export function BarcodeScannerModal({ onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const closedRef = useRef(false)
  const animFrameRef = useRef<number | null>(null)

  const camerasRef = useRef<MediaDeviceInfo[]>([])
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState("")
  const [manualMode, setManualMode] = useState(false)

  // Ð¤Ð»Ð°Ð³: Ð´ÐµÐ¹ÑÑÐ²Ð¸ÑÐµÐ»ÑÐ½Ð¾ Ð»Ð¸ ÑÐµÐºÑÑÐ¸Ð¹ Ð·Ð°Ð¿ÑÑÐµÐ½Ð½ÑÐ¹ ÑÑÐµÐº ÑÐ²Ð»ÑÐµÑÑÑ ÑÐµÐ»ÑÐ¸-ÐºÐ°Ð¼ÐµÑÐ¾Ð¹
  const [isFrontCamera, setIsFrontCamera] = useState(false)

  // ÐÑÐµÐ´ÑÐ¿ÑÐµÐ¶Ð´ÐµÐ½Ð¸Ðµ Ð¾ Ð¿Ð»Ð¾ÑÐ¾ ÑÐ¸ÑÐ°ÐµÐ¼Ð¾Ð¼ / Ð¿ÐµÑÐµÐºÑÑÑÐ¾Ð¼ ÐºÐ¾Ð´Ðµ
  const [isBadQuality, setIsBadQuality] = useState(false)
  const checksumErrorCountRef = useRef(0)

  // ÐÐ¾Ð·Ð¼Ð¾Ð¶Ð½Ð¾ÑÑÐ¸ ÐºÐ°Ð¼ÐµÑÑ
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null)

  // ÐÐ¾Ð´Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ ÑÐ¸ÑÑÐµÐ¼Ð½ÑÑ Ð¸ÑÐºÐ»ÑÑÐµÐ½Ð¸Ð¹ ZXing Ð² ÐºÐ¾Ð½ÑÐ¾Ð»Ð¸ Next.js / Turbopack
  useEffect(() => {
    const originalError = console.error
    const originalWarn = console.warn

    const filter = (orig: typeof console.error, ...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : ""
      if (
        msg.includes("NotFoundException") ||
        msg.includes("ChecksumException") ||
        msg.includes("FormatException") ||
        msg.includes("non-ReaderException")
      ) {
        return
      }
      orig.apply(console, args)
    }

    console.error = (...a) => filter(originalError, ...a)
    console.warn = (...a) => filter(originalWarn, ...a)

    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  const stopEverything = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    try {
      controlsRef.current?.stop()
    } catch {
      /* ignore */
    }
    controlsRef.current = null

    const stream = activeStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          /* ignore */
        }
      })
      activeStreamRef.current = null
    }

    const video = videoRef.current
    if (video) {
      try {
        video.pause()
      } catch {
        /* ignore */
      }
      video.srcObject = null
    }
  }, [])

  const close = useCallback(() => {
    closedRef.current = true
    stopEverything()
    onClose()
  }, [onClose, stopEverything])

  const handleResult = useCallback(
    (text: string) => {
      const clean = text.trim()
      if (clean.length < 3 || closedRef.current) return
      closedRef.current = true

      // Â«ÐÐ¸ÐºÂ» ÐºÐ°ÑÑÐ¾Ð²Ð¾Ð³Ð¾ Ð°Ð¿Ð¿Ð°ÑÐ°ÑÐ° Ð¿ÑÐ¸ ÑÑÐ¿ÐµÑÐ½Ð¾Ð¼ ÑÐ°ÑÐ¿Ð¾Ð·Ð½Ð°Ð²Ð°Ð½Ð¸Ð¸ ÐºÐ¾Ð´Ð°.
      playScanBeep()

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(80)
      }

      stopEverything()
      onScan(clean)
      onClose()
    },
    [onClose, onScan, stopEverything],
  )

  useEffect(() => {
    closedRef.current = false
    return () => {
      closedRef.current = true
    }
  }, [])

  const toggleTorch = async () => {
    const track = activeStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const nextState = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      })
      setTorchOn(nextState)
    } catch {
      /* ignore */
    }
  }

  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setFocusPoint({ x, y })
    setTimeout(() => setFocusPoint(null), 1000)

    const track = activeStreamRef.current?.getVideoTracks()[0]
    if (!track) return

    const capabilities = track.getCapabilities?.() as Record<string, unknown>
    if (capabilities?.focusMode) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        })
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      stopEverything()
      setError(null)
      setIsBadQuality(false)
      checksumErrorCountRef.current = 0
      setTorchOn(false)
      setTorchAvailable(false)

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("ÐÑÐ°ÑÐ·ÐµÑ Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑÐ¶Ð¸Ð²Ð°ÐµÑ ÐºÐ°Ð¼ÐµÑÑ Ð¸Ð»Ð¸ ÑÐ¾ÐµÐ´Ð¸Ð½ÐµÐ½Ð¸Ðµ Ð½Ðµ Ð·Ð°ÑÐ¸ÑÐµÐ½Ð¾ (HTTPS).")
        return
      }

      await new Promise((r) => setTimeout(r, 60))
      if (cancelled || closedRef.current) return

      const chosen = camerasRef.current[deviceIndex]
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          ...(chosen?.deviceId
            ? { deviceId: { exact: chosen.deviceId } }
            : { facingMode: { ideal: facing } }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        const name = (err as DOMException)?.name
        setError(
          name === "NotAllowedError"
            ? "ÐÐ¾ÑÑÑÐ¿ Ðº ÐºÐ°Ð¼ÐµÑÐµ Ð·Ð°Ð¿ÑÐµÑÑÐ½. Ð Ð°Ð·ÑÐµÑÐ¸ÑÐµ Ð´Ð¾ÑÑÑÐ¿ Ð² Ð½Ð°ÑÑÑÐ¾Ð¹ÐºÐ°Ñ."
            : name === "NotFoundError"
              ? "ÐÐ°Ð¼ÐµÑÐ° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð° Ð½Ð° ÑÑÑÑÐ¾Ð¹ÑÑÐ²Ðµ."
              : "ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð·Ð°Ð¿ÑÑÑÐ¸ÑÑ ÐºÐ°Ð¼ÐµÑÑ.",
        )
        return
      }

      if (cancelled || closedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      activeStreamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        activeStreamRef.current = null
        return
      }

      // ÐÐ¿ÑÐµÐ´ÐµÐ»ÑÐµÐ¼, ÑÐ²Ð»ÑÐµÑÑÑ Ð»Ð¸ ÑÐµÐºÑÑÐ°Ñ Ð°ÐºÑÐ¸Ð²Ð½Ð°Ñ ÐºÐ°Ð¼ÐµÑÐ° Ð´ÐµÐ¹ÑÑÐ²Ð¸ÑÐµÐ»ÑÐ½Ð¾ ÑÑÐ¾Ð½ÑÐ°Ð»ÑÐ½Ð¾Ð¹
      const track = stream.getVideoTracks()[0]
      if (track) {
        const settings = track.getSettings?.()
        const label = (chosen?.label || track.label || "").toLowerCase()
        
        const isUserFacing = 
          settings?.facingMode === "user" ||
          facing === "user" ||
          label.includes("front") ||
          label.includes("Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ") ||
          label.includes("selfie")

        setIsFrontCamera(isUserFacing)

        if (track.getCapabilities) {
          const caps = track.getCapabilities() as Record<string, unknown>
          if (caps.torch) setTorchAvailable(true)
        }
      }

      video.srcObject = stream
      try {
        await video.play()
      } catch {
        /* autoplay catch */
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === "videoinput")
        camerasRef.current = videoInputs
        if (!cancelled && !closedRef.current) setCameras(videoInputs)
      } catch {
        /* ignore */
      }

      if (cancelled || closedRef.current) return

      // 1. ÐÐ°ÑÐ¸Ð²Ð½ÑÐ¹ BarcodeDetector (Chrome / Android)
      if ("BarcodeDetector" in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "data_matrix"],
          })

          let lastScanTime = 0
          const processFrame = async (time: number) => {
            if (cancelled || closedRef.current) return

            if (time - lastScanTime > 80 && video.readyState >= 2) {
              lastScanTime = time
              try {
                const barcodes = await barcodeDetector.detect(video)
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  setIsBadQuality(false)
                  handleResult(barcodes[0].rawValue)
                  return
                }
              } catch {
                /* ignore */
              }
            }
            animFrameRef.current = requestAnimationFrame(processFrame)
          }

          animFrameRef.current = requestAnimationFrame(processFrame)
          return
        } catch {
          /* Fallback */
        }
      }

      // 2. Fallback ZXing Ñ ÑÑÐµÐºÐ¸Ð½Ð³Ð¾Ð¼ ÐºÐ°ÑÐµÑÑÐ²Ð° Ð¸Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð¸Ñ
      const reader = new BrowserMultiFormatReader()
      try {
        const controls = await reader.decodeFromVideoElement(video, (result, err) => {
          if (result) {
            setIsBadQuality(false)
            checksumErrorCountRef.current = 0
            handleResult(result.getText())
            return
          }

          if (err) {
            const errName = err.name || err.constructor?.name
            if (errName === "ChecksumException" || errName === "FormatException") {
              checksumErrorCountRef.current += 1
              if (checksumErrorCountRef.current >= 3) {
                setIsBadQuality(true)
              }
            } else if (errName === "NotFoundException") {
              if (checksumErrorCountRef.current > 0) {
                checksumErrorCountRef.current -= 1
                if (checksumErrorCountRef.current === 0) setIsBadQuality(false)
              }
            }
          }
        })

        if (cancelled || closedRef.current) controls.stop()
        else controlsRef.current = controls
      } catch {
        if (!cancelled && !closedRef.current) {
          setError("ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð·Ð°Ð¿ÑÑÑÐ¸ÑÑ ÑÐ°ÑÐ¿Ð¾Ð·Ð½Ð°Ð²Ð°Ð½Ð¸Ðµ. ÐÐ°Ð³ÑÑÐ·Ð¸ÑÐµ ÑÐ¾ÑÐ¾.")
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      stopEverything()
    }
  }, [deviceIndex, facing, handleResult, stopEverything])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  const switchCamera = () => {
    if (cameras.length > 1) {
      setDeviceIndex((i) => (i + 1) % cameras.length)
    } else {
      setFacing((f) => (f === "environment" ? "user" : "environment"))
    }
  }

  const decodeFile = async (file: File) => {
    setError(null)
    const url = URL.createObjectURL(file)
    try {
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageUrl(url)
      handleResult(result.getText())
    } catch {
      setError("QR Ð¸Ð»Ð¸ ÑÑÑÐ¸ÑÐºÐ¾Ð´ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½ Ð½Ð° ÑÐ¾ÑÐ¾.")
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex h-screen w-screen flex-col bg-black text-white"
      onClick={close}
    >
      <div
        className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ð¨Ð°Ð¿ÐºÐ° */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Ð¡ÐºÐ°Ð½ÐµÑ ÐºÐ¾Ð´Ð¾Ð²
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-black/40 hover:bg-white/20 text-white"
            onClick={close}
            aria-label="ÐÐ°ÐºÑÑÑÑ"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* ÐÐ±Ð»Ð°ÑÑÑ ÐºÐ°Ð¼ÐµÑÑ */}
        <div
          className="relative flex-1 w-full overflow-hidden bg-black select-none cursor-pointer"
          onClick={handleTapToFocus}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover transform-gpu ${
              isFrontCamera ? "scale-x-[-1]" : ""
            }`}
          />

          {/* Ð Ð°Ð¼ÐºÐ° Ð¸ ÑÐºÐ°Ð½-Ð»Ð¸Ð½Ð¸Ñ */}
          {!error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-64 w-64 sm:h-72 sm:w-72 rounded-3xl border-2 border-white/30 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                <div className="absolute -top-0.5 -left-0.5 h-6 w-6 border-t-2 border-l-2 border-primary rounded-tl-xl" />
                <div className="absolute -top-0.5 -right-0.5 h-6 w-6 border-t-2 border-r-2 border-primary rounded-tr-xl" />
                <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-2 border-l-2 border-primary rounded-bl-xl" />
                <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 border-b-2 border-r-2 border-primary rounded-br-xl" />

                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line" />
              </div>
            </div>
          )}

          {/* ÐÐ»Ð°ÑÐºÐ° Ð¿ÑÐµÐ´ÑÐ¿ÑÐµÐ¶Ð´ÐµÐ½Ð¸Ñ: ÐÐµÑÐµÐºÑÑÑ Ð¸Ð»Ð¸ ÑÐ°ÑÑÐ¾ÐºÑÑÐ¸ÑÐ¾Ð²Ð°Ð½ */}
          {isBadQuality && !error && (
            <div className="pointer-events-none absolute bottom-6 inset-x-0 z-20 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 rounded-full bg-amber-500/90 px-4 py-2 text-xs font-medium text-black shadow-lg backdrop-blur-md">
                <EyeOff className="h-4 w-4 shrink-0" />
                <span>ÐÐ¾Ð´ Ð¿ÐµÑÐµÐºÑÑÑ, Ð±Ð»Ð¸ÐºÑÐµÑ Ð¸Ð»Ð¸ Ð½Ðµ Ð² ÑÐ¾ÐºÑÑÐµ</span>
              </div>
            </div>
          )}

          {/* Ð¢Ð¾ÑÐºÐ° ÑÐ¾ÐºÑÑÐ¸ÑÐ¾Ð²ÐºÐ¸ */}
          {focusPoint && (
            <div
              className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/80 animate-ping"
              style={{ left: focusPoint.x, top: focusPoint.y }}
            />
          )}

          {/* ÐÑÐ¿ÑÑÐºÐ° */}
          {torchAvailable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void toggleTorch()
              }}
              className="absolute top-16 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md active:scale-95 transition-transform"
            >
              {torchOn ? <Zap className="h-5 w-5 text-yellow-400 fill-yellow-400" /> : <ZapOff className="h-5 w-5" />}
            </button>
          )}

          {/* ÐÑÐ¸Ð±ÐºÐ° */}
          {error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95 px-6 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{error}</p>
            </div>
          )}
        </div>

        {/* ÐÐ°Ð½ÐµÐ»Ñ ÑÐ¿ÑÐ°Ð²Ð»ÐµÐ½Ð¸Ñ */}
        <div className="z-20 space-y-3 p-4 bg-black/80 backdrop-blur-lg border-t border-white/10 shrink-0">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1 text-xs rounded-xl h-11 bg-white/5 border-white/10 hover:bg-white/10 text-white"
              onClick={switchCamera}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Ð¡Ð¼ÐµÐ½Ð¸ÑÑ ÐºÐ°Ð¼ÐµÑÑ
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-1 text-xs rounded-xl h-11 bg-white/5 border-white/10 hover:bg-white/10 text-white"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              ÐÐ°Ð»ÐµÑÐµÑ
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void decodeFile(file)
            }}
          />

          {manualMode ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const code = manual.trim()
                if (code) handleResult(code)
              }}
            >
              <Input
                autoFocus
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="ÐÐ¾Ð´ Ð¸Ð»Ð¸ Ð°ÑÑÐ¸ÐºÑÐ»..."
                className="h-11 text-xs rounded-xl bg-white/5 border-white/10 text-white"
              />
              <Button type="submit" size="lg" className="h-11 text-xs rounded-xl px-5" disabled={!manual.trim()}>
                ÐÐ
              </Button>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground rounded-xl h-9 hover:bg-white/5"
              onClick={() => setManualMode(true)}
            >
              <Keyboard className="mr-2 h-4 w-4" />
              ÐÐ²ÐµÑÑÐ¸ ÐºÐ¾Ð´ Ð²ÑÑÑÐ½ÑÑ
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
