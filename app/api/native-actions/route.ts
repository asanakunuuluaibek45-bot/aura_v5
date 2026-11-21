import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireApprovedContext } from "@/lib/supabase/request-context"
import { isNativeAction } from "@/lib/native-action-contract.mjs"
import * as adminAnnouncements from "@/app/actions/admin-announcements"
import * as history from "@/app/actions/action-history"
import * as article from "@/app/actions/article"
import * as cabinet from "@/app/actions/cabinet"
import * as cash from "@/app/actions/cash"
import * as clients from "@/app/actions/clients"
import * as labels from "@/app/actions/labels"
import * as notifications from "@/app/actions/notifications"
import * as products from "@/app/actions/products"
import * as productUnits from "@/app/actions/product-units"
import * as qr from "@/app/actions/qr"
import * as rates from "@/app/actions/rates"
import * as returns from "@/app/actions/returns"
import * as sales from "@/app/actions/sales"
import * as shops from "@/app/actions/shops"
import * as store from "@/app/actions/store"
import * as superadmin from "@/app/actions/superadmin"
import * as suppliers from "@/app/actions/suppliers"
import * as team from "@/app/actions/team"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const modules = {
  "action-history": history, "admin-announcements": adminAnnouncements, article, cabinet, cash, clients, labels,
  notifications, products, "product-units": productUnits, qr, rates,
  returns, sales, shops, store, superadmin, suppliers, team,
}

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export function GET() {
  return reply({ contract: "aura-native-actions-v1" })
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? ""
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Требуется вход в систему" }, 401)
  const token = authorization.slice(7)
  if (!token || token.length > 16384) return reply({ error: "Некорректная сессия" }, 401)
  if (Number(request.headers.get("content-length") || 0) > 1024 * 1024) {
    return reply({ error: "Слишком большой запрос" }, 413)
  }

  let body: { module?: unknown; action?: unknown; args?: unknown }
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).length > 1024 * 1024) {
      return reply({ error: "Слишком большой запрос" }, 413)
    }
    body = JSON.parse(text)
    if (!body || !isNativeAction(body.module, body.action) || !Array.isArray(body.args) || body.args.length > 10) {
      return reply({ error: "Неизвестное действие" }, 400)
    }
  } catch {
    return reply({ error: "Некорректный запрос" }, 400)
  }

  // Never trust a user/shop id supplied by the app. Verify the bearer token,
  // then populate only this request's cookie context for the ORIGINAL actions.
  // Each action retains its existing role checks, shop scope and Supabase RLS.
  const supabase = await createClient()
  const verified = await supabase.auth.getUser(token)
  if (verified.error || !verified.data.user) return reply({ error: "Сессия истекла" }, 401)
  const session = await supabase.auth.setSession({
    access_token: token,
    refresh_token: "native-request-no-refresh",
  })
  if (session.error) return reply({ error: "Сессия истекла" }, 401)
  try {
    await requireApprovedContext()
  } catch {
    return reply({ error: "Аккаунт не подтверждён" }, 403)
  }
  const actions = modules[body.module as keyof typeof modules] as unknown as Record<
    string, (...args: unknown[]) => Promise<unknown>
  >
  try {
    const value = await actions[body.action as string](...body.args as unknown[])
    return reply({ value: value ?? null })
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Ошибка выполнения действия" }, 400)
  }
}
