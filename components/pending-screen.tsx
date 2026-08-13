"use client"

import type { Profile } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { AuraMark } from "@/components/brand/aura-mark"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Clock, XCircle } from "lucide-react"

export function PendingScreen({ profile, email }: { profile: Profile | null; email: string }) {
  const router = useRouter()
  const rejected = profile?.status === "rejected"

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
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
        <Button variant="outline" className="mt-6 w-full bg-transparent" onClick={signOut}>
          Выйти
        </Button>
      </div>
    </div>
  )
}
