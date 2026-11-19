// После `next build` вписывает в public/sw.js список всех файлов сборки
// (.next/static), чтобы service worker заранее сохранил их для офлайна —
// включая отдельно подгружаемые части (сканер, редактор этикеток и т.д.).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, sep } from "node:path"

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const staticDir = join(root, ".next", "static")
const swFile = join(root, "public", "sw.js")

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|css|woff2?|ttf|otf|wasm|svg|png|webp)$/.test(name)) out.push(full)
  }
  return out
}

if (!existsSync(staticDir)) {
  console.warn("[precache-sw] .next/static не найден — пропуск")
  process.exit(0)
}
const assets = walk(staticDir)
  .map((f) => "/_next/static/" + relative(staticDir, f).split(sep).join("/"))
  .sort()
const src = readFileSync(swFile, "utf8")
const next = src.replace(
  /const PRECACHE_ASSETS = \[[^\]]*\] \/\/ AURA_PRECACHE_ASSETS/,
  `const PRECACHE_ASSETS = ${JSON.stringify(assets)} // AURA_PRECACHE_ASSETS`,
)
if (next === src && !src.includes("AURA_PRECACHE_ASSETS")) {
  console.warn("[precache-sw] метка AURA_PRECACHE_ASSETS не найдена в public/sw.js")
} else {
  writeFileSync(swFile, next)
  console.log(`[precache-sw] ${assets.length} файлов добавлено для офлайна`)
}
