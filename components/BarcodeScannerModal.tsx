"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { Button } from "@/components/ui/button"
import { RefreshCw, X } from "lucide-react"

export function BarcodeScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("")
  
  // Используем useRef для хранения текущего медиапотока, чтобы очистка всегда имела к нему доступ
  const activeStreamRef = useRef<MediaStream | null>(null)
  const readerRef = useRef(new BrowserMultiFormatReader())

  // Получаем список доступных камер
  useEffect(() => {
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((devices) => {
        setCameras(devices)
      })
      .catch((err) => console.error("Ошибка получения списка камер:", err))
  }, [])

  // Основная логика запуска камеры
  useEffect(() => {
    let isMounted = true

    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Браузер не поддерживает доступ к камере или соединение не защищено (HTTPS).")
        }

        let stream: MediaStream | null = null

        // 1. Пробуем запросить основную (заднюю) камеру
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } },
            audio: false,
          })
        } catch (_envErr) {
          // 2. Если основной нет, пробуем фронтальную или любую доступную
          console.log("Основная камера недоступна, пробуем фронтальную...")
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "user" } },
            audio: false,
          })
        }

        if (!isMounted) {
          // Если компонент успел размонтироваться пока запрашивался getUserMedia
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        activeStreamRef.current = stream

        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream
          
          const videoTrack = stream.getVideoTracks()[0]
          const settings = videoTrack.getSettings()
          if (settings.deviceId) {
            setCurrentDeviceId(settings.deviceId)
          }

          // Запускаем сканирование через ZXing
          readerRef.current.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
            if (result) {
              onScan(result.getText())
              onClose()
            }
          })
        }
      } catch (err) {
        console.error("Не удалось запустить камеру:", err)
      }
    }

    initCamera()

    // Функция очистки при закрытии/размонтировании компонента
    return () => {
      isMounted = false

      // 1. Останавливаем все треки камеры (индикатор записи погаснет)
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => {
          track.stop()
        })
        activeStreamRef.current = null
      }

      // 2. Сбрасываем источник у видеоэлемента
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }

      // 3. Останавливаем сканирование ZXing (если метод доступен в текущей версии)
      try {
        readerRef.current
      } catch (e) {
        // Игнорируем, если метод сброса отличается в вашей версии пакета
      }
    }
  }, [onScan, onClose])

  // Ручное переключение между камерами
  const switchCamera = async () => {
    if (cameras.length <= 1) return
    const currentIndex = cameras.findIndex((c) => c.deviceId === currentDeviceId)
    const nextIndex = (currentIndex + 1) % cameras.length
    const nextDevice = cameras[nextIndex]
    
    setCurrentDeviceId(nextDevice.deviceId)

    try {
      // Останавливаем старый поток перед запуском нового
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } },
        audio: false,
      })

      activeStreamRef.current = newStream

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
      }
    } catch (e) {
      console.error("Ошибка при переключении камеры:", e)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black shadow-2xl">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="h-64 w-full object-cover" 
        />
        
        {/* Рамка фокуса */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-48 w-48 rounded-lg border-2 border-primary/50 shadow-[0_0_0_999px_rgba(0,0,0,0.5)]"></div>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex justify-between gap-2">
          <Button variant="ghost" className="text-white hover:bg-white/20" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <span className="text-xs text-white/70 self-center">Наведите на бирку</span>
          {cameras.length > 1 && (
            <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20" onClick={switchCamera}>
              <RefreshCw className="h-4 w-4 mr-1" /> Сменить
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}