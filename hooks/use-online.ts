"use client"
import { useEffect, useState } from 'react'
/** Fail closed until hydration, then react to browser connectivity changes. */
export function useOnline() {
  const [online, setOnline] = useState(false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
