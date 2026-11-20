import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { getTourStartIndex } from "../lib/site-help-tour.ts"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("section cards start their matching tour in help without navigating away", () => {
  const help = read("components/site-help.tsx")
  assert.match(help, /onClick=\{\(\) => startTour\(section\.id\)\}/)
  assert.match(help, /onClick=\{\(\) => startTour\(\)\}[^>]*>Пройти тур/)
  assert.match(help, /setTourIndex\(getTourStartIndex\(tourSteps, sectionId\)\)/)
  assert.match(help, /setOpen\(true\)/)
  assert.doesNotMatch(help, /onNavigate|closeHelp\(\).*section\.id/)
  const dashboard = read("components/dashboard.tsx")
  assert.match(dashboard, /<SiteHelp screen=\{activeScreen\} isAdmin=\{isAdmin\}/)
  assert.doesNotMatch(dashboard.match(/<SiteHelp[^>]+>/)?.[0] ?? "", /onNavigate|isSuperAdmin/)
})

test("a selected tour begins at its matching explanation, and the all-sections tour begins at introduction", () => {
  const steps = [
    { title: "Верхняя панель" },
    { title: "Касса", screen: "kassa" },
    { title: "Деньги", screen: "money" },
    { title: "Витрина", screen: "vitrina" },
    { title: "Склад", screen: "sklad" },
  ]
  assert.equal(getTourStartIndex(steps), 0)
  assert.equal(getTourStartIndex(steps, "kassa"), 1)
  assert.equal(getTourStartIndex(steps, "money"), 2)
  assert.equal(getTourStartIndex(steps, "vitrina"), 3)
  assert.equal(getTourStartIndex(steps, "sklad"), 4)
  assert.equal(getTourStartIndex(steps, "unknown"), 0)
})

test("button-hint mutation and device-persistent help setting are fully removed", () => {
  const help = read("components/site-help.tsx")
  for (const forbidden of [
    "BUTTON_HINTS", "describeButton", "addButtonHints", "FocusHint", "focusHint",
    "hintsEnabled", "aura-button-hints-enabled-v1", "Показывать подсказки к кнопкам",
    "Выбор сохраняется на этом устройстве", "MutationObserver",
  ]) assert.doesNotMatch(help, new RegExp(forbidden))
  assert.match(help, /aria-modal="true"/)
  assert.match(help, /role="dialog"/)
})

test("help excludes protected store/system pages and filters admin sections by role", () => {
  const help = read("components/site-help.tsx")
  assert.doesNotMatch(help, /isSuperAdmin|superAdminOnly|суперадмин|супер-администратор/i)
  assert.doesNotMatch(help, /title: "Магазины"|id: "shops"|id: "notifications"/)
  assert.match(help, /SECTION_GUIDES\.filter\(\(section\) => !section\.adminOnly \|\| isAdmin\)/)
  for (const screen of ["shops", "notifications"]) {
    assert.doesNotMatch(help, new RegExp(`id: "${screen}"`))
  }
})

test("the four legacy screen files were unused and are now removed", () => {
  const legacy = [
    "components/screens/kabinet-screen.tsx",
    "components/screens/otchety-screen.tsx",
    "components/screens/sklad-screen.tsx",
    "components/screens/vitrina-screen.tsx",
  ]
  for (const file of legacy) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file)
  const allSource = readFileSync(new URL("../components/dashboard.tsx", import.meta.url), "utf8")
  for (const file of legacy) assert.doesNotMatch(allSource, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})
