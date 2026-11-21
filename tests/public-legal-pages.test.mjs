import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [proxy, terms, privacy, landing] = await Promise.all([
  readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
])

test("terms and privacy routes are excluded from the auth proxy", () => {
  assert.match(proxy, /privacy\(\?:\/\|\$\)/)
  assert.match(proxy, /terms\(\?:\/\|\$\)/)
})

test("legal pages disclose draft status and provide cross-links", () => {
  assert.match(terms, /Рабочий черновик/)
  assert.match(terms, /href="\/privacy"/)
  assert.match(privacy, /рабочий черновик/)
  assert.match(privacy, /href="\/terms"/)
  assert.match(landing, /href="\/terms"/)
  assert.match(landing, /href="\/privacy"/)
})

test("unconfirmed operator, retention, and commercial details remain blank", () => {
  assert.match(terms, /Страна регистрации и применимое право: ______/)
  assert.match(terms, /Тарифы[^<]*: ______|Доступные тарифы,[\s\S]*?: ______/)
  assert.match(terms, /срок удаления из резервных копий пока не установлены: ______/)
  assert.match(privacy, /Данные активного аккаунта: срок не указан — ______/)
})
