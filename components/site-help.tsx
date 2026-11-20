"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Compass, Lightbulb, X } from "lucide-react"
import type { ScreenId } from "@/components/app-nav"
import { getTourStartIndex } from "@/lib/site-help-tour"

type SectionGuide = { id: ScreenId; title: string; description: string; actions: string[]; adminOnly?: boolean }
type TourStep = { title: string; description: string; screen?: ScreenId; actions?: string[] }

const SECTION_GUIDES: SectionGuide[] = [
  { id: "kassa", title: "Касса", description: "Оформляйте продажи и работайте с чеком.", actions: ["Найдите товар по названию или штрихкоду и добавьте его в чек.", "Выберите клиента и способ оплаты; для продажи в долг клиент обязателен.", "«Оформить» сохраняет продажу и чек.", "«Сброс» очищает текущий чек.", "«Принять лом» открывает оформление приёма лома, а «Добавить строкой в чек» добавляет его в чек."] },
  { id: "money", title: "Деньги", description: "Смотрите движение денег и операции кассы.", actions: ["«Внести» записывает поступление средств в кассу.", "«Изъять» записывает выдачу наличных.", "«Инкассация» переносит наличные в электронные средства.", "История кассы показывает операции за выбранный период."] },
  { id: "vitrina", title: "Витрина", description: "Просматривайте ассортимент магазина.", actions: ["«Все» показывает весь каталог, а «Проданные» — проданные товары.", "Откройте карточку товара, чтобы посмотреть его сведения.", "В галерее используйте «Предыдущее фото» и «Следующее фото».", "«Показать ещё» загружает следующую часть каталога."] },
  { id: "sklad", title: "Склад", description: "Управляйте карточками товаров и складским ассортиментом.", actions: ["«Добавить товар» открывает форму новой карточки.", "«Редактировать» меняет данные выбранного товара; «Удалить» удаляет его.", "«Этикетка» открывает редактор макета, а «Печать этикетки» отправляет этикетку на принтер.", "В редакторе этикеток кнопки панели меняют текст, форматирование, масштаб и расположение элементов.", "В настройках принтера можно подключить, переподключить или сменить Bluetooth-устройство."] },
  { id: "clients", title: "Клиенты", description: "Храните карточки клиентов и просматривайте их покупки.", actions: ["«Добавить клиента» создаёт новую карточку.", "«История покупок» показывает покупки выбранного клиента.", "«Редактировать» меняет карточку, а «Удалить» удаляет её.", "«Чёрный список» включает или снимает ограничение для клиента."] },
  { id: "suppliers", title: "Поставщики", description: "Работайте с поставщиками и связанными расчётами.", actions: ["«Рассчитаться» открывает форму выплаты поставщику.", "«Долг» открывает форму учёта задолженности.", "«История» показывает прошлые расчёты.", "В карточке поставщика можно просматривать и редактировать связанные товары."], adminOnly: true },
  { id: "otchety", title: "Отчёты", description: "Анализируйте продажи и показатели магазина.", actions: ["Выберите период, чтобы изменить даты отчёта.", "Таблицы и диаграммы показывают продажи, остатки и показатели магазина.", "Используйте фильтры категорий для уточнения отчёта.", "Наведите курсор на диаграмму, чтобы увидеть точные значения."], adminOnly: true },
  { id: "kabinet", title: "Кабинет", description: "Ваш профиль, команда и рабочие настройки.", actions: ["«Сохранить» применяет изменения профиля или настроек.", "«Обнулить баллы» сбрасывает бонусные баллы выбранного пользователя.", "Администраторы могут переключать режим просмотра роли — это не меняет саму роль.", "История действий позволяет просматривать и отменять поддерживаемые операции.", "«Отклонить» отклоняет запрос пользователя.", "«Выйти из системы» завершает текущий вход."] },
]

export function SiteHelp({ screen, isAdmin, onRegisterOpenHelp }: { screen: ScreenId; isAdmin: boolean; onRegisterOpenHelp: (openHelp: () => void) => void }) {
  const [open, setOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [hasSeen, setHasSeen] = useState(true)
  const dialogRef = useRef<HTMLElementTagNameMap["section"] | null>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)

  const sections = useMemo(() => SECTION_GUIDES.filter((section) => !section.adminOnly || isAdmin), [isAdmin])

  const tourSteps = useMemo<TourStep[]>(() => [
    { title: "Верхняя панель", description: "Здесь находятся меню, текущий магазин, быстрое создание, уведомления и статус синхронизации.", actions: ["«Создать» открывает быстрые действия: новая продажа, товар, клиент и — для администратора — поставщики.", "Кнопка с названием магазина показывает текущий магазин.", "Индикатор синхронизации сообщает о состоянии обмена данными.", "Переключатель темы находится в боковом меню."] },
    ...sections.map((section) => ({ title: section.title, description: section.description, screen: section.id, actions: section.actions })),
    { title: "Помощь всегда рядом", description: "Кнопка «Помощь» находится внизу бокового меню. Откройте её в любое время, чтобы снова посмотреть описание разделов." },
  ], [sections])

  const openHelp = useCallback(() => {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setTourIndex(null)
    setOpen(true)
  }, [])

  useEffect(() => {
    onRegisterOpenHelp(openHelp)
  }, [onRegisterOpenHelp, openHelp])

  useEffect(() => {
    let seen = true
    try { seen = window.localStorage.getItem("aura-site-help-seen-v1") === "1" } catch { /* Storage may be disabled. */ }
    setHasSeen(seen)
    if (!seen) {
      focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    setReady(true)
  }, [])

  const markSeen = useCallback(() => {
    setHasSeen(true)
    try { window.localStorage.setItem("aura-site-help-seen-v1", "1") } catch { /* Help remains available for this session. */ }
  }, [])
  const closeHelp = useCallback(() => { markSeen(); setOpen(false); setTourIndex(null) }, [markSeen])
  const startTour = (sectionId?: ScreenId) => {
    setTourIndex(getTourStartIndex(tourSteps, sectionId))
    setOpen(true)
  }

  useEffect(() => {
    if (!ready || !open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true")
    const focusFirst = () => (getFocusable()[0] ?? dialog).focus()
    const focusFrame = window.requestAnimationFrame(focusFirst)

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeHelp()
        return
      }
      if (event.key !== "Tab") return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", handleDialogKeyDown)
      const returnTarget = focusReturnRef.current
      const target = returnTarget?.isConnected
        ? returnTarget
        : document.querySelector<HTMLButtonElement>('header button[aria-label="Открыть меню"]')
      if (target?.isConnected) window.requestAnimationFrame(() => target.focus())
    }
  }, [ready, open, closeHelp])
  const moveTour = (direction: -1 | 1) => {
    if (tourIndex === null) return
    const nextIndex = tourIndex + direction
    if (nextIndex < 0) return
    if (nextIndex >= tourSteps.length) { closeHelp(); return }
    setTourIndex(nextIndex)
  }

  const currentGuide = sections.find((section) => section.id === screen)
  const currentStep = tourIndex === null ? null : tourSteps[tourIndex]

  return (
    <>
      {ready && open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHelp() }}>
          <section ref={dialogRef} tabIndex={-1} data-aura-help-dialog role="dialog" aria-modal="true" aria-labelledby="aura-help-title" aria-describedby="aura-help-description" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl focus:outline-none">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{currentStep ? <Compass className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}</span>
                <div>
                  <h2 id="aura-help-title" className="text-base font-semibold sm:text-lg">{currentStep ? "Экскурсия по GOLDUCHET" : "Помощь по GOLDUCHET"}</h2>
                  <p id="aura-help-description" aria-live="polite" className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{currentStep ? <span>Шаг {tourIndex! + 1} из {tourSteps.length}</span> : "Что находится в разделах и как начать работу"}</p>
                </div>
              </div>
              <button type="button" onClick={closeHelp} aria-label="Закрыть помощь" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {currentStep ? (
                <div>
                  <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-all" style={{ width: (((tourIndex! + 1) / tourSteps.length) * 100) + "%" }} /></div>
                  <div aria-live="polite" aria-atomic="true">
                    <h3 className="text-lg font-semibold">{currentStep.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{currentStep.description}</p>
                  </div>
                  {currentStep.actions?.length ? <ul className="mt-4 space-y-2">{currentStep.actions.map((action) => <li key={action} className="flex gap-2.5 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{action}</span></li>)}</ul> : null}
                </div>
              ) : (
                <>
                  {!hasSeen && <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">Добро пожаловать в GOLDUCHET!</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Короткая экскурсия покажет назначение основных разделов. Её можно пропустить и пройти позже.</p><button type="button" onClick={() => startTour()} className="mt-3 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Начать экскурсию</button></div>}
                  <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текущий раздел</div><h3 className="mt-1 text-base font-semibold">{currentGuide?.title ?? "Разделы GOLDUCHET"}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{currentGuide?.description ?? "Разделы и действия видны согласно вашей роли."}</p>{currentGuide?.actions.length ? <ul className="mt-3 space-y-2">{currentGuide.actions.map((action) => <li key={action} className="flex gap-2.5 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span>{action}</span></li>)}</ul> : null}</div>
                  <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Все разделы</h3><button type="button" onClick={startTour} className="text-xs font-semibold text-primary underline-offset-4 hover:underline">Пройти тур</button></div>
                  <div className="grid gap-2 sm:grid-cols-2">{sections.map((section) => <button key={section.id} type="button" onClick={() => startTour(section.id)} className="rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block text-sm font-semibold">{section.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.description}</span></button>)}</div>
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
