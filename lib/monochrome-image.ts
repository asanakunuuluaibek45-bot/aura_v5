/** Convert RGBA pixels to opaque black-and-white with Floyd–Steinberg dithering. */
export function convertRgbaToMonochrome(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error("Некорректные размеры изображения")
  }
  const gray = new Float32Array(width * height)
  for (let pixel = 0; pixel < gray.length; pixel++) {
    const offset = pixel * 4
    const alpha = data[offset + 3] / 255
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
    gray[pixel] = luminance * alpha + 255 * (1 - alpha)
  }
  const addError = (x: number, y: number, error: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] += error
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const value = Math.max(0, Math.min(255, gray[pixel]))
      const output = value < 128 ? 0 : 255
      const error = value - output
      gray[pixel] = output
      addError(x + 1, y, error * 7 / 16)
      addError(x - 1, y + 1, error * 3 / 16)
      addError(x, y + 1, error * 5 / 16)
      addError(x + 1, y + 1, error / 16)
      const offset = pixel * 4
      data[offset] = output
      data[offset + 1] = output
      data[offset + 2] = output
      data[offset + 3] = 255
    }
  }
  return data
}
