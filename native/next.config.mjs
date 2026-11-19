import path from "node:path";
import { fileURLToPath } from "node:url";

const nativeDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(nativeDir, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  distDir: "out",
  poweredByHeader: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BUILD_TARGET: "native" },
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias ?? {}), "@": projectRoot };
    return config;
  },
};

export default nextConfig;
