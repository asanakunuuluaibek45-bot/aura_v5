"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, Megaphone } from "lucide-react"
import { toast } from "sonner"
import { archivePlatformAnnouncement, publishPlatformAnnouncement } from "@/app/actions/admin-announcements"
import type { PlatformAnnouncement } from "@/lib/admin/announcement-policy"
import type { AdminShopSummary } from "@/lib/admin/shop-directory"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function formatDate(value: string | null): string {
  if (!value) return "Без срока"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date)
}

export function AdminAnnouncementsManager({
  initialAnnouncements,
  shops,
}: {
  initialAnnouncements: PlatformAnnouncement[]
  shops: AdminShopSummary[]
}) {
  const router = useRouter()
  const [announcements, setAnnouncements] = useState(initialAnnouncements)
  const [scope, setScope] = useState<"all" | "shop">("all")
  const [shopId, setShopId] = useState("")
  const [body, setBody] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setAnnouncements(initialAnnouncements)
  }, [initialAnnouncements])

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await publishPlatformAnnouncement({
          body,
          scope_type: scope,
          shop_id: scope === "shop" ? shopId : null,
          expires_on: expiresOn || null,
        })
        setBody("")
        setExpiresOn("")
        toast.success("Объявление опубликовано")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось опубликовать объявление")
      }
    })
  }

  const archive = (announcement: PlatformAnnouncement) => {
    if (announcement.archived_at) return
    if (!window.confirm("Архивировать объявление? История останется в журнале.")) return

    startTransition(async () => {
      try {
        await archivePlatformAnnouncement(announcement.id)
        setAnnouncements((current) =>
          current.map((item) =>
            item.id === announcement.id ? { ...item, archived_at: new Date().toISOString() } : item,
          ),
        )
        toast.success("Объявление архивировано")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось архивировать объявление")
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Платформа</p>
        <h1 className="font-serif text-3xl tracking-tight">Объявления</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Одна публикация хранится один раз и показывается выбранной аудитории. Прочтения не создают
          записи на каждое объявление или обновление страницы.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Новое объявление</CardTitle>
          <CardDescription>Публикация доступна всем магазинам или одному выбранному магазину.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Аудитория</span>
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as "all" | "shop")}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="all">Все магазины</option>
                  <option value="shop">Один магазин</option>
                </select>
              </label>
              {scope === "shop" && (
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Магазин</span>
                  <select
                    required
                    value={shopId}
                    onChange={(event) => setShopId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Выберите магазин</option>
                    {shops.map((shop) => (
                      <option key={shop.shop_id} value={shop.shop_id}>
                        {shop.shop_name?.trim() || shop.shop_id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Текст</span>
              <textarea
                required
                maxLength={5000}
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Напишите объявление для выбранной аудитории"
              />
              <span className="block text-right text-xs text-muted-foreground">{body.length}/5000</span>
            </label>

            <label className="block max-w-xs space-y-1.5 text-sm">
              <span className="font-medium">Публиковать до (необязательно)</span>
              <Input
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
            </label>

            <Button type="submit" disabled={pending || !body.trim() || (scope === "shop" && !shopId)}>
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Опубликовать
            </Button>
          </form>
        </CardContent>
      </Card>

      <section aria-label="История объявлений" className="space-y-3">
        <h2 className="font-serif text-xl">История</h2>
        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Объявлений пока нет.
            </CardContent>
          </Card>
        ) : (
          announcements.map((announcement) => {
            const shop = shops.find((row) => row.shop_id === announcement.shop_id)
            return (
              <Card key={announcement.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={announcement.archived_at ? "outline" : "default"}>
                      {announcement.archived_at ? "Архив" : "Опубликовано"}
                    </Badge>
                    <Badge variant="secondary">
                      {announcement.scope_type === "all"
                        ? "Все магазины"
                        : shop?.shop_name?.trim() || "Выбранный магазин"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(announcement.published_at)}
                      {announcement.expires_at ? ` · до ${formatDate(announcement.expires_at)}` : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{announcement.body}</p>
                  {!announcement.archived_at && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => archive(announcement)}
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                      Архивировать
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}
