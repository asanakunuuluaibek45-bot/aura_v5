"use client"
// ---------------------------------------------------------------------------
// Действия редактора: добавить текст / рамку, удалить, сохранить, сброс,
// загрузка SVG-рамки, сохранение работы в файл, масштаб элементов
// ---------------------------------------------------------------------------
import { useCallback } from "react"
import { Textbox } from "fabric"
import type { Canvas as FabricCanvas } from "fabric"
import { toast } from "sonner"
import type { LabelSizeDef, JewelryLabelSizeKey } from "@/lib/niimbot"
import type { Product } from "@/lib/types"
import { saveLabelTemplate, getLabelTemplate, restoreShopLabelTemplates } from "@/app/actions/labels"
import {
  getLabelTemplateCategories,
  getLabelTemplateResetCategories,
  type LabelTemplateResetSource,
  type LabelTemplateResetScope,
  type LabelTemplateSaveScope,
} from "@/lib/label-template-policy"
import type { BorderStyleKey } from "../constants"
import { createTextbox, refitTextbox, setAutoFit, setFitRatio, clampRatio } from "../canvas/text-fit"
import { addBorderToCanvas } from "../canvas/borders"
import { buildDefaultLayout } from "../canvas/layout"
import { serializeLayout, parseTemplate, applyTemplate, applyBgRect } from "../data/template"
import { refreshLiveData } from "../canvas/layout"
import { saveLocalTemplate, getLocalTemplate, clearLocalTemplateCache } from "../data/local-template-storage"

export function useLabelActions(
  fabricRef:  React.RefObject<FabricCanvas | null>,
  sizeDef:    LabelSizeDef,
  sizeKey:    JewelryLabelSizeKey,
  offsetX:    number,
  offsetY:    number,
  product:    Product,
  category:   string,
  font:       string,
  fontSize:   number,
  autoFit:    boolean,
  fitRatio:   number,
  isBold = false,
  isItalic = false,
  isUnderline = false,
  isLinethrough = false,
  textAlign: "left" | "center" | "right" = "left",
  charSpacing = 0,
  lineHeight = 1.16,
  shopCategories: string[] = [],
) {
  const applyToSelection = useCallback((patch: Record<string, unknown>) => {
    const canvas  = fabricRef.current
    const objects = canvas?.getActiveObjects() ?? []
    if (!canvas || !objects.length) { toast.info("Выделите элемент на холсте"); return }
    objects.forEach((o) => {
      o.set(patch)
      if (o.type === "textbox") refitTextbox(o as Textbox)
    })
    canvas.renderAll()
  }, [fabricRef])

  const targetTextboxes = useCallback((): Textbox[] => {
    const canvas = fabricRef.current
    if (!canvas) return []
    const selected = canvas.getActiveObjects().filter((o) => o.type === "textbox") as Textbox[]
    return selected.length
      ? selected
      : canvas.getObjects().filter((o) => o.type === "textbox") as Textbox[]
  }, [fabricRef])

  const addText = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const t = createTextbox("Текст", {
      left: 20, top: 20,
      width: Math.round(sizeDef.w_px * 0.5),
      fontSize, fontFamily: font, fill: "#000000",
      fontWeight: isBold ? "bold" : "normal",
      fontStyle: isItalic ? "italic" : "normal",
      underline: isUnderline,
      linethrough: isLinethrough,
      textAlign,
      charSpacing,
      lineHeight,
      data: { role: `custom-t-${Date.now()}`, autoFit, fitRatio },
    })
    canvas.add(t)
    canvas.setActiveObject(t)
    canvas.renderAll()
  }, [
    fabricRef, sizeDef, font, fontSize, autoFit, fitRatio,
    isBold, isItalic, isUnderline, isLinethrough, textAlign, charSpacing, lineHeight,
  ])

  const addBorder = useCallback((styleKey: BorderStyleKey) => {
    const canvas = fabricRef.current
    if (!canvas) return
    addBorderToCanvas(canvas, sizeDef, styleKey)
  }, [fabricRef, sizeDef])

  const removeSelected = useCallback(() => {
    const canvas  = fabricRef.current
    const objects = canvas?.getActiveObjects() ?? []
    if (!canvas || !objects.length) return
    objects.forEach((o) => canvas.remove(o))
    canvas.discardActiveObject()
    canvas.renderAll()
  }, [fabricRef])

  const handleAutoFitChange = useCallback((on: boolean) => {
    const canvas = fabricRef.current
    if (!canvas) return
    targetTextboxes().forEach((tb) => setAutoFit(tb, on))
    canvas.requestRenderAll()
  }, [fabricRef, targetTextboxes])

  const handleFitRatioChange = useCallback((ratio: number) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const r = clampRatio(ratio)
    targetTextboxes().forEach((tb) => setFitRatio(tb, r))
    canvas.requestRenderAll()
    return r
  }, [fabricRef, targetTextboxes])

  const handleFontChange = useCallback((f: string) => {
    applyToSelection({ fontFamily: f })
  }, [applyToSelection])

  const handleFontSizeChange = useCallback((s: number) => {
    applyToSelection({ fontSize: s })
  }, [applyToSelection])

  const handleBoldToggle = useCallback((bold: boolean) => {
    applyToSelection({ fontWeight: bold ? "bold" : "normal" })
  }, [applyToSelection])

  const handleItalicToggle = useCallback((italic: boolean) => {
    applyToSelection({ fontStyle: italic ? "italic" : "normal" })
  }, [applyToSelection])

  const handleUnderlineToggle = useCallback((underline: boolean) => {
    applyToSelection({ underline })
  }, [applyToSelection])

  const handleLinethroughToggle = useCallback((linethrough: boolean) => {
    applyToSelection({ linethrough })
  }, [applyToSelection])

  const handleTextAlignChange = useCallback((align: "left" | "center" | "right") => {
    applyToSelection({ textAlign: align })
  }, [applyToSelection])

  const handleCharSpacingChange = useCallback((spacing: number) => {
    applyToSelection({ charSpacing: spacing })
  }, [applyToSelection])

  const handleLineHeightChange = useCallback((lh: number) => {
    applyToSelection({ lineHeight: lh })
  }, [applyToSelection])

  const handleSaveTemplate = useCallback(async (scope: LabelTemplateSaveScope) => {
    const canvas = fabricRef.current
    if (!canvas) throw new Error("Холст этикетки ещё не готов")
    canvas.discardActiveObject()
    canvas.renderAll()
    const tpl = serializeLayout(canvas, sizeKey, null)
    const serialized = JSON.stringify(tpl)
    const categories = getLabelTemplateCategories(category, shopCategories, scope)
    if (!product.shop_id) {
      throw new Error("Не выбран активный магазин")
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      categories.forEach((targetCategory) => {
        saveLocalTemplate(product.shop_id, targetCategory, serialized, sizeKey)
      })
      return { status: "local-only" as const, categoryCount: categories.length }
    }

    // Update the local cache only after the server confirms the upsert. Otherwise
    // a failed request could make an unsaved design look like the saved template.
    await saveLabelTemplate(categories, serialized, sizeKey, scope)
    categories.forEach((targetCategory) => {
      saveLocalTemplate(product.shop_id, targetCategory, serialized, sizeKey)
    })
    return { status: "server" as const, categoryCount: categories.length }
  }, [fabricRef, sizeKey, category, shopCategories, product.shop_id])

  const handleReloadTemplate = useCallback(async (
    scope: LabelTemplateResetScope,
    source: LabelTemplateResetSource,
  ) => {
    const canvas = fabricRef.current
    if (!canvas) throw new Error("Холст этикетки ещё не готов")
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Для восстановления сохранённого шаблона подключитесь к интернету")
    }
    if (!product.shop_id) throw new Error("Не выбран активный магазин")

    const targetCategories = getLabelTemplateResetCategories(category, shopCategories, scope)
    const templates = await restoreShopLabelTemplates(
      category,
      sizeKey,
      scope,
      source,
    )
    const affectedCategories = scope === "shop"
      ? [...new Set([...targetCategories, ...Object.keys(templates)])]
      : [category]

    affectedCategories.forEach((targetCategory) => {
      clearLocalTemplateCache(product.shop_id, targetCategory, sizeKey)
      const raw = templates[targetCategory]
      if (raw) saveLocalTemplate(product.shop_id, targetCategory, raw, sizeKey)
    })

    if (!canvas.lowerCanvasEl) throw new Error("Холст этикетки закрыт до завершения сброса")
    const raw = templates[category] ?? null
    const saved = parseTemplate(raw)
    if (raw && !saved) {
      throw new Error("Сохранённый шаблон имеет неподдерживаемый формат")
    }

    await buildDefaultLayout(canvas, product, sizeDef)
    if (saved) {
      applyTemplate(canvas, saved)
      await refreshLiveData(canvas, product)
      applyBgRect(canvas, sizeDef, saved.bg ?? null)
    }
    canvas.setViewportTransform([1, 0, 0, 1, offsetX, offsetY])
    canvas.renderAll()
    return {
      scope,
      source,
      categoryCount: source === "shop" ? Object.keys(templates).length : affectedCategories.length,
      hasTemplate: Boolean(saved),
    }
  }, [fabricRef, category, sizeKey, product, sizeDef, offsetX, offsetY, shopCategories])

  const loadTemplate = useCallback(async (canvas: FabricCanvas) => {
    // Локальный шаблон применяется до асинхронной генерации QR, поэтому
    // сохранённая компоновка видна сразу, не ожидая БД или декодирования QR.
    const raw = getLocalTemplate(product.shop_id, category, sizeKey)
    const saved = parseTemplate(raw)
    if (!canvas.lowerCanvasEl) return
    let userEdited = false
    let trackingStarted = false
    const markEdited = (...args: unknown[]) => {
      const event = args[0] as { target?: { data?: { role?: string } } } | undefined
      if (event?.target?.data?.role === "qr") return
      userEdited = true
    }
    const trackedEvents = [
      "object:modified", "object:added", "object:removed",
      "object:moving", "object:scaling", "object:rotating",
      "selection:created", "selection:updated", "text:changed",
    ] as const
    const startTrackingUserEdits = () => {
      if (trackingStarted) return
      trackedEvents.forEach((event) => canvas.on(event, markEdited))
      trackingStarted = true
    }
    const stopTrackingUserEdits = () => {
      if (!trackingStarted) return
      trackedEvents.forEach((event) => canvas.off(event, markEdited))
      trackingStarted = false
    }
    try {
      await buildDefaultLayout(
        canvas,
        product,
        sizeDef,
        saved
          ? () => {
              if (!canvas.lowerCanvasEl) return
              applyTemplate(canvas, saved)
              applyBgRect(canvas, sizeDef, saved.bg ?? null)
            }
          : !raw
            ? startTrackingUserEdits
            : undefined,
      )
    } catch (error) {
      stopTrackingUserEdits()
      throw error
    }
    if (!canvas.lowerCanvasEl) {
      stopTrackingUserEdits()
      return
    }
    if (saved) {
      // Повторное применение нужно для сохранённых координат QR: сам объект
      // добавляется после асинхронного создания изображения.
      applyTemplate(canvas, saved)
      applyBgRect(canvas, sizeDef, saved.bg ?? null)
    }
    canvas.renderAll()

    // При отсутствии локального кэша сначала показываем рабочий стандартный
    // макет, а шаблон из БД загружаем в фоне. Если пользователь уже начал
    // редактирование, поздний ответ не должен перезаписать его изменения.
    if (!raw && (typeof navigator === "undefined" || navigator.onLine)) {
      void getLabelTemplate(category, sizeKey)
        .then((remoteRaw) => {
          if (
            !remoteRaw ||
            userEdited ||
            fabricRef.current !== canvas ||
            !canvas.lowerCanvasEl
          ) return
          const remote = parseTemplate(remoteRaw)
          if (!remote) return
          applyTemplate(canvas, remote)
          applyBgRect(canvas, sizeDef, remote.bg ?? null)
          canvas.requestRenderAll()
          saveLocalTemplate(product.shop_id, category, remoteRaw, sizeKey)
        })
        .catch((error) => {
          console.warn("[label] Не удалось загрузить шаблон из БД:", error)
        })
        .finally(() => {
          stopTrackingUserEdits()
        })
    } else {
      stopTrackingUserEdits()
    }
  }, [fabricRef, category, sizeKey, product, sizeDef])

  // ── Загрузка SVG-рамки из файловой системы ───────────────────────────────
  const loadSvgFrame = useCallback(async (svgText: string, filename: string, preserveAspectRatio = false) => {
    const canvas = fabricRef.current
    if (!canvas) return
    try {
      const { loadSVGFromString, util } = await import("fabric")
      const { objects, options } = await loadSVGFromString(svgText)
      // Группируем объекты SVG в одну группу
      const group = util.groupSVGElements(objects.filter(Boolean) as import("fabric").FabricObject[], options)
      // Масштабируем рамку под размер холста
      const groupWidth = group.width || sizeDef.w_px
      const groupHeight = group.height || sizeDef.h_px
      const scaleX = sizeDef.w_px / groupWidth
      const scaleY = sizeDef.h_px / groupHeight
      const scale = Math.min(scaleX, scaleY)
      group.set({
        left: preserveAspectRatio ? (sizeDef.w_px - groupWidth * scale) / 2 : 0,
        top: preserveAspectRatio ? (sizeDef.h_px - groupHeight * scale) / 2 : 0,
        scaleX: preserveAspectRatio ? scale : scaleX,
        scaleY: preserveAspectRatio ? scale : scaleY,
        selectable: true,
        evented:    true,
        data: { role: "svg-frame", filename },
      })
      // Удаляем старую рамку, если была
      const old = canvas.getObjects().find(
        (o) => (o as unknown as { data?: { role?: string } }).data?.role === "svg-frame"
      )
      if (old) canvas.remove(old)
      canvas.add(group)
      canvas.sendObjectToBack(group)
      canvas.requestRenderAll()
      toast.success(preserveAspectRatio ? `Фото добавлено в SVG-рамку: ${filename}` : `SVG-рамка загружена: ${filename}`)
    } catch (err) {
      toast.error(`Ошибка загрузки SVG: ${(err as Error).message}`)
    }
  }, [fabricRef, sizeDef])

  // ── Сохранение работы в JSON-файл ─────────────────────────────────────────
  const saveToFile = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) { toast.error("Холст не готов"); return }
    try {
      canvas.discardActiveObject()
      canvas.renderAll()
      const json = canvas.toJSON()
      const payload = {
        v: "1",
        sizeKey,
        canvas: json,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `label-${sizeKey}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Файл сохранён")
    } catch (err) {
      toast.error(`Ошибка сохранения: ${(err as Error).message}`)
    }
  }, [fabricRef, sizeKey])

  return {
    addText, addBorder, removeSelected,
    applyToSelection, handleAutoFitChange, handleFitRatioChange,
    handleFontChange, handleFontSizeChange,
    handleBoldToggle, handleItalicToggle, handleUnderlineToggle, handleLinethroughToggle,
    handleTextAlignChange, handleCharSpacingChange, handleLineHeightChange,
    handleSaveTemplate, handleReloadTemplate, loadTemplate,
    loadSvgFrame, saveToFile,
  }
}
