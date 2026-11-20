// ---------------------------------------------------------------------------
// QR-код: URL и data-URL
// ---------------------------------------------------------------------------
import QRCode from "qrcode"
import { toast } from "sonner"
import type { Product } from "@/lib/types"
import { buildShopLabelQrPayload } from "@/lib/label-qr-payload"

export function buildQrUrl(data: Product): string {
  return buildShopLabelQrPayload(data.shop_seq_id, data.sku || "")
}

export async function safeQrDataUrl(data: Product): Promise<string | null> {
  try {
    return await QRCode.toDataURL(buildQrUrl(data), {
      margin: 2,
      scale: 12,
      errorCorrectionLevel: "M",
    })
  } catch (e) {
    console.error("[label] QR build error:", e)
    toast.error(e instanceof Error ? e.message : "Не удалось сформировать QR-код")
    return null
  }
}
