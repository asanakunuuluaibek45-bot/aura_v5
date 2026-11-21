"use client"

import type { Profile } from "@/lib/types"
import { Button } from "@/components/shared/ui/button"
import { AuraMark } from "@/components/shared/brand/aura-mark"
import { logoutDeviceAccount } from "@/lib/local-db/device-logout"
import { UnsyncedLogoutError } from "@/lib/offline-policy"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Clock, XCircle } from "lucide-react"
import { AccountDeletionControl } from "@/components/crm/account-deletion-control"

export function PendingScreen({ profile, email }: { profile: Profile | null; email: string }) {
  const router = useRouter()
  const rejected = profile?.status === "rejected"

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
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
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
            : `Ваш аккаунт (${email}) зарегистрирован в магазине «${profile?.shop_name ?? ""}». Администратор должен подтвердить доступ.`}
        </p>
        <div className="mt-6">
          <AccountDeletionControl profile={profile} />
        </div>
        <Button variant="outline" className="mt-6 w-full bg-transparent" onClick={signOut}>
          Выйти
        </Button>
      </div>
    </div>
  )
}
