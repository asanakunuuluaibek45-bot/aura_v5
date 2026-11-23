"use server"

import { revalidatePath } from "next/cache"
import { getRequestCrmContext } from "@/lib/supabase/request-context"

export type BranchTransferStatus =
  | "in_transit"
  | "partially_received"
  | "partially_cancelled"
  | "received"
  | "cancelled"

export type BranchTransferItemStatus = "in_transit" | "received" | "cancelled"

export type BranchTransferSummary = {
  id: string
  sourceShopId: string
  sourceShopName: string | null
  destinationShopId: string
  destinationShopName: string | null
  status: BranchTransferStatus
  createdAt: string
  itemCount: number
  inTransitCount: number
  receivedCount: number
  cancelledCount: number
}

export type BranchTransferItem = {
  productId: string
  sku: string | null
  productName: string
  status: BranchTransferItemStatus
  qrShopId: string
  qrShopSeqId: number | null
  receivedAt: string | null
  cancelledAt: string | null
}

export type BranchTransferDetails = {
  id: string
  sourceShopId: string
  sourceShopName: string | null
  destinationShopId: string
  destinationShopName: string | null
  status: BranchTransferStatus
  createdAt: string
  items: BranchTransferItem[]
}

export type TransferScanResult =
  | { kind: "found"; product: { id: string; sku: string; name: string; status: "source_stock" | "in_transit" } }
  | { kind: "not_found" }
  | { kind: "ambiguous" }

type RecordValue = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SKU_PATTERN = /^[A-Z]{2}\d{1,8}$/
const TRANSFER_STATUSES = new Set<BranchTransferStatus>([
  "in_transit",
  "partially_received",
  "partially_cancelled",
  "received",
  "cancelled",
])
const ITEM_STATUSES = new Set<BranchTransferItemStatus>(["in_transit", "received", "cancelled"])

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function isTransferStatus(value: unknown): value is BranchTransferStatus {
  return typeof value === "string" && TRANSFER_STATUSES.has(value as BranchTransferStatus)
}

function isItemStatus(value: unknown): value is BranchTransferItemStatus {
  return typeof value === "string" && ITEM_STATUSES.has(value as BranchTransferItemStatus)
}

function databaseErrorMessage(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "База данных перемещений ещё не обновлена. Обратитесь к администратору."
  }
  if (error.message.includes("Нет доступа")) return error.message
  if (error.message.includes("ключ запроса")) return "Запрос уже использован с другими данными."
  if (error.message.includes("причину")) return error.message
  return fallback
}

async function requireTransferContext() {
  const context = await getRequestCrmContext()
  if (!context.user) throw new Error("Требуется вход в систему")
  if (!context.profile || context.profile.status !== "approved") {
    throw new Error("Аккаунт не подтверждён")
  }
  const { branchContext } = context
  if (!branchContext.businessId || !branchContext.activeShopId) {
    throw new Error("Не удалось подтвердить активный филиал")
  }
  return { ...context, branchContext }
}

function parseTransferSummaryRows(
  rawTransfers: unknown,
  rawItems: unknown,
  activeShopId: string,
  branchNames: Map<string, string | null>,
): BranchTransferSummary[] {
  if (!Array.isArray(rawTransfers)) return []
  const counts = new Map<string, { itemCount: number; inTransitCount: number; receivedCount: number; cancelledCount: number }>()
  if (Array.isArray(rawItems)) {
    for (const rawItem of rawItems) {
      const item = asRecord(rawItem)
      const transferId = asString(item?.transfer_id)
      const status = item?.status
      if (!transferId || !isItemStatus(status)) continue
      const count = counts.get(transferId) ?? {
        itemCount: 0,
        inTransitCount: 0,
        receivedCount: 0,
        cancelledCount: 0,
      }
      count.itemCount += 1
      if (status === "in_transit") count.inTransitCount += 1
      if (status === "received") count.receivedCount += 1
      if (status === "cancelled") count.cancelledCount += 1
      counts.set(transferId, count)
    }
  }

  const result: BranchTransferSummary[] = []
  for (const rawTransfer of rawTransfers) {
    const row = asRecord(rawTransfer)
    const id = asString(row?.id)
    const sourceShopId = asString(row?.source_shop_id)
    const destinationShopId = asString(row?.destination_shop_id)
    const createdAt = asString(row?.created_at)
    if (
      !id ||
      !sourceShopId ||
      !destinationShopId ||
      !createdAt ||
      !isTransferStatus(row?.status) ||
      (sourceShopId !== activeShopId && destinationShopId !== activeShopId)
    ) continue
    const itemCounts = counts.get(id) ?? {
      itemCount: 0,
      inTransitCount: 0,
      receivedCount: 0,
      cancelledCount: 0,
    }
    result.push({
      id,
      sourceShopId,
      sourceShopName: branchNames.get(sourceShopId) ?? null,
      destinationShopId,
      destinationShopName: branchNames.get(destinationShopId) ?? null,
      status: row.status,
      createdAt,
      ...itemCounts,
    })
  }
  return result
}

function parseTransferDetails(value: unknown): BranchTransferDetails | null {
  const row = asRecord(value)
  const id = asString(row?.transfer_id)
  const sourceShopId = asString(row?.source_shop_id)
  const destinationShopId = asString(row?.destination_shop_id)
  const createdAt = asString(row?.created_at)
  if (
    !id ||
    !sourceShopId ||
    !destinationShopId ||
    !createdAt ||
    !isTransferStatus(row?.status) ||
    !Array.isArray(row?.items)
  ) return null

  const items: BranchTransferItem[] = []
  for (const rawItem of row.items) {
    const item = asRecord(rawItem)
    const productId = asString(item?.product_id)
    const productName = asString(item?.product_name)
    const status = item?.status
    const qrShopId = asString(item?.qr_shop_id)
    if (!productId || !productName || !qrShopId || !isItemStatus(status)) continue
    const qrShopSeqId = item?.qr_shop_seq_id
    items.push({
      productId,
      sku: asNullableString(item?.sku),
      productName,
      status,
      qrShopId,
      qrShopSeqId:
        typeof qrShopSeqId === "number" && Number.isSafeInteger(qrShopSeqId) && qrShopSeqId > 0
          ? qrShopSeqId
          : null,
      receivedAt: asNullableString(item?.received_at),
      cancelledAt: asNullableString(item?.cancelled_at),
    })
  }
  return {
    id,
    sourceShopId,
    sourceShopName: asNullableString(row?.source_shop_name),
    destinationShopId,
    destinationShopName: asNullableString(row?.destination_shop_name),
    status: row.status,
    createdAt,
    items,
  }
}

export async function getBranchTransfers(): Promise<BranchTransferSummary[]> {
  const { supabase, branchContext } = await requireTransferContext()
  const activeShopId = branchContext.activeShopId
  if (!activeShopId) return []
  const { data: transferData, error: transferError } = await supabase
    .from("branch_transfers")
    .select("id, source_shop_id, destination_shop_id, status, created_at")
    .or(`source_shop_id.eq.${activeShopId},destination_shop_id.eq.${activeShopId}`)
    .order("created_at", { ascending: false })
    .limit(50)
  if (transferError) {
    throw new Error(databaseErrorMessage(transferError, "Не удалось загрузить перемещения"))
  }
  const transferRows: unknown = transferData
  if (!Array.isArray(transferRows) || transferRows.length === 0) return []

  const transferIds = transferRows
    .map((value) => asString(asRecord(value)?.id))
    .filter((value): value is string => Boolean(value && UUID_PATTERN.test(value)))
  if (transferIds.length === 0) return []

  const itemRows: unknown[] = []
  const itemPageSize = 1000
  const maximumItems = 50 * 500
  for (let offset = 0; offset < maximumItems; offset += itemPageSize) {
    const { data, error } = await supabase
      .from("branch_transfer_items")
      .select("transfer_id, status")
      .in("transfer_id", transferIds)
      .range(offset, offset + itemPageSize - 1)
    if (error) {
      throw new Error(databaseErrorMessage(error, "Не удалось загрузить позиции перемещений"))
    }
    const page: unknown = data
    if (!Array.isArray(page)) break
    itemRows.push(...page)
    if (page.length < itemPageSize) break
  }

  const branchNames = new Map(
    branchContext.branches
      .filter((branch) => branch.businessId === branchContext.businessId)
      .map((branch) => [branch.shopId, branch.shopName]),
  )
  return parseTransferSummaryRows(transferRows, itemRows, activeShopId, branchNames)
}

export async function getBranchTransferDetails(transferId: string): Promise<BranchTransferDetails> {
  if (!UUID_PATTERN.test(transferId)) throw new Error("Некорректное перемещение")
  const { supabase } = await requireTransferContext()
  const { data, error } = await supabase.rpc("get_branch_transfer_details", {
    _transfer_id: transferId,
  })
  if (error) {
    throw new Error(databaseErrorMessage(error, "Не удалось загрузить состав перемещения"))
  }
  const details = parseTransferDetails(data as unknown)
  if (!details) throw new Error("Не удалось проверить состав перемещения")
  return details
}

export async function resolveBranchTransferScan(
  sku: string,
  qrShopSeqId: number | null,
  transferId: string | null,
): Promise<TransferScanResult> {
  const normalizedSku = typeof sku === "string" ? sku.trim().toUpperCase() : ""
  if (!SKU_PATTERN.test(normalizedSku)) return { kind: "not_found" }
  if (
    qrShopSeqId !== null &&
    (!Number.isSafeInteger(qrShopSeqId) || qrShopSeqId <= 0 || qrShopSeqId > 2_147_483_647)
  ) return { kind: "not_found" }
  if (transferId !== null && !UUID_PATTERN.test(transferId)) {
    throw new Error("Некорректное перемещение")
  }
  const { supabase } = await requireTransferContext()
  const { data, error } = await supabase.rpc("resolve_branch_transfer_scan", {
    _sku: normalizedSku,
    _qr_shop_seq_id: qrShopSeqId,
    _transfer_id: transferId,
  })
  if (error) {
    throw new Error(databaseErrorMessage(error, "Не удалось проверить QR-код"))
  }
  if (!Array.isArray(data) || data.length === 0) return { kind: "not_found" }
  if (data.length !== 1) return { kind: "ambiguous" }
  const row = asRecord(data[0])
  const id = asString(row?.product_id)
  const foundSku = asString(row?.sku)
  const name = asString(row?.product_name)
  const status = row?.item_status
  if (!id || !foundSku || !name || (status !== "source_stock" && status !== "in_transit")) {
    return { kind: "not_found" }
  }
  return { kind: "found", product: { id, sku: foundSku, name, status } }
}

export async function startBranchTransfer(
  destinationShopId: string,
  productIds: string[],
  clientRequestId: string,
): Promise<string> {
  if (!UUID_PATTERN.test(destinationShopId) || !UUID_PATTERN.test(clientRequestId)) {
    throw new Error("Некорректные параметры отправки")
  }
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > 500) {
    throw new Error("Отсканируйте от 1 до 500 товаров")
  }
  if (productIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw new Error("Некорректный список товаров")
  }
  if (new Set(productIds).size !== productIds.length) {
    throw new Error("Один и тот же товар нельзя добавить дважды")
  }

  const { supabase, branchContext } = await requireTransferContext()
  const destination = branchContext.branches.find(
    (branch) => branch.shopId === destinationShopId && branch.businessId === branchContext.businessId,
  )
  if (!destination || destinationShopId === branchContext.activeShopId) {
    throw new Error("Выберите другой доступный филиал")
  }
  const { data, error } = await supabase.rpc("begin_branch_transfer", {
    _client_request_id: clientRequestId,
    _destination_shop_id: destinationShopId,
    _product_ids: productIds,
  })
  if (error || typeof data !== "string" || !UUID_PATTERN.test(data)) {
    throw new Error(error
      ? databaseErrorMessage(error, "Не удалось отправить товары")
      : "Не удалось подтвердить отправку")
  }
  revalidateTransferViews()
  return data
}

export async function receiveBranchTransferItems(
  transferId: string,
  productIds: string[],
  clientRequestId: string,
  reason: string,
): Promise<string> {
  validateTransferOperation(transferId, productIds, clientRequestId)
  const cleanReason = typeof reason === "string" ? reason.trim() : ""
  if (cleanReason.length > 500) throw new Error("Причина не должна превышать 500 символов")
  const { supabase } = await requireTransferContext()
  const { data, error } = await supabase.rpc("receive_branch_transfer_items", {
    _transfer_id: transferId,
    _product_ids: productIds,
    _client_request_id: clientRequestId,
    _reason: cleanReason || null,
  })
  if (error || typeof data !== "string" || !UUID_PATTERN.test(data)) {
    throw new Error(error
      ? databaseErrorMessage(error, "Не удалось принять товары")
      : "Не удалось подтвердить приёмку")
  }
  revalidateTransferViews()
  return data
}

export async function cancelBranchTransferItems(
  transferId: string,
  productIds: string[],
  clientRequestId: string,
  reason: string,
): Promise<string> {
  validateTransferOperation(transferId, productIds, clientRequestId)
  const cleanReason = typeof reason === "string" ? reason.trim() : ""
  if (!cleanReason || cleanReason.length > 500) {
    throw new Error("Укажите причину отмены длиной до 500 символов")
  }
  const { supabase } = await requireTransferContext()
  const { data, error } = await supabase.rpc("cancel_branch_transfer", {
    _transfer_id: transferId,
    _returned_product_ids: productIds,
    _client_request_id: clientRequestId,
    _reason: cleanReason,
  })
  if (error || typeof data !== "string" || !UUID_PATTERN.test(data)) {
    throw new Error(error
      ? databaseErrorMessage(error, "Не удалось отменить позиции перемещения")
      : "Не удалось подтвердить отмену")
  }
  revalidateTransferViews()
  return data
}

function validateTransferOperation(
  transferId: string,
  productIds: string[],
  clientRequestId: string,
): void {
  if (!UUID_PATTERN.test(transferId) || !UUID_PATTERN.test(clientRequestId)) {
    throw new Error("Некорректные параметры перемещения")
  }
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > 500) {
    throw new Error("Отсканируйте товары для операции")
  }
  if (productIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw new Error("Некорректный список товаров")
  }
  if (new Set(productIds).size !== productIds.length) {
    throw new Error("Один и тот же товар нельзя обработать дважды")
  }
}

function revalidateTransferViews(): void {
  revalidatePath("/crm/inventory")
  revalidatePath("/crm/pos")
  revalidatePath("/crm/reports")
}
