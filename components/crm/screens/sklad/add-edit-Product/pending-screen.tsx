"use client"

import type { Profile } from "@/lib/types"
import { Button } from "@/components/shared/ui/button"
import { AuraMark } from "@/components/shared/brand/aura-mark"
import { logoutDeviceAccount } from "@/lib/local-db/device-logout"
import { UnsyncedLogoutError } from "@/lib/offline-policy"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Clock, XCircle, Loader2 } from "lucide-react"
import { useState, useEffect, useTransition } from "react"

export function PendingScreen({ profile, email }: { profile: Profile | null; email: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const rejected = profile?.status === "rejected"
  // Авто-обновление каждые 10 сек для pending: когда admin подтвердит — страница перезагрузится.
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (rejected) return
    const interval = setInterval(() => {
      setChecking(true)
      startTransition(() => { router.refresh(); setChecking(false) })
    }, 10_000)
    return () => clearInterval(interval)
  }, [rejected, router])

  const signOut = async () => {
    try {
      try { await logoutDeviceAccount() }
      catch (error) {
        if (!(error instanceof UnsyncedLogoutError)) throw error
        if (!window.confirm(error.message + " Восстановление невозможно. Стереть данные и выйти?")) return
        await logoutDeviceAccount({ discardUnsynced: true })
      }
      try { await createClient().auth.signOut({ scope: "local" }) } catch {}
      window.location.assign("/auth/login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось завершить выход")
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <AuraMark className="h-12 w-12" />
        </div>
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${
            rejected ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
          }`}
        >
          {rejected ? <XCircle className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>
        <h1 className="text-xl font-semibold">
          {rejected ? "Доступ отклонён" : "Ожидание подтверждения"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          {rejected
            ? "Администратор магазина отклонил вашу заявку. Свяжитесь с ним для уточнения деталей."
            : profile?.shop_name
              ? `Ваш аккаунт (${email}) зарегистрирован в магазине «${profile.shop_name}». Администратор должен подтвердить доступ.`
              : `Ваш аккаунт (${email}) зарегистрирован. Ожидайте подтверждения администратора.`}
        </p>
        {!rejected && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {checking
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Проверяем статус…</>
              : <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span> Страница обновится автоматически</>
            }
          </div>
        )}
        <Button variant="outline" className="mt-6 w-full bg-transparent" onClick={signOut}>
          Выйти
        </Button>
      </div>
    </div>
  )
}
