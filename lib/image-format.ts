export async function isHeicImage(file: Blob): Promise<boolean> {
  const name = "name" in file ? String(file.name) : ""
  const type = file.type.toLowerCase()
  if (/\.(heic|heif)$/i.test(name) || type.includes("heic") || type.includes("heif")) return true

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const signature = String.fromCharCode(...header).toLowerCase()
  return /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(signature)
}
