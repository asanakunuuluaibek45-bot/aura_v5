"use client"

import { MAX_IMAGE_BYTES, requireWebpWithinLimit } from "./image-policy"
import { isHeicImage } from "./image-format"

/**
 * Клиентское сжатие изображений в WebP.
 * Каждый файл (загруженный или снятый камерой) ужимается до <= MAX_BYTES
 * перед отправкой в Supabase Storage. Слишком большой результат не загружается.
 */

export const MAX_BYTES = MAX_IMAGE_BYTES
export const MAX_SIDE = 1000 // Compressed to ~1000px WebP for cloud
export const THUMB_SIDE = 200 // Local preview ~200px

async function loadBitmap(file: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file)
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      }
    } catch {
      // Fall through to HTMLImageElement; some mobile browsers support one decoder but not the other.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Не удалось прочитать изображение"))
      el.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

async function loadHeic(file: Blob) {
  const { default: convertHeic } = await import("heic2any")
  const converted = await convertHeic({ blob: file, toType: "image/jpeg", quality: 0.92 })
  const jpeg = Array.isArray(converted) ? converted[0] : converted
  if (!(jpeg instanceof Blob)) throw new Error("Не удалось преобразовать фото HEIC")
  return jpeg
}

async function loadSourceImage(file: Blob) {
  try {
    return await loadBitmap(file)
  } catch {
    if (!(await isHeicImage(file))) {
      throw new Error("Не удалось открыть фото. Выберите JPG, PNG, WebP, AVIF или HEIC.")
    }
    try {
      return await loadBitmap(await loadHeic(file))
    } catch {
      throw new Error("Не удалось прочитать HEIC/HEIF-фото. Попробуйте сохранить его как JPG и загрузить снова.")
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", quality))
}

/** Сжимает изображение до webp размером не более MAX_BYTES. */
export async function compressToWebp(file: Blob): Promise<Blob> {
  const src = await loadSourceImage(file)

  let scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height))
  let quality = 0.82
  let out: Blob | null = null

  for (let attempt = 0; attempt < 18; attempt++) {
    const w = Math.max(1, Math.round(src.width * scale))
    const h = Math.max(1, Math.round(src.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) break
    src.draw(ctx, w, h)

    out = await toBlob(canvas, quality)
    if (!out) break
    if (out.type !== "image/webp") {
      throw new Error("Устройство не поддерживает сохранение фото в WebP")
    }
    if (out.size <= MAX_BYTES) return requireWebpWithinLimit(out)

    if (quality > 0.42) quality = Math.max(0.42, quality - 0.1)
    else scale *= 0.88
  }

  if (!out) throw new Error("Не удалось сжать изображение")
  return requireWebpWithinLimit(out)
}

export function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Кб`
  return `${(bytes / 1024 / 1024).toFixed(1)} Мб`
}
