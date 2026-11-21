"use client"

import { useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

type Theme = "light" | "dark"
const STORAGE_KEY = "aura-theme"

function getSavedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : null
  } catch {
    return null
  }
}

function applyTheme(next: Theme, persist = false) {
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The theme still applies for this session if storage is unavailable.
    }
  }
  document.documentElement.classList.toggle("dark", next === "dark")
  document.documentElement.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    next === "dark" ? "#29233d" : "#fbfaff",
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light")
  const manuallyChosen = useRef(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const savedTheme = getSavedTheme()
    const initialTheme = savedTheme ?? (media.matches ? "dark" : "light")
    setTheme(initialTheme)
    applyTheme(initialTheme)

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (getSavedTheme() || manuallyChosen.current) return
      const nextTheme = event.matches ? "dark" : "light"
      setTheme(nextTheme)
      applyTheme(nextTheme)
    }

    media.addEventListener("change", handleSystemThemeChange)
    return () => media.removeEventListener("change", handleSystemThemeChange)
  }, [])

  const toggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    manuallyChosen.current = true
    setTheme(nextTheme)
    applyTheme(nextTheme, true)
  }

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="h-9 w-9 bg-transparent"
      onClick={toggle}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-primary" />
      ) : (
        <Moon className="h-4 w-4 text-primary" />
      )}
    </Button>
  )
}
