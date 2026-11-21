import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  getCameraPermissionError,
  readCameraPermissionState,
} from "../lib/camera-permission.ts"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("camera permission state is queried when supported and safely falls back otherwise", async () => {
  assert.equal(await readCameraPermissionState(undefined), "unknown")
  assert.equal(await readCameraPermissionState({
    query: async () => ({ state: "prompt" }),
  }), "prompt")
  assert.equal(await readCameraPermissionState({
    query: async () => ({ state: "denied" }),
  }), "denied")
  assert.equal(await readCameraPermissionState({
    query: async () => { throw new Error("unsupported descriptor") },
  }), "unknown")
})

test("blocked browser permission explains how to re-enable Chrome site access", () => {
  const denied = getCameraPermissionError("denied")
  const prompt = getCameraPermissionError("prompt")
  assert.match(denied, /Разрешения → Камера → Разрешить/)
  assert.match(denied, /Повторить запрос/)
  assert.match(prompt, /Закройте другие окна/)
  assert.match(prompt, /выберите «Разрешить»/)
})

test("scanner offers a user-gesture retry without persisting a deny choice", () => {
  const modal = read("components/crm/BarcodeScannerModal.tsx")
  assert.match(modal, /await navigator\.mediaDevices\.getUserMedia\(constraints\)/)
  assert.match(modal, /pendingBrowserStreamRef\.current = stream/)
  assert.match(modal, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\)\s*void retryBrowserCamera\(\)/)
  assert.match(modal, /Повторить запрос/)
  assert.doesNotMatch(modal, /localStorage\.setItem\([^)]*camera[^)]*denied/i)
  assert.doesNotMatch(modal, /sessionStorage\.setItem\([^)]*camera[^)]*denied/i)
})
