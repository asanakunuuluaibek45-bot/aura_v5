import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const nav = readFileSync(new URL("../components/crm/app-nav.tsx", import.meta.url), "utf8")

test("the sidebar brand returns to the main CRM screen and has no theme control", () => {
  const headerStart = nav.indexOf("{/* Header */}")
  const headerEnd = nav.indexOf("{/* Desktop collapse toggle */}", headerStart)
  const header = nav.slice(headerStart, headerEnd)

  assert.ok(header.includes('onClick={() => handleNavigate("kassa")}'))
  assert.match(header, /<AuraMark/)
  assert.match(header, /GOLDUCHET/)
  assert.doesNotMatch(nav, /ThemeToggle/)
})
