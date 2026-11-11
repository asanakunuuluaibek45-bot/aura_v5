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
  metadataBase: new URL("https://www.golduchet.com"),
  title: "GOLDUCHET — Управление ювелирным магазином",
  description: "GOLDUCHET — касса, витрина, склад и отчёты для ювелирного бизнеса. Полная работа без интернета.",
  applicationName: "GOLDUCHET",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg?v=golduchet-1", type: "image/svg+xml" },
      { url: "/favicon-32x32.png?v=golduchet-1", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png?v=golduchet-1", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=golduchet-1",
    apple: [{ url: "/apple-touch-icon.png?v=golduchet-1", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "GOLDUCHET", statusBarStyle: "black-translucent" },
  openGraph: { siteName: "GOLDUCHET", locale: "ru_RU", type: "website" },
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#000000",
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
