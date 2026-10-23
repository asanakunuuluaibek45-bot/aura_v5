"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, CircleHelp, Compass, Lightbulb, X } from "lucide-react"
import type { ScreenId } from "@/components/app-nav"

type SectionGuide = { id: ScreenId; title: string; description: string; actions: string[]; adminOnly?: boolean; superAdminOnly?: boolean }
type TourStep = { title: string; description: string; screen?: ScreenId; actions?: string[] }

const SECTION_GUIDES: SectionGuide[] = [
  { id: "kassa", title: "Касса", description: "Оформляйте продажи и работайте с чеком.", actions: ["Найдите товар по названию или штрихкоду и добавьте его в чек.", "Проверьте состав чека и данные клиента перед оплатой.", "Завершите продажу, чтобы сохранить её в истории."] },
  { id: "money", title: "Деньги", description: "Смотрите движение денег и операции кассы.", actions: ["Проверяйте операции и остаток за выбранный период.", "Используйте раздел для контроля денежных поступлений и расходов."] },
  { id: "vitrina", title: "Витрина", description: "Просматривайте ассортимент магазина.", actions: ["Ищите украшения в каталоге.", "Откройте карточку товара, чтобы посмотреть его сведения."] },
  { id: "sklad", title: "Склад", description: "Управляйте карточками товаров и складским ассортиментом.", actions: ["Найдите товар через поиск и доступные фильтры.", "Создайте карточку нового товара или откройте существующую для редактирования."] },
  { id: "clients", title: "Клиенты", description: "Храните карточки клиентов и просматривайте их покупки.", actions: ["Найдите клиента или добавьте нового.", "Откройте историю покупок в карточке клиента."] },
  { id: "suppliers", title: "Поставщики", description: "Работайте с поставщиками и связанными расчётами.", actions: ["Откройте поставщика, чтобы посмотреть его данные.", "Проверяйте задолженности и выплаты в этом разделе."], adminOnly: true },
  { id: "otchety", title: "Отчёты", description: "Анализируйте продажи и показатели магазина.", actions: ["Выберите нужный период отчёта.", "Сравните показатели для контроля работы магазина."], adminOnly: true },
  { id: "shops", title: "Магазины", description: "Управляйте магазинами в панели супер-администратора.", actions: ["Выберите магазин, чтобы открыть его данные.", "Этот раздел доступен супер-администратору."], superAdminOnly: true },
  { id: "notifications", title: "Уведомления", description: "Просматривайте системные уведомления Aura.", actions: ["Откройте уведомление, чтобы прочитать его содержание.", "Возвращайтесь сюда, чтобы проверить новые сообщения."], superAdminOnly: true },
  { id: "kabinet", title: "Кабинет", description: "Ваш профиль, команда и рабочие настройки.", actions: ["Откройте профиль, чтобы посмотреть данные учётной записи.", "Администраторы могут переключать режим просмотра роли — это не меняет саму роль.", "Используйте историю действий для просмотра недавних операций."] },
]

export function SiteHelp({ screen, onNavigate, isAdmin, isSuperAdmin }: { screen: ScreenId; onNavigate: (screen: ScreenId) => void; isAdmin: boolean; isSuperAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [hasSeen, setHasSeen] = useState(true)

  const sections = useMemo(() => SECTION_GUIDES.filter((section) => {
    if (section.superAdminOnly) return isSuperAdmin
    if (section.adminOnly) return isAdmin
    return true
  }), [isAdmin, isSuperAdmin])

  const tourSteps = useMemo<TourStep[]>(() => [
    { title: "Верхняя панель", description: "Здесь находятся меню, текущий магазин, быстрое создание, уведомления и статус синхронизации.", actions: ["«Создать» открывает быстрые действия: новая продажа, товар, клиент и — для администратора — поставщики.", "Кнопка с названием магазина показывает текущий магазин.", "Индикатор синхронизации сообщает о состоянии обмена данными.", "Переключатель темы находится в боковом меню."] },
    ...sections.map((section) => ({ title: section.title, description: section.description, screen: section.id, actions: section.actions })),
    { title: "Помощь всегда рядом", description: "Кнопка «Помощь» остаётся внизу экрана. Откройте её в любой момент, чтобы снова пройти тур или посмотреть подсказку по текущему разделу." },
  ], [sections])

  useEffect(() => {
    let seen = true
    try { seen = window.localStorage.getItem("aura-site-help-seen-v1") === "1" } catch { /* Storage may be disabled. */ }
    setHasSeen(seen)
    if (!seen) setOpen(true)
    setReady(true)
  }, [])

  const markSeen = () => {
    setHasSeen(true)
    try { window.localStorage.setItem("aura-site-help-seen-v1", "1") } catch { /* Help remains available for this session. */ }
  }
  const closeHelp = () => { markSeen(); setOpen(false); setTourIndex(null) }
  const startTour = () => { setTourIndex(0); setOpen(true) }
  const moveTour = (direction: -1 | 1) => {
    if (tourIndex === null) return
    const nextIndex = tourIndex + direction
    if (nextIndex < 0) return
    if (nextIndex >= tourSteps.length) { closeHelp(); return }
    setTourIndex(nextIndex)
    const nextStep = tourSteps[nextIndex]
    if (nextStep.screen) onNavigate(nextStep.screen)
  }

  const currentGuide = sections.find((section) => section.id === screen)
  const currentStep = tourIndex === null ? null : tourSteps[tourIndex]

  return (
    <>
      <button type="button" onClick={() => { setTourIndex(null); setOpen(true) }} aria-label="Открыть помощь по Aura" title="Помощь по сайту" className="fixed bottom-4 right-4 z-[120] inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 bg-background px-4 text-sm font-semibold text-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CircleHelp className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>Помощь</span>
      </button>

      {ready && open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHelp() }}>
          <section role="dialog" aria-modal="true" aria-labelledby="aura-help-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{currentStep ? <Compass className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}</span>
                <div>
                  <h2 id="aura-help-title" className="text-base font-semibold sm:text-lg">{currentStep ? "Экскурсия по Aura" : "Помощь по Aura"}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{currentStep ? <span>Шаг {tourIndex! + 1} из {tourSteps.length}</span> : "Что находится в разделах и как начать работу"}</p>
                </div>
              </div>
              <button type="button" onClick={closeHelp} aria-label="Закрыть помощь" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {currentStep ? (
                <div>
                  <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-all" style={{ width: (((tourIndex! + 1) / tourSteps.length) * 100) + "%" }} /></div>
                  <h3 className="text-lg font-semibold">{currentStep.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{currentStep.description}</p>
                  {currentStep.actions?.length ? <ul className="mt-4 space-y-2">{currentStep.actions.map((action) => <li key={action} className="flex gap-2.5 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{action}</span></li>)}</ul> : null}
                </div>
              ) : (
                <>
                  {!hasSeen && <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">Добро пожаловать в Aura!</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Короткая экскурсия покажет назначение главных разделов и кнопок. Её можно пропустить и пройти позже.</p><button type="button" onClick={startTour} className="mt-3 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Начать экскурсию</button></div>}
                  <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текущий раздел</div><h3 className="mt-1 text-base font-semibold">{currentGuide?.title ?? "Разделы Aura"}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{currentGuide?.description ?? "Разделы и действия видны согласно вашей роли."}</p>{currentGuide?.actions.length ? <ul className="mt-3 space-y-2">{currentGuide.actions.map((action) => <li key={action} className="flex gap-2.5 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{action}</span></li>)}</ul> : null}</div>
                  <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Все разделы</h3><button type="button" onClick={startTour} className="text-xs font-semibold text-primary underline-offset-4 hover:underline">Пройти тур</button></div>
                  <div className="grid gap-2 sm:grid-cols-2">{sections.map((section) => <button key={section.id} type="button" onClick={() => { onNavigate(section.id); closeHelp() }} className="rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block text-sm font-semibold">{section.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.description}</span></button>)}</div>
                  <div className="mt-4 rounded-xl bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">Подсказки в боковом меню объясняют назначение разделов. В этой справке собраны назначения главных действий на каждом экране.</div>
                </>
              )}
            </div>

            {currentStep && <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6"><button type="button" onClick={closeHelp} className="text-sm text-muted-foreground transition hover:text-foreground">Пропустить тур</button><div className="flex gap-2"><button type="button" onClick={() => moveTour(-1)} disabled={tourIndex === 0} aria-label="Предыдущий шаг" className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Назад</button><button type="button" onClick={() => moveTour(1)} className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">{tourIndex === tourSteps.length - 1 ? "Завершить" : "Далее"}{tourIndex !== tourSteps.length - 1 && <ChevronRight className="h-4 w-4" />}</button></div></footer>}
          </section>
        </div>
      )}
    </>
  )
}
