import { compressToWebp } from "./image"

async function getDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob)
      const dimensions = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dimensions
    } catch {
      // Fall through to Image for mobile browsers with different decoders.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error("Не удалось прочитать фото"))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось подготовить фото"))
    reader.onerror = () => reject(new Error("Не удалось подготовить фото"))
    reader.readAsDataURL(blob)
  })
}

export function createRasterSvgContainer(dataUrl: string, width: number, height: number): string {
  if (!dataUrl.startsWith("data:image/webp;base64,")) throw new Error("Фото должно быть преобразовано в WebP")
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error("Некорректный размер фото")
  const w = Math.round(width)
  const h = Math.round(height)
  const href = dataUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="',
    String(w), '" height="', String(h), '" viewBox="0 0 ', String(w), ' ', String(h), '">',
    '<image x="0" y="0" width="', String(w), '" height="', String(h),
    '" preserveAspectRatio="xMidYMid meet" href="', href, '" xlink:href="', href, '"/>',
    '</svg>',
  ].join("")
}

/** Compress photos through the shared 50 KiB WebP pipeline, then wrap the bitmap in SVG. */
export async function convertRasterFileToSvg(file: File): Promise<string> {
  const webp = await compressToWebp(file)
  const dimensions = await getDimensions(webp)
  return createRasterSvgContainer(await blobToDataUrl(webp), dimensions.width, dimensions.height)
}
