"use client"

import { prepareDeviceSignIn, markDeviceSignedIn, createClient } from "@/lib/supabase/client"
import { purgeDeletedAccountData } from "@/lib/local-db/device-logout"
import { Capacitor } from "@capacitor/core"
import { getPostLoginPath } from "@/lib/auth/post-login-route"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import { Label } from "@/components/shared/ui/label"
import Link from "next/link"
import { useEffect, useState } from "react"
import { AuthShell } from "@/components/shared/auth/auth-shell"
import { GoogleAuthButton } from "@/components/shared/auth/google-auth-button"
import { InlineLoader } from "@/components/shared/ui/page-loader"
import { getSavedUserSession, saveUserSession, type SavedUserSession } from "@/lib/local-db/db"
import { WifiOff, UserCheck } from "lucide-react"

function loginErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === "email_not_confirmed") return "Подтвердите email — проверьте почту и перейдите по ссылке."
  if (code === "over_request_rate_limit" || status === 429) return "Слишком много попыток. Подождите немного."
  if (code === "invalid_credentials") return "Неверный email или пароль."
  return "Что-то пошло не так. Попробуйте ещё раз."
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [savedSession, setSavedSession] = useState<SavedUserSession | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [accountDeleted, setAccountDeleted] = useState(false)
  const [cleanupPending, setCleanupPending] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wasDeleted = params.get("accountDeleted") === "1"
    setAccountDeleted(wasDeleted)
    setCleanupPending(params.get("cleanupPending") === "1")
    setIsOffline(!navigator.onLine)
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    if (wasDeleted) {
      // Retry a local purge before rendering any cached-account option.
      void purgeDeletedAccountData()
        .then(() => createClient().auth.signOut({ scope: "local" }))
        .then(() => setCleanupPending(false))
        .catch(() => setCleanupPending(true))
    } else {
      // Check if an offline profile exists in IndexedDB.
      getSavedUserSession().then((session) => {
        if (session && session.profile) {
          setSavedSession(session)
        }
      })
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    prepareDeviceSignIn()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await markDeviceSignedIn()

      // Persist auth session & profile in IndexedDB for offline access.
      let profileForRoute: { role: string | null; status: string | null } | null = null
      if (data?.user) {
        try {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single()
          if (profile) {
            profileForRoute = profile
            await saveUserSession({
              userId: data.user.id,
              email: data.user.email,
              profile,
              session: data.session,
              shopId: profile.shop_id,
            })
          }
        } catch (persistErr) {
          console.warn("Session persist warning:", persistErr)
        }
      }

      // Use a full navigation so Next proxy reads the fresh Supabase cookies before loading CRM.
      window.location.replace(getPostLoginPath(profileForRoute, Capacitor.isNativePlatform()))
    } catch (error: unknown) {
      console.error("[v0] Login error:", error)
      // If offline or network error, check if we can restore offline session
      if (!navigator.onLine && savedSession) {
        window.location.assign("/crm/pos")
        return
      }
      setError(loginErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const [isResuming, setIsResuming] = useState(false)

  // Вход по сохранённой сессии: работает и без сети, и с сетью.
  const handleContinueOffline = async () => {
    setError(null)
    if (!navigator.onLine) {
      // Полная навигация — service worker отдаст закэшированную оболочку CRM.
      window.location.assign("/crm/pos")
      return
    }
    setIsResuming(true)
    try {
      const supabase = createClient()
      const { data: current } = await supabase.auth.getSession()
      if (!current.session) {
        const saved = savedSession?.session
        if (!saved?.refresh_token) throw new Error("no_tokens")
        const { data, error } = await supabase.auth.setSession({
          access_token: saved.access_token,
          refresh_token: saved.refresh_token,
        })
        if (error || !data.session) throw error || new Error("restore_failed")
        if (savedSession) {
          await saveUserSession({
            userId: savedSession.userId,
            email: savedSession.email,
            profile: savedSession.profile,
            shopId: savedSession.shopId,
            session: data.session,
          })
        }
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw userError || new Error("restore_failed")
      const { data: currentProfile, error: profileError } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle()
      if (profileError) throw profileError
      window.location.assign(getPostLoginPath(currentProfile, Capacitor.isNativePlatform()))
    } catch (err) {
      // Сеть «есть», но облако недоступно — пробуем открыть локальную копию.
      const msg = String((err as Error)?.message || "")
      if (/fetch|network|Failed/i.test(msg)) {
        window.location.assign("/crm/pos")
        return
      }
      setError("Сохранённая сессия истекла. Войдите по email и паролю.")
    } finally {
      setIsResuming(false)
    }
  }

  return (
    <AuthShell title="Вход в систему" subtitle="Введите данные, чтобы войти в личный кабинет GOLDUCHET">
      {accountDeleted && (
        <p className={`mb-4 rounded-xl border p-4 text-sm ${cleanupPending ? "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" : "border-emerald-400 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"}`}>
          {cleanupPending
            ? "Аккаунт удалён. Очистку части данных подтвердить не удалось — свяжитесь с администратором."
            : "Аккаунт и связанные данные удалены."}
        </p>
      )}
      {savedSession && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-sm dark:border-amber-800/80 dark:bg-amber-950/40 shadow-xs">
          <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
            {isOffline ? <WifiOff className="w-4 h-4 text-amber-600" /> : <UserCheck className="w-4 h-4 text-amber-600" />}
            <span>{isOffline ? "Офлайн-режим активен" : "Сохранённая локальная сессия"}</span>
          </div>
          <p className="mt-1.5 text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
            Сотрудник: <strong className="font-semibold">{savedSession.profile?.full_name || savedSession.email}</strong>{" "}
            ({savedSession.profile?.role === "admin" ? "Администратор" : savedSession.profile?.role === "super_admin" ? "Суперадмин" : "Продавец"})
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleContinueOffline}
            disabled={isResuming}
            className="mt-3 w-full border-amber-400 bg-amber-100/70 text-amber-950 hover:bg-amber-200/80 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-100 font-medium"
          >
            {isResuming ? "Вход..." : isOffline ? "Войти в CRM без сети" : "Продолжить как сохранённый сотрудник"}
          </Button>
        </div>
      )}

      <div className="mb-4">
        <GoogleAuthButton nextPath="/crm/pos" label="Войти через Google" />
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="mail@golduchet.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <InlineLoader />
              Вход...
            </span>
          ) : (
            "Войти"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/auth/sign-up" className="text-primary underline-offset-4 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
