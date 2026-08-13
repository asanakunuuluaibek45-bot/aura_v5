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

export type ProductStatus = "in_stock" | "reserved" | "sold"

export type Product = {
  id: string
  shop_id: string
  created_by: string
  name: string
  category: string | null
  metal: string | null
  purity: string | null
  weight: number
  size: string | null
  sku: string | null
  quantity: number
  purchase_price: number
  sale_price: number
  image_url: string | null
  images: string[] | null
  supplier_name: string | null
  supplier_phone: string | null
  status: ProductStatus
  created_at: string
}

export type SaleItem = {
  product_id: string
  name: string
  weight: number
  metal: string | null
  quantity: number
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
  subtotal: number
  discount: number
  total: number
  cost_total: number
  profit: number
  bonus_earned: number
  bonus_used: number
  items: SaleItem[]
  created_at: string
}

export type Customer = {
  id: string
  shop_id: string
  name: string | null
  phone: string | null
  bonus_points: number
  created_at: string
}

export const CATEGORIES = ["Кольца", "Серьги", "Цепи", "Браслеты", "Подвески", "Часы", "Прочее"] as const
export const METALS = [
  "Золото 375",
  "Золото 585",
  "Золото 750",
  "Золото 999",
  "Белое золото",
  "Серебро 925",
  "Платина",
  "Вторичное золото 375",
  "Вторичное золото 585",
  "Вторичное золото 750",
  "Вторичное золото 999",
  "Вторичное серебро 925",
] as const
export const PAYMENT_METHODS = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
] as const

export type CashOpType = "income" | "outcome" | "collection"

export type CashOperation = {
  id: string
  shop_id: string
  created_by: string
  author_name: string | null
  type: CashOpType
  amount: number
  reason: string
  created_at: string
}

export type CashReasonPreset = {
  id: string
  shop_id: string
  created_by: string
  text: string
  created_at: string
}
