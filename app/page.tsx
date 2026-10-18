import Link from "next/link"
import type { Metadata } from "next"
import { getPublicShops } from "@/app/actions/shops"
import { AuraMark } from "@/components/brand/aura-mark"
import { Button } from "@/components/ui/button"
import { ArrowRight, Gem, ShieldCheck, Store } from "lucide-react"

export const revalidate = 300

export const metadata: Metadata = {
  title: "Aura â Ð¼Ð°ÑÐºÐµÑÐ¿Ð»ÐµÐ¹Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ½ÑÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð² Ð¸ CRM",
  description:
    "Aura Ð¾Ð±ÑÐµÐ´Ð¸Ð½ÑÐµÑ Ð²Ð¸ÑÑÐ¸Ð½Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ½ÑÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð² Ð¸ CRM Ð´Ð»Ñ ÑÑÑÑÐ°: ÑÐºÐ»Ð°Ð´, ÐºÐ°ÑÑÐ°, ÑÑÐ¸ÐºÐµÑÐºÐ¸ Ð¸ Ð±Ð¾Ð½ÑÑÑ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð².",
  openGraph: {
    title: "Aura â Ð¼Ð°ÑÐºÐµÑÐ¿Ð»ÐµÐ¹Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ½ÑÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð² Ð¸ CRM",
    description: "ÐÐ¸ÑÑÐ¸Ð½Ñ ÑÐ²ÐµÐ»Ð¸ÑÐ½ÑÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð² Ð¸ CRM Ð´Ð»Ñ ÑÑÑÑÐ°: ÑÐºÐ»Ð°Ð´, ÐºÐ°ÑÑÐ°, ÑÑÐ¸ÐºÐµÑÐºÐ¸, Ð±Ð¾Ð½ÑÑÑ.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
}

export default async function LandingPage() {
  const shops = await getPublicShops()

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <AuraMark className="h-7 w-7" />
          <span className="font-serif text-lg">Aura</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">ÐÑÐ¾Ð´</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/auth/sign-up">Ð ÐµÐ³Ð¸ÑÑÑÐ°ÑÐ¸Ñ</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
          Ð®Ð²ÐµÐ»Ð¸ÑÐ½ÑÐµ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ Ð¸ ÑÑÑÑ Ð² Ð¾Ð´Ð½Ð¾Ð¼ Ð¼ÐµÑÑÐµ
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          App â Ð¿ÑÐ±Ð»Ð¸ÑÐ½ÑÐµ Ð²Ð¸ÑÑÐ¸Ð½Ñ Ð¸Ð·Ð´ÐµÐ»Ð¸Ð¹ Ð´Ð»Ñ Ð¿Ð¾ÐºÑÐ¿Ð°ÑÐµÐ»ÐµÐ¹. CRM â ÑÐºÐ»Ð°Ð´, ÐºÐ°ÑÑÐ°, ÑÑÐ¸ÐºÐµÑÐºÐ¸ Ð¸ Ð±Ð¾Ð½ÑÑÑ
          Ð´Ð»Ñ ÐºÐ¾Ð¼Ð°Ð½Ð´Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/auth/sign-up">
              Ð ÐµÐ³Ð¸ÑÑÑÐ°ÑÐ¸Ñ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent">
            <Link href="/crm">ÐÐ¾Ð¹ÑÐ¸ Ð² CRM</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          <Feature icon={<Store className="h-5 w-5 text-primary" />} title="App â Ð²Ð¸ÑÑÐ¸Ð½Ñ">
            ÐÐ°ÑÐ°Ð»Ð¾Ð³ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð², ÐºÐ°ÑÑÐ¾ÑÐºÐ¸ Ð¸Ð·Ð´ÐµÐ»Ð¸Ð¹ Ð¿Ð¾ QR-ÐºÐ¾Ð´Ñ Ñ ÑÑÐ¸ÐºÐµÑÐºÐ¸.
          </Feature>
          <Feature icon={<Gem className="h-5 w-5 text-primary" />} title="CRM â ÑÑÑÑ">
            Ð¡ÐºÐ»Ð°Ð´, ÐºÐ°ÑÑÐ°, Ð¾ÑÑÑÑÑ, Ð¿ÐµÑÐ°ÑÑ ÑÑÐ¸ÐºÐµÑÐ¾Ðº Niimbot Ð¸ Ð°ÑÑÐ¸ÐºÑÐ»Ñ.
          </Feature>
          <Feature icon={<ShieldCheck className="h-5 w-5 text-primary" />} title="Ð Ð¾Ð»Ð¸ Ð¸ Ð±Ð¾Ð½ÑÑÑ">
            Ð¡ÑÐ¿ÐµÑ Ð°Ð´Ð¼Ð¸Ð½, Ð°Ð´Ð¼Ð¸Ð½ Ð¸ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÑ Ñ Ð±Ð¾Ð½ÑÑÐ°Ð¼Ð¸ Ð¾Ñ Ð¿ÑÐ¸Ð±ÑÐ»Ð¸.
          </Feature>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <h2 className="font-serif text-2xl">ÐÐ°Ð³Ð°Ð·Ð¸Ð½Ñ</h2>
        <p className="mt-1 text-sm text-muted-foreground">ÐÑÐ±Ð»Ð¸ÑÐ½ÑÐµ Ð²Ð¸ÑÑÐ¸Ð½Ñ ÑÑÐ°ÑÑÐ½Ð¸ÐºÐ¾Ð² Aura</p>

        {shops.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            ÐÐ¾ÐºÐ° Ð½ÐµÑ Ð¾ÑÐºÑÑÑÑÑ Ð²Ð¸ÑÑÐ¸Ð½. ÐÐ°ÑÐµÐ³Ð¸ÑÑÑÐ¸ÑÑÐ¹ÑÐµ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½ â Ð¸ Ð¾Ð½ Ð¿Ð¾ÑÐ²Ð¸ÑÑÑ Ð·Ð´ÐµÑÑ.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s) => (
              <Link
                key={s.shop_id}
                href={`/store/${s.shop_id}`}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 font-medium">{s.shop_name ?? "Ð®Ð²ÐµÐ»Ð¸ÑÐ½ÑÐ¹ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½"}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  Ð¡Ð¼Ð¾ÑÑÐµÑÑ Ð²Ð¸ÑÑÐ¸Ð½Ñ
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Â© {new Date().getFullYear()} Aura Â· app + crm
      </footer>
    </main>
  )
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
      <div className="mt-3 font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
