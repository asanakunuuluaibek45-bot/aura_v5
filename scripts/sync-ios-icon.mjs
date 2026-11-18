import { access, copyFile, mkdir, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const source = join(projectRoot, "resources", "ios", "AppIcon.appiconset")
const destination = join(
  projectRoot,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
)

try {
  await access(join(projectRoot, "ios", "App", "App.xcodeproj"))
} catch {
  console.log("iOS icon not synced: add the Capacitor iOS platform first with `npx cap add ios`.")
  process.exit(0)
}

await mkdir(destination, { recursive: true })
for (const file of await readdir(source)) {
  await copyFile(join(source, file), join(destination, file))
}

console.log("GOLDUCHET iOS app icons copied into the Xcode asset catalog.")
