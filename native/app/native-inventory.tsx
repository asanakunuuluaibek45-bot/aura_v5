"use client";

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, Package, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { parseQrCode } from '@/lib/qr-code';
import { formatSom } from '@/lib/format';
import { CATEGORIES, type Product, type Profile } from '@/lib/types';

type Props = {
  profile: Profile; products: Product[]; ready: boolean; online: boolean;
  onSave: (product: Partial<Product>) => Promise<Product>;
  onDelete: (product: Product | string) => Promise<void>;
};
const PAGE_SIZE = 50;

export function NativeInventory({ profile, products, ready, online, onSave, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState<Partial<Product> | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanner, setScanner] = useState(false);
  const admin = profile.role === 'admin' || profile.role === 'super_admin';
  const rows = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => !product.deleted_at && product.status !== 'sold' &&
      (status === 'all' || product.status === status) && tokens.every((token) =>
        `${product.name} ${product.sku ?? ''} ${product.metal ?? ''} ${product.supplier_name ?? ''}`.toLocaleLowerCase().includes(token)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }, [products, query, status]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy || !online || !navigator.onLine) return;
    setBusy(true); setError(null);
    try {
      await onSave(draft);
      setDraft(null); setNotice('Товар сохранён на устройстве.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось сохранить товар'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || busy || !online || !navigator.onLine) return;
    setBusy(true); setError(null);
    try { await onDelete(deleting); setDeleting(null); setNotice('Удаление сохранено на устройстве.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось удалить товар'); }
    finally { setBusy(false); }
  };
  const field = (key: keyof Product, value: unknown) => setDraft((current) => current ? { ...current, [key]: value } : null);

  return <div className="space-y-4">
    <div className="flex gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input aria-label="Поиск на складе" className="min-w-0 w-full bg-transparent outline-none" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </label>
      <Button variant="outline" size="icon" aria-label="Сканировать на складе" onClick={() => setScanner(true)}><ScanLine /></Button>
      <Button disabled={!ready || !online} onClick={() => { setError(null); setDraft({ name: '', weight: 0, sale_price: 0, purchase_price: 0, category: 'Кольца', metal: 'Золото 585' }); }}><Plus />Добавить</Button>
    </div>
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Товаров: {rows.length}</p>
      <select aria-label="Статус товара" className="max-w-full rounded-lg border border-input bg-card px-3" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">Все активные</option><option value="in_stock">В наличии</option><option value="reserved">Зарезервированы</option><option value="archived">Архив</option><option value="draft">Черновики</option>
      </select>
    </div>
    {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    {!ready ? <p role="status">Открываем локальный склад…</p> : rows.length === 0 ? <p className="py-6 text-center text-muted-foreground">Товары не найдены</p> :
      rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((product) => <article key={product.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="break-words font-medium">{product.name}</p><p className="break-all text-xs text-muted-foreground">{product.sku} · {product.metal} · {product.weight} г</p><p className="text-sm">{formatSom(Number(product.sale_price) || Number(product.price_per_gram_sale) * Number(product.weight) || 0)}</p></div>
        <Button size="icon" variant="outline" disabled={!online} aria-label={`Редактировать: ${product.name}`} onClick={() => { setError(null); setDraft({ ...product }); }}><Pencil /></Button>
        {admin && <Button size="icon" variant="destructive" disabled={!online} aria-label={`Удалить: ${product.name}`} onClick={() => { setError(null); setDeleting(product); }}><Trash2 /></Button>}
      </article>)}
    {pages > 1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button><span>{currentPage} / {pages}</span><Button variant="outline" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</Button></div>}
    {draft && <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <form onSubmit={save} aria-label="Карточка товара" className="mx-auto max-w-lg space-y-4 pb-28">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{draft.id ? 'Редактировать товар' : 'Новый товар'}</h2><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="Закрыть карточку" onClick={() => setDraft(null)}><X /></Button></div>
        <label className="block space-y-1 text-sm">Название<input autoFocus required className="w-full rounded-lg border border-input bg-card px-3" value={draft.name ?? ''} onChange={(event) => field('name', event.target.value)} /></label>
        <label className="block space-y-1 text-sm">Категория<select className="w-full rounded-lg border border-input bg-card px-3" value={draft.category ?? 'Кольца'} onChange={(event) => field('category', event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Металл и проба<input className="w-full rounded-lg border border-input bg-card px-3" value={draft.metal ?? ''} onChange={(event) => field('metal', event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">{(['weight', 'sale_price', ...(admin ? ['purchase_price' as const] : [])] as const).map((key) => <label key={key} className="block space-y-1 text-sm">{key === 'weight' ? 'Вес (г)' : key === 'sale_price' ? 'Цена продажи' : 'Закупочная цена'}<input type="number" min="0" step="0.01" className="w-full rounded-lg border border-input bg-card px-3" value={draft[key] ?? ''} onChange={(event) => field(key, Number(event.target.value))} /></label>)}</div>
        <label className="block space-y-1 text-sm">Размер<input className="w-full rounded-lg border border-input bg-card px-3" value={draft.size ?? ''} onChange={(event) => field('size', event.target.value)} /></label>
        <label className="block space-y-1 text-sm">Поставщик<input disabled={Boolean(draft.consignment_operation_id)} className="w-full rounded-lg border border-input bg-card px-3" value={draft.supplier_name ?? ''} onChange={(event) => field('supplier_name', event.target.value)} /></label>
        <label className="block space-y-1 text-sm">Телефон поставщика<input disabled={Boolean(draft.consignment_operation_id)} className="w-full rounded-lg border border-input bg-card px-3" value={draft.supplier_phone ?? ''} onChange={(event) => field('supplier_phone', event.target.value)} /></label>
        <label className="block space-y-1 text-sm">Описание<textarea className="min-h-24 w-full rounded-lg border border-input bg-card p-3" value={draft.description ?? ''} onChange={(event) => field('description', event.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Отмена</Button><Button type="submit" disabled={busy || !online}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div>
      </form>
    </div>}
    {deleting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4"><section role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-5"><h2 id="delete-title">Удалить «{deleting.name}»?</h2>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Отмена</Button><Button variant="destructive" disabled={busy || !online} onClick={() => void remove()}>Удалить</Button></div></section></div>}
    {scanner && <BarcodeScannerModal onClose={() => setScanner(false)} onScan={(code) => { setQuery(parseQrCode(code).sku || code.trim()); setPage(1); setScanner(false); }} />}
  </div>;
}
