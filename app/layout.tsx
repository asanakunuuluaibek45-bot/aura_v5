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
  title: "Aura â Ð£Ð¿ÑÐ°Ð²Ð»ÐµÐ½Ð¸Ðµ ÑÐ²ÐµÐ»Ð¸ÑÐ½ÑÐ¼ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð¼ (Local-First)",
  description: "Aura.gold.kg â ÐºÐ°ÑÑÐ°, Ð²Ð¸ÑÑÐ¸Ð½Ð°, ÑÐºÐ»Ð°Ð´ Ð¸ Ð¾ÑÑÑÑÑ Ð´Ð»Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ½Ð¾Ð³Ð¾ Ð±Ð¸Ð·Ð½ÐµÑÐ°. ÐÐ¾Ð»Ð½Ð°Ñ ÑÐ°Ð±Ð¾ÑÐ° Ð±ÐµÐ· Ð¸Ð½ÑÐµÑÐ½ÐµÑÐ°.",
  generator: "v0.app",
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
