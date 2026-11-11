import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/crm/pos",
    name: "GOLDUCHET — Учёт ювелирного бизнеса",
    short_name: "GOLDUCHET",
    description: "Склад, касса, витрина и отчёты для ювелирного бизнеса — с работой без интернета.",
    start_url: "/crm/pos",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "any",
    icons: [
      {
        src: "/android-chrome-192x192.png?v=golduchet-1",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png?v=golduchet-1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png?v=golduchet-1",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon-32x32.png?v=golduchet-1",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  }
}
