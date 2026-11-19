import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "GOLDUCHET",
  title: "GOLDUCHET — офлайн-касса",
  description: "Локальная касса GOLDUCHET с офлайн-режимом и фоновой синхронизацией.",
  appleWebApp: {
    capable: true,
    title: "GOLDUCHET",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#29233d",
};

export default function NativeRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
