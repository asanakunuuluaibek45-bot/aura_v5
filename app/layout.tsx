import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { PwaProvider } from "@/components/pwa-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "GOLDUCHET — Управление ювелирным магазином (Local-First)",
  description: "GOLDUCHET — касса, витрина, склад и отчёты для ювелирного бизнеса. Полная работа без интернета.",
  generator: "v0.app",
  icons: {
    icon: [{ url: "/favicon.svg?v=golduchet-1", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png?v=golduchet-1", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#1c1830",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("aura-theme")||"dark";document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark")}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <PwaProvider />
        <Suspense fallback={null}>{children}</Suspense>
        <Toaster position="top-center" richColors />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
