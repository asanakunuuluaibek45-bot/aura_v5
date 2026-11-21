"use client"

import { useEffect, useState } from "react"
import { getUserAnnouncementFeed, markAnnouncementFeedViewed } from "@/app/actions/admin-announcements"
import type { UserAnnouncement } from "@/lib/admin/announcement-policy"
import { Card, CardContent } from "@/components/shared/ui/card"
import { Badge } from "@/components/shared/ui/badge"
import { Megaphone } from "lucide-react"

type FeedState = {
  announcements: UserAnnouncement[]
  lastViewedAt: string | null
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date)
}

export function UserAnnouncementsPanel() {
  const [feed, setFeed] = useState<FeedState>({ announcements: [], lastViewedAt: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadFeed = async () => {
      try {
        const result = await getUserAnnouncementFeed()
        if (!active) return
        setFeed(result)
        await markAnnouncementFeedViewed()
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить объявления")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadFeed()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground" role="status">Загружаем объявления…</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Для вашего магазина</p>
        <h2 className="mt-2 text-lg font-semibold">Общие уведомления</h2>
      </header>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive" role="alert">{error}</CardContent>
        </Card>
      ) : feed.announcements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 font-medium">Новых объявлений нет</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feed.announcements.map((announcement) => {
            const isNew =
              !feed.lastViewedAt
              || Date.parse(announcement.published_at) > Date.parse(feed.lastViewedAt)
            return (
              <Card key={announcement.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {isNew && <Badge>Новое</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(announcement.published_at)}
                    </span>
                    {announcement.expires_at && (
                      <span className="text-xs text-muted-foreground">
                        · Действует до {formatDate(announcement.expires_at)}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{announcement.body}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
