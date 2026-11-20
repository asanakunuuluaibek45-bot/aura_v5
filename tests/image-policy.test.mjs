import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { MAX_IMAGE_BYTES, UPLOAD_IMAGE_TYPE, hasUnsupportedDeclaredImageType, requireWebpWithinLimit } from "../lib/image-policy.ts"
import { isHeicImage } from "../lib/image-format.ts"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

test("uploaded photos use WebP and a strict 50 KiB boundary", () => {
  assert.equal(MAX_IMAGE_BYTES, 50 * 1024)
  assert.equal(UPLOAD_IMAGE_TYPE, "image/webp")
  const exactLimit = new Blob([new Uint8Array(MAX_IMAGE_BYTES)], { type: "image/webp" })
  assert.equal(requireWebpWithinLimit(exactLimit), exactLimit)
  const tooLarge = new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: "image/webp" })
  assert.throws(() => requireWebpWithinLimit(tooLarge), /50 КБ/)
})

test("PNG is never accepted by the upload boundary", () => {
  const png = new Blob(["png"], { type: "image/png" })
  assert.throws(() => requireWebpWithinLimit(png), /WebP/)
})

test("an empty or generic mobile MIME type is sent to image decoding, not discarded", () => {
  assert.equal(hasUnsupportedDeclaredImageType(new Blob(["photo"], { type: "" })), false)
  assert.equal(hasUnsupportedDeclaredImageType(new Blob(["photo"], { type: "application/octet-stream" })), false)
  assert.equal(hasUnsupportedDeclaredImageType(new Blob(["text"], { type: "text/plain" })), true)
})

test("HEIC/HEIF is detected by MIME type, extension, or container signature", async () => {
  const typed = new Blob(["photo"], { type: "image/heic" })
  assert.equal(await isHeicImage(typed), true)
  const bytes = new Uint8Array(20)
  bytes.set(new TextEncoder().encode("ftypheic"), 4)
  assert.equal(await isHeicImage(new Blob([bytes], { type: "application/octet-stream" })), true)
  assert.equal(await isHeicImage(new Blob(["jpeg"], { type: "image/jpeg" })), false)
})

test("compressor checks every WebP output and never returns a failed oversize result", () => {
  const source = read("../lib/image.ts")
  assert.match(source, /out\.type !== "image\/webp"/)
  assert.match(source, /if \(out\.size <= MAX_BYTES\) return requireWebpWithinLimit\(out\)/)
  assert.match(source, /return requireWebpWithinLimit\(out\)/)
})

test("storage bucket enforces the same byte and MIME limits", () => {
  const migration = read("../supabase/migrations/011_product_image_limits.sql")
  const schema = read("../supabase/schema.sql")
  assert.match(migration, /file_size_limit = 51200/)
  assert.match(migration, /ARRAY\['image\/webp'\]/)
  assert.match(schema, /'product-images', 'product-images', true, 51200, ARRAY\['image\/webp'\]/)
})

test("all active product and supplier upload flows use the common WebP compressor", () => {
  for (const path of [
    "../components/product-images.tsx",
    "../components/screens/sklad/add-edit-Product/product-images.tsx",
    "../components/screens/suppliers/supplier-payout/supplier-card.tsx",
  ]) {
    assert.match(read(path), /compressToWebp/)
  }
  assert.match(read("../components/product-images.tsx"), /rpc\("current_shop_id"\)/)
  assert.match(read("../components/product-images.tsx"), /\$\{shopId\}\/.*\.webp/)
})

test("HEIC/HEIF has a conversion fallback and stays a project dependency", () => {
  assert.match(read("../lib/image.ts"), /import\("heic2any"\)/)
  assert.match(read("../package.json"), /"heic2any": "\^0\.0\.4"/)
  assert.match(read("../package-lock.json"), /"node_modules\/heic2any"/)
})

test("AI entry points reference the single project rules folder", () => {
  for (const path of ["../AGENTS.md", "../replit.md", "../.github/copilot-instructions.md"]) {
    assert.match(read(path), /\.ai\/PROJECT_RULES\.md/)
  }
})
