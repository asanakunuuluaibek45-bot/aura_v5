"use server"

import { getRequestCrmContext, requireApprovedContext } from "@/lib/supabase/request-context"
import type { ActionResult, StoreNotification, ManagedStoreNotification, StoreNotificationRecipient } from "@/lib/types"

export async function getStoreNotifications(limit = 50): Promise<ActionResult<StoreNotification[]>> {
  try {
    const { supabase } = await requireApprovedContext()
    const { data, error } = await supabase.rpc("store_notification_list", { _limit: limit })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as StoreNotification[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function getStoreNotificationUnreadCount(): Promise<ActionResult<number>> {
  try {
    const { supabase } = await requireApprovedContext()
    const { data, error } = await supabase.rpc("store_notification_unread_count")
    if (error) return { success: false, error: error.message }
    return { success: true, data: Number(data ?? 0) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function markStoreNotificationRead(notificationId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireApprovedContext()
    const { error } = await supabase.rpc("store_notification_mark_read", {
      _notification_id: notificationId,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function markAllStoreNotificationsRead(): Promise<ActionResult> {
  try {
    const { supabase } = await requireApprovedContext()
    const { error } = await supabase.rpc("store_notification_mark_all_read")
    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function getStoreNotificationRecipients(
  shopId: string,
): Promise<ActionResult<StoreNotificationRecipient[]>> {
  try {
    const { supabase, profile } = await getRequestCrmContext()
    if (!profile || profile.status !== "approved" || profile.role !== "super_admin") {
      return { success: false, error: "Доступ запрещён: требуется роль суперадмина" }
    }
    const { data, error } = await supabase.rpc("superadmin_store_notification_recipients", {
      _shop_id: shopId,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as StoreNotificationRecipient[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function getManagedStoreNotifications(
  limit = 100,
): Promise<ActionResult<ManagedStoreNotification[]>> {
  try {
    const { supabase, profile } = await getRequestCrmContext()
    if (!profile || profile.status !== "approved" || profile.role !== "super_admin") {
      return { success: false, error: "Доступ запрещён: требуется роль суперадмина" }
    }
    const { data, error } = await supabase.rpc("superadmin_store_notification_list", {
      _limit: limit,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as ManagedStoreNotification[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function createStoreNotification(
  shopId: string,
  recipientProfileId: string | null,
  title: string,
  message: string,
): Promise<ActionResult<string>> {
  try {
    const { supabase, profile } = await getRequestCrmContext()
    if (!profile || profile.status !== "approved" || profile.role !== "super_admin") {
      return { success: false, error: "Доступ запрещён: отправлять уведомления может только суперадмин" }
    }
    const { data, error } = await supabase.rpc("superadmin_store_notification_create", {
      _shop_id: shopId,
      _recipient_profile_id: recipientProfileId,
      _title: title,
      _message: message,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, data: String(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}

export async function deleteStoreNotification(notificationId: string): Promise<ActionResult> {
  try {
    const { supabase, profile } = await getRequestCrmContext()
    if (!profile || profile.status !== "approved" || profile.role !== "super_admin") {
      return { success: false, error: "Доступ запрещён: удалять уведомления может только суперадмин" }
    }
    const { error } = await supabase.rpc("superadmin_store_notification_delete", {
      _notification_id: notificationId,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка сервера" }
  }
}
