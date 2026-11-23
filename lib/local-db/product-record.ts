import { requireStockConnection } from '../offline-policy'
import type { Product, Profile } from '../types'
import { createLocalId } from './id'
import { getLocalDB } from './db'
import type { OutboxItem } from './schema'

// Same editable fields as the existing server action. Never restore stock,
// ownership, article allocation or consignment metadata from a stale form.
export const PRODUCT_EDIT_FIELDS = [
  'name', 'category', 'metal', 'metal_color', 'weight', 'size',
  'purchase_price', 'purchase_price_visible', 'price_per_gram_sale',
  'price_per_gram_purchase', 'price_per_gram_purchase_visible', 'stones',
  'description', 'sale_price', 'image_url', 'images', 'supplier_name',
  'supplier_phone', 'is_hidden',
] as const

export function editableProductPatch(input: Partial<Product>): Partial<Product> {
  return Object.fromEntries(PRODUCT_EDIT_FIELDS.filter((key) => input[key] !== undefined)
    .map((key) => [key, key === 'name' ? String(input[key]).trim() : input[key]]))
}

export function validateOfflineProduct(input: Partial<Product>, current?: Product): void {
  if (!String(input.name ?? current?.name ?? '').trim()) throw new Error('Укажите название изделия')
  for (const key of ['weight', 'sale_price', 'purchase_price', 'purchase_price_visible',
    'price_per_gram_sale', 'price_per_gram_purchase', 'price_per_gram_purchase_visible'] as const) {
    const value = input[key]
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new Error('Вес и цены должны быть конечными неотрицательными числами')
    }
  }
  if (current?.consignment_operation_id && (
    (input.purchase_price !== undefined && Number(input.purchase_price) !== Number(current.purchase_price)) ||
    (input.supplier_name !== undefined && (input.supplier_name ?? null) !== (current.supplier_name ?? null)) ||
    (input.supplier_phone !== undefined && (input.supplier_phone ?? null) !== (current.supplier_phone ?? null))
  )) throw new Error('Товар уже взят на реализацию: закупочную цену и поставщика менять нельзя')
}

/** Product and delivery queue commit together, including on storage failures. */
export async function persistOfflineProduct(input: {
  profile: Profile; businessId?: string | null; product: Partial<Product>; remove?: boolean
}): Promise<Product> {
  requireStockConnection(typeof navigator !== 'undefined' && navigator.onLine)
  const { profile, remove = false } = input
  if (!profile.id || profile.status !== 'approved' || !profile.role || !profile.shop_id) {
    throw new Error('Требуется подтверждённая учётная запись магазина')
  }
  const db = await getLocalDB()
  const tx = db.transaction(['products', 'outbox', 'user_session'], 'readwrite')
  const store = tx.objectStore('products')
  const outbox = tx.objectStore('outbox')
  try {
    const session = await tx.objectStore('user_session').get('current_user')
    if (session?.userId !== profile.id || session?.profile?.shop_id !== profile.shop_id) {
      throw new Error('Учётная запись изменилась. Откройте приложение повторно.')
    }
    const id = input.product.id || createLocalId()
    const current = await store.get(id) as Product | undefined
    if (input.product.id && !current) throw new Error('Товар не найден в локальном каталоге')
    if (current && (
      (current.current_location_shop_id ?? current.shop_id) !== profile.shop_id ||
      current.deleted_at || current.status === 'sold'
    )) {
      throw new Error('Товар продан, удалён или принадлежит другому магазину')
    }
    if (!remove) validateOfflineProduct(input.product, current)
    const now = new Date().toISOString()
    const queued = (await outbox.getAll() as OutboxItem[]).filter((row) =>
      row.shop_id === profile.shop_id && row.entity === 'products' && row.payload?.id === id)
    // Coalesce ONLY an operation that has never been attempted. In-flight/failed
    // requests may already have committed remotely and retain their stable key.
    const last = queued.sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)
    const merge = last?.status === 'pending' && last.retries === 0 && !last.attempted_at ? last : undefined
    const operationId = merge?.client_op_id || createLocalId()
    const product: Product = {
      id,
      shop_id: current?.shop_id ?? profile.shop_id,
      business_id: current?.business_id ?? input.businessId ?? null,
      current_location_shop_id: current?.current_location_shop_id ?? profile.shop_id,
      created_by: current?.created_by ?? profile.id,
      name: '', category: null, metal: null, metal_color: null, weight: 0,
      size: null, sku: input.product.sku?.trim() || `OFF-${id}`,
      is_hidden: false, purchase_price: 0, purchase_price_visible: null,
      price_per_gram_sale: null, price_per_gram_purchase: null,
      price_per_gram_purchase_visible: null, stones: null, description: null,
      sale_price: 0, image_url: null, images: [], supplier_name: null,
      supplier_phone: null, status: 'in_stock', created_at: now,
      ...current, ...editableProductPatch(input.product),
      updated_at: now, client_op_id: operationId,
      ...(remove ? { deleted_at: now } : {}),
    }
    const operation: OutboxItem = {
      id: merge?.id || createLocalId(), client_op_id: operationId,
      shop_id: profile.shop_id, entity: 'products',
      op_type: remove ? 'product_delete' : merge?.op_type === 'product_add' || !current ? 'product_add' : 'product_update',
      payload: { ...product, original_updated_at: merge?.payload.original_updated_at ?? current?.updated_at ?? null },
      status: 'pending', retries: 0, created_at: merge?.created_at || now,
      scheduled_at: null, attempted_at: null, error: null,
    }
    requireStockConnection(typeof navigator !== 'undefined' && navigator.onLine)
    await store.put(product)
    // A never-sent addition deleted locally needs no remote operation at all.
    if (remove && merge?.op_type === 'product_add') {
      await store.delete(id)
      await outbox.delete(merge.id)
    } else await outbox.put(operation)
    await tx.done
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aura:outbox_enqueued', { detail: operation }))
    return product
  } catch (error) {
    try { tx.abort() } catch {}
    await tx.done.catch(() => {})
    throw error
  }
}
