export type Role = "seller" | "admin" | "super_admin"
export type ProfileStatus = "pending" | "approved" | "rejected"

export type Profile = {
  id: string
  full_name: string | null
  shop_name: string | null
  shop_id: string | null
  phone: string | null
  requested_role: string | null
  role: Role | null
  status: ProfileStatus
  bonus_points: number
  bonus_rate?: number | null
  manager_id?: string | null
  last_seen_at?: string | null
  email?: string | null
  created_at: string
}

export type ProductStatus = "in_stock" | "reserved" | "sold" | "archived" | "draft"

export type Customer = {
  id: string
  shop_id: string
  name: string | null
  phone: string | null
  gender: string | null
  whatsapp: string | null
  instagram: string | null
  email: string | null
  /** Ð¦ÐµÐ»Ð¾ÑÐ¸ÑÐ»ÐµÐ½Ð½ÑÐµ Ð±Ð¾Ð½ÑÑÐ½ÑÐµ Ð±Ð°Ð»Ð»Ñ (INTEGER Ð² ÐÐ). */
  bonus_points: number
  /** true â ÐºÐ»Ð¸ÐµÐ½Ñ Ð² ÑÑÑÐ½Ð¾Ð¼ ÑÐ¿Ð¸ÑÐºÐµ. */
  is_blacklisted: boolean
  /** ÐÐµÐ½Ð¾ÑÐ¼Ð°Ð»Ð¸Ð·Ð¾Ð²Ð°Ð½Ð½ÑÐ¹ ÑÑÑÑÑÐ¸Ðº Ð¿Ð¾ÐºÑÐ¿Ð¾Ðº (ÑÐ¸Ð½ÑÑÐ¾Ð½Ð¸Ð·Ð¸ÑÑÐµÑÑÑ Ð¿ÑÐ¸ checkout). */
  purchase_count: number
  /** Ð¡ÑÐ¼Ð¼Ð°ÑÐ½Ð°Ñ Ð²ÑÑÑÑÐºÐ° Ð¿Ð¾ ÐºÐ»Ð¸ÐµÐ½ÑÑ. */
  total_spent: number
  /** ÐÐ°ÑÐ° Ð¿Ð¾ÑÐ»ÐµÐ´Ð½ÐµÐ¹ Ð¿Ð¾ÐºÑÐ¿ÐºÐ¸. */
  last_purchase_at: string | null
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  client_op_id?: string | null
}

/** Ð¡ÑÐ°ÑÑÑ Ð¿Ð¾Ð´Ð¿Ð¸ÑÐºÐ¸ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°. */
export type SubscriptionStatus = "trial" | "active" | "past_due" | "frozen" | "cancelled"

/** Ð§ÐµÐ»Ð¾Ð²ÐµÐºÐ¾ÑÐ¸ÑÐ°ÐµÐ¼ÑÐµ Ð¼ÐµÑÐºÐ¸ ÑÑÐ°ÑÑÑÐ¾Ð² Ð¿Ð¾Ð´Ð¿Ð¸ÑÐºÐ¸. */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial:     "ÐÑÐ¾Ð±Ð½ÑÐ¹",
  active:    "ÐÐºÑÐ¸Ð²Ð½Ð°",
  past_due:  "ÐÑÐ¾ÑÑÐ¾ÑÐµÐ½Ð°",
  frozen:    "ÐÐ°Ð¼Ð¾ÑÐ¾Ð¶ÐµÐ½Ð°",
  cancelled: "ÐÑÐ¼ÐµÐ½ÐµÐ½Ð°",
}

/** ÐÐ°Ð¿Ð¸ÑÑ Ð½Ð°ÑÑÑÐ¾ÐµÐº Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° (Ð²ÐºÐ»ÑÑÐ°Ñ Ð±Ð¸Ð»Ð»Ð¸Ð½Ð³). */
export type ShopSettings = {
  shop_id: string
  shop_name: string | null
  default_bonus_rate: number
  public_enabled: boolean
  updated_at: string
  paid_until: string | null
  subscription_status: SubscriptionStatus
  auto_block: boolean
  is_frozen: boolean
  frozen_at: string | null
  notes: string | null
}

/** ÐÑÐ¾ÑÐ¸Ð»Ñ Ñ Ð¿Ð¾Ð»ÐµÐ¼ Ð¸Ð¼Ð¿ÐµÑÑÐ¾Ð½Ð°ÑÐ¸Ð¸ (ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ super_admin). */
export type ProfileWithImpersonation = Profile & {
  impersonated_shop_id: string | null
}

export type Product = {
  id: string
  shop_id: string
  /** ÐÐ¾ÑÐ¾ÑÐºÐ¸Ð¹ ÑÐ¸ÑÐ»Ð¾Ð²Ð¾Ð¹ ID Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð´Ð»Ñ QR-ÑÑÑÐ»Ð¾Ðº (seq_id Ð¸Ð· shop_settings). */
  shop_seq_id?: number | null
  created_by: string
  name: string
  category: string | null
  metal: string | null
  metal_color: string | null
  /** ÐÐ¾Ð»Ð¾Ð½ÐºÐ° purity ÑÐ´Ð°Ð»ÐµÐ½Ð° Ð¸Ð· ÐÐ â Ð¿ÑÐ¾Ð±Ð° Ð²ÑÑÐ¸ÑÐ»ÑÐµÑÑÑ Ð¸Ð· metal (purityFromMetal). */
  weight: number
  size: string | null
  sku: string | null
  /** ÐÐ¾ÑÑÐ´ÐºÐ¾Ð²ÑÐ¹ Ð½Ð¾Ð¼ÐµÑ Ð°ÑÑÐ¸ÐºÑÐ»Ð° Ð²Ð½ÑÑÑÐ¸ Ð¿ÑÐµÑÐ¸ÐºÑÐ° (1â99999). */
  article_seq?: number | null
  is_hidden: boolean | null
  purchase_price: number
  /**
   * ÐÐ°ÐºÑÐ¿Ð¾ÑÐ½Ð°Ñ ÑÐµÐ½Ð°, ÐºÐ¾ÑÐ¾ÑÑÑ Ð²Ð¸Ð´Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÐµÑ (Ð¼Ð¾Ð¶ÐµÑ Ð¾ÑÐ»Ð¸ÑÐ°ÑÑÑÑ Ð¾Ñ ÑÐµÐ°Ð»ÑÐ½Ð¾Ð¹).
   * ÐÐµÑÐµÐ¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¾ Ð¸Ð· purchase_price_seller â purchase_price_visible (v20).
   */
  purchase_price_visible: number | null
  /**
   * Ð¦ÐµÐ½Ð° Ð·Ð° Ð³ÑÐ°Ð¼Ð¼ Ð·Ð°ÐºÑÐ¿ÐºÐ¸ Ð´Ð»Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ°.
   * ÐÐµÑÐµÐ¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¾ Ð¸Ð· price_per_gram_purchase_seller â price_per_gram_purchase_visible (v20).
   */
  price_per_gram_purchase_visible: number | null
  price_per_gram_sale: number | null
  price_per_gram_purchase: number | null
  stones: string | null
  description: string | null
  sale_price: number
  image_url: string | null
  images: string[] | null
  supplier_name: string | null
  supplier_phone: string | null
  consignment_operation_id?: string | null
  consignment_at?: string | null
  consignment_by?: string | null
  status: ProductStatus
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  client_op_id?: string | null
}

export type SaleItemKind = "product" | "scrap"

export type SaleItem = {
  /** null Ð´Ð»Ñ Ð»Ð¾Ð¼Ð° â ÑÐ¾Ð²Ð°ÑÐ° Ð½ÐµÑ Ð½Ð° ÑÐºÐ»Ð°Ð´Ðµ. */
  product_id: string | null
  id?: string | null
  sku?: string | null
  kind?: SaleItemKind
  /**
   * ÐÑÑÐ¾ÑÐ¸ÑÐµÑÐºÐ¾Ðµ Ð¿Ð¾Ð»Ðµ ÑÐµÐºÐ¾Ð². ÐÐ¾Ð²ÑÐµ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸ Ð²ÑÐµÐ³Ð´Ð° ÑÐ¾ÑÑÐ°Ð½ÑÑÑÑÑ ÑÐ¾Ð²Ð½Ð¾ Ñ
   * quantity=1, Ð¿Ð¾ÑÐ¾Ð¼Ñ ÑÑÐ¾ ÐºÐ°Ð¶Ð´Ð¾Ðµ ÑÐ²ÐµÐ»Ð¸ÑÐ½Ð¾Ðµ Ð¸Ð·Ð´ÐµÐ»Ð¸Ðµ â Ð¾ÑÐ´ÐµÐ»ÑÐ½Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑ.
   */
  quantity: number
  name: string
  weight: number
  metal: string | null
  price_per_gram?: number | null
  price: number
  cost: number
}

export type Sale = {
  id: string
  shop_id: string
  seller_id: string
  seller_name: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  payment_method: string
  /** Ð Ð°Ð·Ð±Ð¸Ð²ÐºÐ° ÑÐ¼ÐµÑÐ°Ð½Ð½Ð¾Ð¹ Ð¾Ð¿Ð»Ð°ÑÑ. */
  amount_cash?: number | null
  amount_electronic?: number | null
  subtotal: number
  discount: number
  total: number
  cost_total: number
  profit: number
  bonus_earned: number
  bonus_used: number
  items: SaleItem[]
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  total_price?: number
  final_price?: number
  client_op_id?: string | null
  /** Device-only delivery state; this field is never stored in Supabase. */
  sync_status?: "pending" | "confirmed" | "rejected"
  sync_error?: string
  cash_operation_id?: string | null
}

/** ÐÐ¾Ð·Ð²ÑÐ°Ñ Ð¾Ð´Ð½Ð¾Ð¹ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸ ÑÐµÐºÐ° (ÑÐ°Ð±Ð»Ð¸ÑÐ° sale_returns, Ð¼Ð¸Ð³ÑÐ°ÑÐ¸Ñ v33). */
export type SaleReturn = {
  id: string
  shop_id: string
  sale_id: string
  /** null Ð´Ð»Ñ Ð»Ð¾Ð¼Ð° â ÑÐ¾Ð²Ð°ÑÐ° Ð½Ð° ÑÐºÐ»Ð°Ð´Ðµ Ð½Ðµ Ð±ÑÐ»Ð¾. */
  product_id?: string | null
  /** ÐÐ½Ð´ÐµÐºÑ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸ Ð²Ð½ÑÑÑÐ¸ sales.items Ð¸ÑÑÐ¾Ð´Ð½Ð¾Ð³Ð¾ ÑÐµÐºÐ°. */
  item_index: number
  item_name?: string
  item_metal?: string | null
  item_weight?: number
  /** Ð¡ÑÐ¼Ð¼Ð°, ÑÐ°ÐºÑÐ¸ÑÐµÑÐºÐ¸ Ð²ÑÐ¿Ð»Ð°ÑÐµÐ½Ð½Ð°Ñ Ð¿Ð¾ÐºÑÐ¿Ð°ÑÐµÐ»Ñ (Ð¿Ð¾ Ð¾Ð¿Ð»Ð°ÑÐµÐ½Ð½Ð¾Ð¹ ÑÐµÐ½Ðµ). */
  amount?: number
  /** Ð¡ÐµÐ±ÐµÑÑÐ¾Ð¸Ð¼Ð¾ÑÑÑ Ð²Ð¾Ð·Ð²ÑÐ°ÑÑÐ½Ð½Ð¾Ð³Ð¾ ÑÐ¾Ð²Ð°ÑÐ° â ÑÐ½Ð¾Ð²Ð° ÑÑÐ¸ÑÑÐ²Ð°ÐµÑÑÑ Ð½Ð° ÑÐºÐ»Ð°Ð´Ðµ. */
  cost?: number
  /** Ð Ð°ÑÑÐ¾Ð´Ð½Ð°Ñ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ñ ÐºÐ°ÑÑÑ, ÑÐ¾Ð·Ð´Ð°Ð½Ð½Ð°Ñ Ð°ÑÐ¾Ð¼Ð°ÑÐ½Ð¾ Ð²Ð¼ÐµÑÑÐµ Ñ Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ¾Ð¼. */
  cash_operation_id?: string | null
  reason: string
  created_by?: string
  author_name?: string | null
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  sku?: string
  product_name?: string
  return_amount?: number
  client_op_id?: string | null
}

export type MetalRate = {
  id: string
  shop_id: string
  metal: string
  price_per_gram: number
  scrap_price_per_gram: number
  updated_at: string
  deleted_at?: string | null
}

export const CATEGORIES = ["ÐÐ¾Ð»ÑÑÐ°", "Ð¡ÐµÑÑÐ³Ð¸", "Ð¦ÐµÐ¿Ð¸", "ÐÑÐ°ÑÐ»ÐµÑÑ", "ÐÐ¾Ð´Ð²ÐµÑÐºÐ¸", "Ð§Ð°ÑÑ", "ÐÑÐ¾ÑÐµÐµ"] as const

export const METALS = [
  "ÐÐ¾Ð»Ð¾ÑÐ¾ 375",
  "ÐÐ¾Ð»Ð¾ÑÐ¾ 585",
  "ÐÐ¾Ð»Ð¾ÑÐ¾ 750",
  "ÐÐ¾Ð»Ð¾ÑÐ¾ 999",
  "ÐÐµÐ»Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾",
  "Ð¡ÐµÑÐµÐ±ÑÐ¾ 925",
  "ÐÐ»Ð°ÑÐ¸Ð½Ð°",
  "ÐÑÐ¾ÑÐ¸ÑÐ½Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾ 375",
  "ÐÑÐ¾ÑÐ¸ÑÐ½Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾ 585",
  "ÐÑÐ¾ÑÐ¸ÑÐ½Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾ 750",
  "ÐÑÐ¾ÑÐ¸ÑÐ½Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾ 999",
  "ÐÑÐ¾ÑÐ¸ÑÐ½Ð¾Ðµ ÑÐµÑÐµÐ±ÑÐ¾ 925",
] as const

/** Ð¦Ð²ÐµÑ Ð¼ÐµÑÐ°Ð»Ð»Ð° â Ð²ÑÐ±Ð¸ÑÐ°ÐµÑÑÑ ÐºÐ½Ð¾Ð¿ÐºÐ°Ð¼Ð¸ Ð² ÐºÐ°ÑÑÐ¾ÑÐºÐµ ÑÐ¾Ð²Ð°ÑÐ°. */
export const METAL_COLORS = [
  "ÐÑÐ»ÑÐ¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾",
  "ÐÐµÐ»Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾",
  "ÐÑÐ°ÑÐ½Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾",
  "Ð Ð¾Ð·Ð¾Ð²Ð¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾",
  "ÐÐ¾Ð¼Ð±Ð¸Ð½Ð¸ÑÐ¾Ð²Ð°Ð½Ð½ÑÐ¹",
  "Ð¡ÐµÑÐµÐ±ÑÐ¾",
] as const

export const PAYMENT_METHODS = [
  { value: "cash", label: "ÐÐ°Ð»Ð¸ÑÐ½ÑÐµ" },
  { value: "transfer", label: "ÐÐµÑÐµÐ²Ð¾Ð´ / ÐºÐ°ÑÑÐ°" },
  { value: "mixed", label: "Ð¡Ð¼ÐµÑÐ°Ð½Ð½Ð¾" },
] as const

/** Ð£ÑÑÐ°ÑÐµÐ²ÑÐ¸Ð¹ ÑÐ¿Ð¾ÑÐ¾Ð± Â«cardÂ» Ð¾ÑÑÐ°ÑÑÑÑ Ð´Ð»Ñ ÑÑÐ°ÑÑÑ ÑÐµÐºÐ¾Ð². */
export const PAYMENT_LABELS: Record<string, string> = {
  cash: "ÐÐ°Ð»Ð¸ÑÐ½ÑÐµ",
  card: "ÐÐ°ÑÑÐ°",
  transfer: "ÐÐµÑÐµÐ²Ð¾Ð´ / ÐºÐ°ÑÑÐ°",
  mixed: "Ð¡Ð¼ÐµÑÐ°Ð½Ð½Ð¾",
}

export type CashOpType = "income" | "outcome" | "collection"

/** ÐÑÑÐ¾ÑÐ½Ð¸Ðº ÑÑÐµÐ´ÑÑÐ² Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¸: Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ, ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ Ð¸Ð»Ð¸ Ð¾Ð±Ð° ÑÑÐ°Ð·Ñ. */
export type CashSource = "cash" | "electronic" | "mixed"

export const CASH_SOURCES: { value: CashSource; label: string }[] = [
  { value: "cash", label: "ÐÐ°Ð»Ð¸ÑÐ½ÑÐµ" },
  { value: "electronic", label: "Ð­Ð»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ (Ð±ÐµÐ·Ð½Ð°Ð»)" },
  { value: "mixed", label: "Ð¡Ð¼ÐµÑÐ°Ð½Ð½Ð¾ / Ð¸Ð· Ð¾Ð±Ð¾Ð¸Ñ" },
]

export type CashOperation = {
  id: string
  shop_id: string
  created_by?: string
  author_name?: string | null
  type: CashOpType
  amount: number
  source?: CashSource
  amount_cash?: number
  amount_electronic?: number
  reason: string
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  supplier_name?: string | null
  supplier_phone?: string | null
  supplier_debt_operation_id?: string | null
  client_op_id?: string | null
}

export type CashReasonPreset = {
  id: string
  shop_id: string
  created_by: string
  text: string
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
}

export type SupplierDebtOperationType = "consignment" | "adjustment" | "payment"
export type SupplierDebtSource = "cash" | "electronic" | "mixed" | null

export type SupplierDebtOperation = {
  id: string
  shop_id: string
  supplier_name: string
  supplier_phone: string | null
  operation_type: SupplierDebtOperationType
  amount: number
  balance_before: number
  balance_after: number
  product_id: string | null
  cash_operation_id: string | null
  source: SupplierDebtSource
  amount_cash: number
  amount_electronic: number
  reason: string
  author_name: string | null
  device_info: string | null
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  client_op_id?: string | null
}

export type SupplierDebtSummary = {
  supplier_name: string
  supplier_phone: string | null
  balance: number
  last_operation_at: string
}

/** ÐÐºÑÐµÐ½ÑÐ½ÑÐ¹ Â«Ð½ÐµÐ¹ÑÑÐ°Ð»ÑÐ½ÑÐ¹Â» ÑÐ²ÐµÑ Ð¸Ð½ÑÐµÑÑÐµÐ¹ÑÐ° (Ð¸Ð½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ, Ð²ÑÐ´ÐµÐ»ÐµÐ½Ð¸Ñ). */
export const GOLD_ACCENT = "#E5AC4C"

// =============================================================================
// v22: Ð¡Ð¸ÑÑÐµÐ¼Ð° ÑÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ð¹ ÑÑÐ¿ÐµÑÐ°Ð´Ð¼Ð¸Ð½Ð°
// =============================================================================

/** Ð¢Ð¸Ð¿ ÑÐ¾Ð±ÑÑÐ¸Ñ ÑÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ñ. */
export type NotificationKind = "pending_request"

/** Ð§ÐµÐ»Ð¾Ð²ÐµÐºÐ¾ÑÐ¸ÑÐ°ÐµÐ¼ÑÐµ Ð¼ÐµÑÐºÐ¸ ÑÐ¸Ð¿Ð¾Ð² ÑÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ð¹. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  pending_request: "ÐÐ¶Ð¸Ð´Ð°Ð½Ð¸Ðµ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ",
}

/** Ð£Ð²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ðµ ÑÑÐ¿ÐµÑÐ°Ð´Ð¼Ð¸Ð½Ð° (ÑÑÑÐ¾ÐºÐ° Ð¸Ð· superadmin_notifications). */
export type SuperadminNotification = {
  id: string
  kind: NotificationKind
  profile_id: string
  shop_id: string | null
  full_name: string | null
  shop_name: string | null
  requested_role: string | null
  is_read: boolean
  is_processed: boolean
  created_at: string
}

/** Ð ÐµÐ·ÑÐ»ÑÑÐ°Ñ ÑÐµÑÐ²ÐµÑ-ÑÐºÑÐ½Ð° (ÐµÐ´Ð¸Ð½ÑÐ¹ ÑÐ¾ÑÐ¼Ð°Ñ ÑÑÐ¿ÐµÑ/Ð¾ÑÐ¸Ð±ÐºÐ°). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
