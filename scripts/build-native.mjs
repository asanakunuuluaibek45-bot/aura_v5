import { spawn } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredPublicConfig = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

// Match Next.js env loading so local .env files and Replit Secrets both work.
const { loadEnvConfig } = await import("@next/env");
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
  if (!existsSync(path.join(projectRoot, "android"))) {
    await run(npx, ["cap", "add", "android"]);
  }
  await run(npx, ["cap", "sync"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Native build failed.");
  process.exitCode = 1;
}
