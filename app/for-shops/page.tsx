import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, BarChart3, Package, Printer, ShoppingCart, WifiOff, Users } from "lucide-react"
import { GoldUchetLogo } from "@/components/shared/brand/golduchet-logo"
import { Button } from "@/components/shared/ui/button"

export const metadata: Metadata = {
  title: "GOLDUCHET для ювелирных магазинов",
  description:
    "Касса, склад, отчёты, сотрудники и публичная витрина для управления ювелирным магазином.",
}

const benefits = [
  {
    icon: ShoppingCart,
    title: "Продажи и касса",
    description: "Оформляйте продажи и следите за движением денег в одном рабочем пространстве.",
  },
  {
    icon: Package,
    title: "Склад и остатки",
    description: "Ведите каталог изделий, артикулы и складские ревизии.",
  },
  {
    icon: Printer,
    title: "Этикетки и QR-коды",
    description: "Печатайте этикетки и открывайте карточку товара по QR-коду.",
  },
  {
    icon: Users,
    title: "Команда магазина",
    description: "Работайте с ролями сотрудников, клиентами и бонусами продавцов.",
  },
  {
    icon: BarChart3,
    title: "Отчёты",
    description: "Смотрите продажи и показатели магазина в CRM.",
  },
  {
    icon: WifiOff,
    title: "Работа офлайн",
    description: "Касса и основные операции доступны офлайн после первичной загрузки каталога.",
  },
]

export default function ForShopsPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <Link href="/" aria-label="GOLDUCHET — маркетплейс">
          <GoldUchetLogo className="block w-24 max-w-full sm:w-28" />
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Маркетплейс</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="bg-transparent">
            <Link href="/crm">Войти в CRM</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          GOLDUCHET для магазинов
        </p>
        <h1 className="mt-3 max-w-4xl font-serif text-4xl leading-tight sm:text-6xl">
          Управляйте магазином. Покажите изделия покупателям.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          Касса, склад, сотрудники и публичная витрина — в одной системе для ювелирного магазина.
          Покупатели могут просматривать открытые витрины без регистрации.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/auth/sign-up">
              Создать аккаунт магазина
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent">
            <Link href="/crm">Войти в CRM</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-serif text-3xl">Инструменты для ежедневной работы</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center sm:px-10">
          <h2 className="font-serif text-3xl">Откройте витрину своего магазина</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Администратор управляет публичностью витрины в CRM. Покупатели видят только изделия
            в наличии из открытых магазинов.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link href="/auth/sign-up">
              Начать работу
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
