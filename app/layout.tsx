import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { PwaProvider } from "@/components/shared/pwa-provider"
import { Toaster } from "@/components/shared/ui/sonner"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "GOLDUCHET — Управление ювелирным магазином (Local-First)",
  description: "Касса и основные операции GOLDUCHET доступны офлайн после первичной загрузки каталога; изменения синхронизируются при подключении.",
  icons: {
    icon: [{ url: "/favicon.svg?v=golduchet-1", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png?v=golduchet-1", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#29233d",
  viewportFit: "cover",
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
            __html: `(function(){try{var saved=localStorage.getItem("aura-theme");var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=saved==="light"||saved==="dark"?saved:(dark?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"#29233d":"#fbfaff");}catch(e){var fallback=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",fallback==="dark");document.documentElement.style.colorScheme=fallback;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",fallback==="dark"?"#29233d":"#fbfaff")}})();`,
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
