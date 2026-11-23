"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Profile } from "@/lib/types"
import { updateAdminShopProfile } from "@/app/actions/cabinet"
import { useOnline } from "@/hooks/use-online"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import { Label } from "@/components/shared/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card"

export function AdminShopProfileForm({ profile, shopAddress }: { profile: Profile; shopAddress: string }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "")
  const [phone, setPhone] = useState(profile.phone ?? "")
  const [address, setAddress] = useState(shopAddress)
  const [pending, startTransition] = useTransition()
  const online = useOnline()
  const router = useRouter()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await updateAdminShopProfile({ fullName, phone, shopAddress: address })
        toast.success("Данные магазина сохранены")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить данные")
      }
    })
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Контакты и адрес магазина</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="adminFullName">Ваше имя</Label>
            <Input id="adminFullName" required maxLength={160} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adminPhone">Ваш телефон</Label>
            <Input id="adminPhone" type="tel" maxLength={50} autoComplete="tel" placeholder="+996" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="adminShopAddress">Адрес активного магазина</Label>
            <Input id="adminShopAddress" required maxLength={240} autoComplete="street-address" placeholder="Например: Каракол, Бугу базар, 23-й бутик" value={address} onChange={(event) => setAddress(event.target.value)} />
            <p className="text-xs text-muted-foreground">Адрес относится к выбранному сейчас магазину.</p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending || !online}>
              {pending ? "Сохраняем…" : "Сохранить данные"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
