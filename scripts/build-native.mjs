import { spawn } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import("./generate-native-actions.mjs");
const requiredPublicConfig = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const targetPlatform = process.argv[2];
if (targetPlatform && !["ios", "android"].includes(targetPlatform)) {
  console.error("Native build target must be ios or android.");
  process.exit(1);
}

// Match Next.js env loading so local .env files and Replit Secrets both work.
const nextEnv = await import("@next/env");
const loadEnvConfig =
  typeof nextEnv.loadEnvConfig === "function"
    ? nextEnv.loadEnvConfig
    : typeof nextEnv.default?.loadEnvConfig === "function"
      ? nextEnv.default.loadEnvConfig
      : null;
if (!loadEnvConfig) {
  throw new TypeError("@next/env does not expose loadEnvConfig.");
}
loadEnvConfig(projectRoot);

for (const key of requiredPublicConfig) {
  if (!process.env[key]?.trim()) {
    console.error(`Native build needs ${key} in the build environment.`);
    process.exit(1);
  }
}

const env = { ...process.env, BUILD_TARGET: "native" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

try {
  await run(npx, ["next", "build", "native", "--webpack"]);
  await rm(path.join(projectRoot, "out"), { recursive: true, force: true });
  await cp(path.join(projectRoot, "native", "out"), path.join(projectRoot, "out"), { recursive: true });
  // The native Next project has no separate public/ directory. Ship the SAME
  // brand assets/icons as the PWA without overwriting its exported entry page.
  const publicDir = path.join(projectRoot, "public");
  await cp(publicDir, path.join(projectRoot, "out"), {
    recursive: true,
    filter: (source) => source !== path.join(publicDir, "sw.js") &&
      source !== path.join(publicDir, "index.html"),
  });
  const androidDir = path.join(projectRoot, "android");
  const iosDir = path.join(projectRoot, "ios");
  if (targetPlatform === "ios" && !existsSync(iosDir)) {
    await run(npx, ["cap", "add", "ios"]);
  } else if (targetPlatform !== "ios" && !existsSync(androidDir)) {
    await run(npx, ["cap", "add", "android"]);
  }
  await run(npx, ["cap", "sync", ...(targetPlatform ? [targetPlatform] : [])]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Native build failed.");
  process.exitCode = 1;
}
