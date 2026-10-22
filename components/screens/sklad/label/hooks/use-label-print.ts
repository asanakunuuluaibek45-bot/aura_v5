"use client"
// ---------------------------------------------------------------------------
// Хук печати: handlePrint + автопечать
// ---------------------------------------------------------------------------
import { useRef, useCallback, useEffect } from "react"
import { toast } from "sonner"
import type { Canvas as FabricCanvas } from "fabric"
import type { LabelSizeDef, PrinterProfile } from "@/lib/niimbot"
import { printCanvas } from "@/lib/niimbot"
import { getPrintErrorMessage } from "@/lib/printer-errors"
import { cropPrintArea } from "../canvas/print"

export function useLabelPrint(
  fabricRef:     React.RefObject<FabricCanvas | null>,
  sizeDef:       LabelSizeDef,
  loaded:        boolean,
  autoPrint:     boolean,
  printerProfile: PrinterProfile,
  copies:        number,
  density:       number,
  setIsPrinting: (v: boolean) => void,
  setStatus:     (v: string) => void,
  onSuccess?:    () => void,
) {
  const autoPrintedRef = useRef(false)

  const handlePrint = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas || !loaded) return
    setIsPrinting(true)
    setStatus("Подготовка печати...")
    let printSucceeded = false
    try {
      const cropped = cropPrintArea(canvas, sizeDef, printerProfile.dpi)
      await printCanvas(cropped, sizeDef, {
        model: printerProfile,
        copies,
        density,
        onProgress: (msg) => setStatus(String(msg)),
      })
      printSucceeded = true
      toast.success(printerProfile.driver === "dejen"
        ? "Данные переданы Dejen. Проверьте напечатанную этикетку."
        : "Печать успешно завершена")
    } catch (err) {
      const name =
        typeof err === "object" && err !== null && "name" in err
          ? String(err.name)
          : ""
      if (name !== "NotFoundError") {
        console.error("[Print Error]:", err)
      }
      toast.error(getPrintErrorMessage(err), { duration: 6000 })
    } finally {
      setIsPrinting(false)
      setStatus("")
    }
    if (printSucceeded) onSuccess?.()
  }, [fabricRef, sizeDef, loaded, printerProfile, copies, density, setIsPrinting, setStatus, onSuccess])

  useEffect(() => {
    if (!autoPrint || !loaded || autoPrintedRef.current) return
    autoPrintedRef.current = true
    void handlePrint()
  }, [autoPrint, loaded, handlePrint])

  return { handlePrint }
}
