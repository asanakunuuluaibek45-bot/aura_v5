"use client"

import { useMemo, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Search, Shield, Trash2, UserRound, Users } from "lucide-react"
import { toast } from "sonner"
import {
  deletePlatformUser,
  updatePlatformUser,
  type AdminUserRow,
} from "@/app/actions/superadmin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AdminShopSummary } from "@/lib/admin/shop-directory"

const ROLE_LABELS = {
  seller: "Продавец",
  admin: "Администратор магазина",
  super_admin: "Суперадминистратор",
} as const

const STATUS_LABELS = {
  pending: "Ожидает подтверждения",
  approved: "Активен",
  rejected: "Доступ отключён",
} as const

export function AdminUsersDirectory({
  users,
  shops,
  currentUserId,
}: {
  users: AdminUserRow[]
  shops: AdminShopSummary[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<AdminUserRow | null>(null)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<"seller" | "admin" | "super_admin">("seller")
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("approved")
  const [shopId, setShopId] = useState("unassigned")
  const [pending, startTransition] = useTransition()

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru")
    if (!normalized) return users
    return users.filter((user) =>
      [
        user.full_name,
        user.email,
        user.phone,
        user.shop_name,
        user.shop_id,
        user.role,
        user.status,
      ].some((value) => value?.toLocaleLowerCase("ru").includes(normalized)),
    )
  }, [query, users])

  const openEditor = (user: AdminUserRow) => {
    setEditing(user)
    setFullName(user.full_name ?? "")
    setPhone(user.phone ?? "")
    setRole(user.role ?? "seller")
    setStatus(user.status)
    setShopId(user.shop_id ?? "unassigned")
  }

  const saveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    startTransition(async () => {
      try {
        await updatePlatformUser({
          user_id: editing.user_id,
          full_name: fullName,
          phone,
          role,
          status,
          shop_id: shopId === "unassigned" ? null : shopId,
        })
        toast.success("Данные пользователя обновлены")
        setEditing(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось обновить пользователя")
      }
    })
  }

  const removeUser = (user: AdminUserRow) => {
    if (user.has_business_data || user.user_id === currentUserId) return
    const name = user.full_name?.trim() || user.email || user.user_id
    if (!window.confirm(
      `Полностью удалить аккаунт «${name}»? Вход будет невозможен, профиль и уведомления, отправленные этим аккаунтом, будут удалены без возможности восстановления.`,
    )) return

    startTransition(async () => {
      try {
        await deletePlatformUser(user.user_id)
        toast.success("Аккаунт удалён")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось удалить аккаунт")
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Пользователи</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Управление ролями, контактами, доступом и привязкой к магазину.
          </p>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filteredUsers.length} из {users.length}
        </p>
      </div>

      <label className="relative block max-w-xl">
        <span className="sr-only">Поиск пользователей</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя, email, телефон или магазин"
          className="h-11 pl-9"
        />
      </label>

      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 font-medium">
              {users.length === 0 ? "Пользователей пока нет" : "Ничего не найдено"}
            </p>
            {users.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">Измените поисковый запрос.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredUsers.map((user) => {
            const isSelf = user.user_id === currentUserId
            return (
              <Card key={user.user_id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate font-medium">{user.full_name?.trim() || "Без имени"}</h2>
                        <p className="break-all text-sm text-muted-foreground">
                          {user.email || "Email не указан"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {user.phone || "Телефон не указан"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={user.status === "approved" ? "default" : user.status === "rejected" ? "destructive" : "outline"}>
                      {STATUS_LABELS[user.status]}
                    </Badge>
                  </div>

                  <div className="grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                    <p className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {user.role ? ROLE_LABELS[user.role] : "Роль не назначена"}
                    </p>
                    <p className="truncate text-muted-foreground">
                      Магазин: {user.shop_name?.trim() || "Не привязан"}
                    </p>
                  </div>

                  {user.has_business_data && (
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      Есть товары или финансовая история. Полное удаление заблокировано, чтобы сохранить записи; доступ можно отключить в настройках.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button variant="outline" onClick={() => openEditor(user)} disabled={pending}>
                      Изменить данные
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => removeUser(user)}
                      disabled={pending || user.has_business_data || isSelf}
                      title={
                        isSelf
                          ? "Нельзя удалить собственный аккаунт"
                          : user.has_business_data
                            ? "Удаление заблокировано для сохранения истории"
                            : undefined
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Полностью удалить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90svh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Изменить пользователя</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveUser} className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="admin-user-name">Имя</Label>
                <Input
                  id="admin-user-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={120}
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-user-phone">Телефон</Label>
                <Input
                  id="admin-user-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={40}
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-user-role">Роль</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as typeof role)}
                  disabled={pending || editing.user_id === currentUserId}
                >
                  <SelectTrigger id="admin-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing.user_id === currentUserId && (
                  <p className="text-xs text-muted-foreground">Собственную роль менять нельзя.</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-user-status">Статус доступа</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as typeof status)}
                  disabled={pending || editing.user_id === currentUserId}
                >
                  <SelectTrigger id="admin-user-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-user-shop">Магазин</Label>
                <Select
                  value={shopId}
                  onValueChange={setShopId}
                  disabled={pending || editing.user_id === currentUserId || editing.has_business_data}
                >
                  <SelectTrigger id="admin-user-shop"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Не привязан</SelectItem>
                    {shops.map((shop) => (
                      <SelectItem key={shop.shop_id} value={shop.shop_id}>
                        {shop.shop_name?.trim() || shop.shop_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing.user_id === currentUserId && (
                  <p className="text-xs text-muted-foreground">Собственный магазин менять нельзя.</p>
                )}
                {editing.has_business_data && (
                  <p className="text-xs text-muted-foreground">
                    Перенос заблокирован, чтобы сохранить историю в исходном магазине.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                  Отмена
                </Button>
                <Button type="submit" disabled={pending}>
                  Сохранить
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
