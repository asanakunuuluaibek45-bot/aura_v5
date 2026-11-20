import path from "node:path";
import { fileURLToPath } from "node:url";

const nativeDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(nativeDir, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  // Keep the explicit export directory used by the existing native build script.
  distDir: "out",
  poweredByHeader: false,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BUILD_TARGET: "native",
    NEXT_PUBLIC_NATIVE_API_ORIGIN: process.env.NATIVE_API_ORIGIN || "https://www.golduchet.com",
    NEXT_PUBLIC_SITE_URL: process.env.NATIVE_API_ORIGIN || "https://www.golduchet.com",
  },
  experimental: { cpus: 1 },
  webpack(config) {
    config.resolve.alias = {
      "@/app/actions": path.join(nativeDir, "generated-actions"),
      [path.join(projectRoot, "app/actions")]: path.join(nativeDir, "generated-actions"),
      ...(config.resolve.alias ?? {}),
      "@": projectRoot,
    };
    return config;
  },
};

export default nextConfig;
