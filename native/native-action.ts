import { AuraNative } from "@/lib/native-session"
import { createClient } from "@/lib/supabase/client"
import { isNativeAction } from "@/lib/native-action-contract.mjs"
import { Capacitor, CapacitorHttp } from "@capacitor/core"

export function nativeAction<T extends (...args: any[]) => Promise<any>>(
  module: string,
  action: string,
): T {
  return (async (...args: Parameters<T>) => {
    if (!isNativeAction(module, action)) throw new Error("Неизвестное действие")
    if (!navigator.onLine) throw new Error("Этот раздел доступен только онлайн")
    const { data, error } = await createClient().auth.getSession()
    if (error || !data.session) throw new Error("Для онлайн-раздела требуется вход в систему")
    // URLSession is restricted to the configured HTTPS backend and does not
    // expose that remote page to Capacitor or rely on cross-origin cookies.
    let response: { value: unknown }
    if (Capacitor.getPlatform() === "ios") {
      response = await AuraNative.action({
        module, action, args, accessToken: data.session.access_token,
      })
    } else {
      // Keep an Android Capacitor build functional as well; Android PWA itself
      // continues to use the unchanged standard Next server-action transport.
      const endpoint = new URL("/api/native-actions", process.env.NEXT_PUBLIC_NATIVE_API_ORIGIN || "https://www.golduchet.com")
      if (endpoint.protocol !== "https:") throw new Error("Для сервера приложения требуется HTTPS")
      const result = await CapacitorHttp.post({
        url: endpoint.href,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        data: { module, action, args },
        connectTimeout: 15000, readTimeout: 45000,
        disableRedirects: true,
      })
      if (result.status < 200 || result.status >= 300) {
        throw new Error(result.data?.error || "Не удалось выполнить онлайн-запрос")
      }
      response = result.data
    }
    if (!/^(get|find|check|is|touch|generate)/.test(action)) {
      window.dispatchEvent(new CustomEvent("aura:native_action_complete", {
        detail: { module, action },
      }))
      const { syncEngine } = await import("@/lib/sync/sync-engine")
      void syncEngine.triggerSync()
    }
    return response.value
  }) as T
}
