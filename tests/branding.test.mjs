import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const root = new URL("../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

test("all manifest entry points agree on brand, identity, colors and icon URLs", () => {
  const manifest = JSON.parse(read("public/manifest.json"))
  assert.deepEqual(JSON.parse(read("public/site.webmanifest")), manifest)
  const source = read("app/manifest.ts")
  for (const key of ["id", "name", "short_name", "description", "start_url", "scope", "display", "background_color", "theme_color", "orientation"]) {
    assert.ok(source.includes(`${key}: "${manifest[key]}"`), key)
  }
  assert.equal(manifest.id, "/crm/pos", "preserve the old effective install identity")
  assert.equal(manifest.start_url, "/crm/pos", "installed apps still open the cash register")
  assert.equal(manifest.short_name, "GOLDUCHET")
  for (const icon of manifest.icons) {
    assert.ok(source.includes(`src: "${icon.src}"`))
    const png = readFileSync(new URL(`public${icon.src.split("?")[0]}`, root))
    assert.equal(png.subarray(1, 4).toString(), "PNG")
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes)
    assert.notEqual(icon.purpose, "maskable", "do not crop the supplied ordinary icons as maskable")
  }
})

test("metadata uses the new domain and explicitly links the iPhone installation icon", () => {
  const layout = read("app/layout.tsx")
  assert.match(layout, /metadataBase: new URL\("https:\/\/www\.golduchet\.com"\)/)
  assert.match(layout, /applicationName: "GOLDUCHET"/)
  assert.match(layout, /appleWebApp: \{ capable: true, title: "GOLDUCHET"/)
  assert.match(layout, /apple-touch-icon\.png\?v=golduchet-1/)
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/)
})

test("brand artwork works in both themes and is cached for offline use", () => {
  const logo = read("components/brand/golduchet-logo.tsx")
  assert.match(logo, /dark:hidden/)
  assert.match(logo, /dark:block/)
  const light = read("public/golduchet-logo.svg")
  const dark = read("public/golduchet-logo-dark.svg")
  assert.equal(dark.replaceAll("#F5F2E9", "#111").trim(), light.trim())
  const sw = read("public/sw.js")
  for (const path of ["/golduchet-logo.svg", "/golduchet-logo-dark.svg", "/golduchet-icon-transparent.svg"]) {
    assert.ok(sw.includes(`'${path}'`), path)
  }
  assert.match(read("components/brand/aura-mark.tsx"), /alt="GOLDUCHET"/)
})

test("rebranding retains local data keys and service-worker message compatibility", () => {
  assert.match(read("app/layout.tsx"), /localStorage\.getItem\("aura-theme"\)/)
  assert.match(read("components/theme-toggle.tsx"), /STORAGE_KEY = "aura-theme"/)
  assert.match(read("lib/local-db/db.ts"), /aura/i)
  const sw = read("public/sw.js")
  assert.match(sw, /aura-crm-shell-/)
  assert.match(sw, /AURA_LOGOUT_CLEANUP/)
  assert.match(read("components/pwa-provider.tsx"), /AURA_SKIP_WAITING/)
  assert.match(read("components/screens/sklad/label/components/toolbar.tsx"), /button-label-reselect-printer/)
})

test("page titles and user-facing strings no longer advertise the old brand", () => {
  function scan(dir) {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) scan(path + "/")
      else if (/\.(tsx?|mjs)$/.test(path)) {
        assert.doesNotMatch(read(path), /Aura CRM|aura\.gold\.kg|gold\.kg|>Aura<|— Aura["`]|в Aura[.!"]/,
          path)
      }
    }
  }
  scan("app/")
  scan("components/")
  scan("lib/")
})

test("primary text and button colors meet a 4.5:1 contrast ratio in both themes", () => {
  const css = read("app/globals.css")
  const luminance = (hex) => {
    const rgb = hex.match(/\w\w/g).map((c) => parseInt(c, 16) / 255)
      .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a)
    return (values[0] + .05) / (values[1] + .05)
  }
  for (const block of [css.split(":root {")[1].split("}")[0], css.split(".dark {")[1].split("}")[0]]) {
    const value = (name) => block.match(new RegExp(`--${name}: #(\\w{6});`))[1]
    assert.ok(contrast(value("primary"), value("primary-foreground")) >= 4.5)
    assert.ok(contrast(value("primary"), value("background")) >= 4.5)
  }
})
