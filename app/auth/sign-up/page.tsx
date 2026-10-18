"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AuthShell } from "@/components/auth/auth-shell"
import { InlineLoader } from "@/components/ui/page-loader"

function signUpErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === "weak_password") return "ÐÑÐ±ÐµÑÐ¸ÑÐµ Ð±Ð¾Ð»ÐµÐµ Ð½Ð°Ð´ÑÐ¶Ð½ÑÐ¹ Ð¿Ð°ÑÐ¾Ð»Ñ (Ð¼Ð¸Ð½Ð¸Ð¼ÑÐ¼ 6 ÑÐ¸Ð¼Ð²Ð¾Ð»Ð¾Ð²)."
  if (code === "email_address_invalid") return "Ð£ÐºÐ°Ð¶Ð¸ÑÐµ ÑÐµÐ°Ð»ÑÐ½ÑÐ¹ email â ÑÐµÑÑÐ¾Ð²ÑÐµ Ð´Ð¾Ð¼ÐµÐ½Ñ Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑÐ¶Ð¸Ð²Ð°ÑÑÑÑ."
  if (code === "email_address_not_authorized") return "ÐÐµ ÑÐ´Ð°ÑÑÑÑ Ð¾ÑÐ¿ÑÐ°Ð²Ð¸ÑÑ Ð¿Ð¸ÑÑÐ¼Ð¾ Ð½Ð° ÑÑÐ¾Ñ Ð°Ð´ÑÐµÑ. ÐÑÐ¿Ð¾Ð»ÑÐ·ÑÐ¹ÑÐµ Ð´ÑÑÐ³Ð¾Ð¹."
  if (code === "user_already_exists") return "ÐÐ¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ Ñ ÑÐ°ÐºÐ¸Ð¼ email ÑÐ¶Ðµ ÑÑÑÐµÑÑÐ²ÑÐµÑ."
  if (code === "over_email_send_rate_limit" || status === 429) return "Ð¡Ð»Ð¸ÑÐºÐ¾Ð¼ Ð¼Ð½Ð¾Ð³Ð¾ Ð¿Ð¾Ð¿ÑÑÐ¾Ðº. ÐÐ¾Ð´Ð¾Ð¶Ð´Ð¸ÑÐµ Ð½ÐµÐ¼Ð½Ð¾Ð³Ð¾."
  return "ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð·Ð°Ð²ÐµÑÑÐ¸ÑÑ ÑÐµÐ³Ð¸ÑÑÑÐ°ÑÐ¸Ñ. ÐÐ¾Ð¿ÑÐ¾Ð±ÑÐ¹ÑÐµ ÐµÑÑ ÑÐ°Ð·."
}

export default function SignUpPage() {
  const [fullName, setFullName] = useState("")
  const [shopName, setShopName] = useState("")
  const [phone, setPhone] = useState("")
  const [requestedRole, setRequestedRole] = useState("seller")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== repeatPassword) {
      setError("ÐÐ°ÑÐ¾Ð»Ð¸ Ð½Ðµ ÑÐ¾Ð²Ð¿Ð°Ð´Ð°ÑÑ")
      return
    }
    const supabase = createClient()
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_SITE_URL
              ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
              : `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            shop_name: shopName,
            phone,
            requested_role: requestedRole,
          },
        },
      })
      if (error) throw error
      router.push("/auth/sign-up-success")
    } catch (error: unknown) {
      console.error("[v0] Sign-up error:", error)
      setError(signUpErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell title="Ð ÐµÐ³Ð¸ÑÑÑÐ°ÑÐ¸Ñ" subtitle="Ð¡Ð¾Ð·Ð´Ð°Ð¹ÑÐµ Ð°ÐºÐºÐ°ÑÐ½Ñ. ÐÐ¾ÑÑÑÐ¿ Ð°ÐºÑÐ¸Ð²Ð¸ÑÑÐµÑ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°.">
      <form onSubmit={handleSignUp} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="fullName">ÐÐ°ÑÐµ Ð¸Ð¼Ñ</Label>
          <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="shopName">ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°</Label>
          <Input
            id="shopName"
            placeholder="ÐÐ°Ð¿ÑÐ¸Ð¼ÐµÑ: Aura Bishkek"
            required
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="phone">Ð¢ÐµÐ»ÐµÑÐ¾Ð½</Label>
            <Input id="phone" placeholder="+996" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Ð Ð¾Ð»Ñ</Label>
            <Select value={requestedRole} onValueChange={(v) => setRequestedRole(v ?? "")}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">ÐÑÐ¾Ð´Ð°Ð²ÐµÑ</SelectItem>
                <SelectItem value="admin">ÐÐ´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="password">ÐÐ°ÑÐ¾Ð»Ñ</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repeat">ÐÐ¾Ð²ÑÐ¾Ñ</Label>
            <Input
              id="repeat"
              type="password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <InlineLoader />
              Ð¡Ð¾Ð·Ð´Ð°Ð½Ð¸Ðµ...
            </span>
          ) : (
            "ÐÐ°ÑÐµÐ³Ð¸ÑÑÑÐ¸ÑÐ¾Ð²Ð°ÑÑÑÑ"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Ð£Ð¶Ðµ ÐµÑÑÑ Ð°ÐºÐºÐ°ÑÐ½Ñ?{" "}
          <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
            ÐÐ¾Ð¹ÑÐ¸
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
