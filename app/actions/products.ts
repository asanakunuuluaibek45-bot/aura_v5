"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Product } from "@/lib/types"

async function requireProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  if (!profile || profile.status !== "approved") throw new Error("Not approved")
  return { supabase, user, profile }
}

export async function getProducts(): Promise<Product[]> {
  const { supabase } = await requireProfile()
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false })
  if (error) throw error
  return (data as Product[]) ?? []
}

export type ProductInput = {
  name: string
  category: string
  metal: string
  purity: string
  weight: number
  size: string
  sku: string
  quantity: number
  purchase_price: number
  sale_price: number
  image_url?: string | null
  images?: string[]
  supplier_name?: string | null
  supplier_phone?: string | null
}

export async function createProduct(input: ProductInput) {
  const { supabase, user, profile } = await requireProfile()
  const { error } = await supabase.from("products").insert({
    ...input,
    shop_id: profile.shop_id,
    created_by: user.id,
    status: "in_stock",
  })
  if (error) throw error
  revalidatePath("/")
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const { supabase } = await requireProfile()
  const { error } = await supabase.from("products").update(input).eq("id", id)
  if (error) throw error
  revalidatePath("/")
}

export async function deleteProduct(id: string) {
  const { supabase } = await requireProfile()
  const { error } = await supabase.from("products").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/")
}
