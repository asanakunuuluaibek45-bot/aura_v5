export const MAX_IMAGE_BYTES = 50 * 1024
export const UPLOAD_IMAGE_TYPE = "image/webp"

export function hasUnsupportedDeclaredImageType(file: Blob): boolean {
  const type = file.type.trim().toLowerCase()
  return Boolean(type && type !== "application/octet-stream" && type !== "binary/octet-stream" && !type.startsWith("image/"))
}

export function requireWebpWithinLimit(blob: Blob): Blob {
  if (blob.type !== UPLOAD_IMAGE_TYPE) {
    throw new Error("Фотография должна быть преобразована в WebP")
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Фото не удалось сжать до ${Math.round(MAX_IMAGE_BYTES / 1024)} КБ. Выберите другое фото.`)
  }
  return blob
}
