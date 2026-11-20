import { compressToWebp } from "@/lib/image"

export interface CompressedImageResult {
  fullBlob: Blob
  thumbnailDataUrl: string
  width: number
  height: number
}

export async function compressProductImage(
  file: File | Blob
): Promise<CompressedImageResult> {
  const fullBlob = await compressToWebp(file)
  const image = await createImageBitmap(fullBlob)
  const fullWidth = image.width
  const fullHeight = image.height
  const maxDimension = 200
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) {
    image.close()
    throw new Error("Could not get thumbnail canvas context")
  }
  context.drawImage(image, 0, 0, width, height)
  image.close()
  const thumbnailDataUrl = canvas.toDataURL("image/webp", 0.8)
  return { fullBlob, thumbnailDataUrl, width: fullWidth, height: fullHeight }
}
