import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/types"
import { PendingScreen } from "@/components/pending-screen"
import { Dashboard } from "@/components/dashboard"
import { getProducts } from "@/app/actions/products"
import { getSales } from "@/app/actions/sales"
import { getCabinetData } from "@/app/actions/cabinet"
import { getCashData } from "@/app/actions/cash"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

  // Bootstrap: if nobody in this shop is approved yet, auto-approve this user as admin.
  if (profile && profile.status === "pending" && profile.shop_id) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", profile.shop_id)
      .eq("status", "approved")

    if (!count || count === 0) {
      const { data: updated } = await supabase
        .from("profiles")
        .update({ status: "approved", role: "admin" })
        .eq("id", user.id)
        .select("*")
        .single()
      if (updated) profile = updated
    }
  }

  const typed = profile as Profile | null

  if (!typed || typed.status !== "approved" || !typed.role) {
    return <PendingScreen profile={typed} email={user.email ?? ""} />
  }

  const [products, sales, cabinet, cash] = await Promise.all([
    getProducts(),
    getSales(),
    getCabinetData(),
    getCashData(),
  ])

  return (
    <Dashboard
      profile={typed}
      products={products}
      sales={sales}
      cabinet={cabinet}
      cash={cash}
      email={user.email ?? ""}
    />
  )
}
