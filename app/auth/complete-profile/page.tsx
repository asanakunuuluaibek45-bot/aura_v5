"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InlineLoader } from "@/components/ui/page-loader"
import { createClient } from "@/lib/supabase/client"

export default function CompleteGoogleProfilePage() {
  const [fullName, setFullName] = useState("")
  const [shopName, setShopName] = useState("")
  const [phone, setPhone] = useState("")
  const [requestedRole, setRequestedRole] = useState("seller")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let active = true
    createClient().auth.getUser().then(({ data, error: authError }) => {
      if (!active) return
      if (authError || !data.user) {
        window.location.replace("/auth/login")
        return
      }
      const userName = data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? ""
      setFullName(typeof userName === "string" ? userName : "")
      setIsLoading(false)
    }).catch(() => {
      if (active) window.location.replace("/auth/login")
    })
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      const { error: rpcError } = await createClient().rpc("complete_google_registration", {
        _full_name: fullName,
        _shop_name: shopName,
        _phone: phone || null,
        _requested_role: requestedRole,
      })
      if (rpcError) throw rpcError
      setSubmitted(true)
    } catch (submitError) {
      console.error("Google registration completion error:", submitError)
      setError("Не удалось завершить регистрацию. Проверьте данные и попробуйте ещё раз.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <AuthShell title="Загрузка" subtitle="Проверяем ваш аккаунт">
        <div className="flex justify-center py-4"><InlineLoader /></div>
      </AuthShell>
    )
  }

  if (submitted) {
    return (
      <AuthShell title="Заявка отправлена" subtitle="Google-аккаунт подключён.">
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Доступ к GOLDUCHET активирует администратор магазина после проверки заявки.
          </p>
          <Button asChild className="w-full">
            <Link href="/">Вернуться на главную</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Завершите регистрацию" subtitle="Укажите данные магазина для запроса доступа к GOLDUCHET.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="googleFullName">Ваше имя</Label>
          <Input
            id="googleFullName"
            required
            maxLength={160}
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="googleShopName">Название магазина</Label>
          <Input
            id="googleShopName"
            required
            maxLength={200}
            placeholder="Например: GOLDUCHET Бишкек"
            value={shopName}
            onChange={(event) => setShopName(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="googlePhone">Телефон</Label>
            <Input
              id="googlePhone"
              type="tel"
              maxLength={50}
              placeholder="+996"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="googleRole">Роль</Label>
            <Select value={requestedRole} onValueChange={(value) => setRequestedRole(value ?? "seller")}>
              <SelectTrigger id="googleRole"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">Продавец</SelectItem>
                <SelectItem value="admin">Администратор</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSaving}>
          {isSaving ? <span className="flex items-center gap-2"><InlineLoader /> Сохранение...</span> : "Отправить заявку"}
        </Button>
      </form>
    </AuthShell>
  )
}
