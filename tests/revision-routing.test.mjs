import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"
import config from "../next.config.mjs"

test("the CRM revision URL resolves to the page used by server actions", async () => {
  const rewrites = await config.rewrites()
  assert.deepEqual(rewrites.find(({ source }) => source === "/crm/revisions"), {
    source: "/crm/revisions",
    destination: "/revisions",
  })
  assert.ok(existsSync(new URL("../app/(crm)/revisions/page.tsx", import.meta.url)))
})
