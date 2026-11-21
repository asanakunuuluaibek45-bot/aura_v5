"use client"

import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export function GoogleAuthButton({
  nextPath,
  label,
}: {
  nextPath: string
  label: string
}) {
  const [isNative, setIsNative] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  const handleGoogleAuth = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const redirectTo = new URL("/auth/callback", window.location.origin)
      redirectTo.searchParams.set("next", nextPath)
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: { prompt: "select_account" },
        },
      })
      if (authError) throw authError
    } catch (authError) {
      console.error("Google authentication error:", authError)
      setError("Не удалось начать вход через Google. Проверьте настройки или войдите по email.")
      setIsLoading(false)
    }
  }

  if (isNative === null) return <div className="h-10" aria-hidden="true" />
  if (isNative) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Вход через Google доступен в веб-версии. В приложении используйте email и пароль.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={handleGoogleAuth}
        disabled={isLoading}
      >
        <span aria-hidden="true" className="font-bold text-base text-[#4285F4]">G</span>
        {isLoading ? "Переход в Google..." : label}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border" />
        </div>
        <p className="relative mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">или через email</p>
      </div>
    </div>
  )
}
