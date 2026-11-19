"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  AlertCircle,
  Check,
  Cloud,
  CloudOff,
  LogOut,
  UserRound,
  Package,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingCart,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { getOutboxStatusSummary } from "@/lib/local-db/outbox";
import { getSavedUserSession, saveUserSession } from "@/lib/local-db/db";
import { formatSom } from "@/lib/format";
import { useLocalCrm } from "@/lib/local-db/use-local-crm";
import { parseQrCode } from "@/lib/qr-code";
import type { Customer, Product, Profile, Sale } from "@/lib/types";
import { Button } from '@/components/ui/button';
import { CabinetProfileCard } from '@/components/screens/kabinet/profile-card';
import { RevisionsScreen } from '@/components/screens/revisions';
import { UnsyncedLogoutError } from '@/lib/offline-policy';
import { ClipboardCheck } from 'lucide-react';
import { NativeInventory } from './native-inventory';
import { logoutDeviceAccount, restoreDeviceProfile } from '@/lib/local-db/device-logout';
import { createClient, prepareDeviceSignIn, markDeviceSignedIn, clearDeviceAuth } from "@/lib/supabase/client";
import { getSyncState, subscribeSyncState, type SyncProgressState } from "@/lib/local-db/sync-store";
import { syncEngine } from "@/lib/sync/sync-engine";

type NativeScreen = "pos" | "sales" | "stock" | "customers" | "sync" | "cabinet" | "revisions";

const EMPTY_PROFILE: Profile = {
  id: "",
  full_name: null,
  shop_name: null,
  shop_id: null,
  phone: null,
  requested_role: null,
  role: null,
  status: "pending",
  bonus_points: 0,
  created_at: "",
};

function getProductPrice(product: Product): number {
  const direct = Number(product.sale_price);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const perGram = Number(product.price_per_gram_sale);
  const weight = Number(product.weight);
  return Number.isFinite(perGram * weight) ? perGram * weight : 0;
}

function networkMessage(error: unknown): string {
  const value = error as { code?: string; status?: number } | null;
  if (value?.code === "invalid_credentials") return "Неверный email или пароль.";
  if (value?.code === "email_not_confirmed") return "Сначала подтвердите email по ссылке из письма.";
  if (value?.status === 429) return "Слишком много попыток. Подождите немного.";
  return "Не удалось войти. Проверьте соединение и данные аккаунта.";
}

function NativeLogin({
  online,
  onAuthenticated,
}: {
  online: boolean;
  onAuthenticated: (profile: Profile) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!online) {
      setError("Первый вход требует подключения к интернету.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      prepareDeviceSignIn();
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError || !data.user) throw signInError || new Error("No user");

      const { data: account, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      if (profileError || !account) throw profileError || new Error("Profile not found");
      if (account.status !== "approved" || !account.role || !account.shop_id) {
        throw new Error("Аккаунт ожидает подтверждения или не привязан к магазину.");
      }

      const profile = { ...account, email: data.user.email ?? email.trim() } as Profile;
      await saveUserSession({
        userId: profile.id,
        email: profile.email ?? undefined,
        profile,
        shopId: profile.shop_id ?? undefined,
        session: data.session,
      });
      await markDeviceSignedIn();
      onAuthenticated(profile);
      setPassword("");
    } catch (loginError) {
      createClient().auth.stopAutoRefresh();
      await clearDeviceAuth();
      setError(networkMessage(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShoppingCart className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-wide">GOLDUCHET</p>
            <p className="text-sm text-muted-foreground">Касса магазина</p>
          </div>
        </div>

        {!online && (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>Для первого входа подключитесь к интернету. После входа касса откроется и без сети.</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring"
              placeholder="mail@golduchet.com"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={busy || !online}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}

function formatSaleDate(sale: Sale): string {
  const date = new Date(sale.created_at);
  return Number.isNaN(date.getTime())
    ? "Дата не указана"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function ProductRow({
  product,
  onClick,
  actionLabel,
}: {
  product: Product;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const price = getProductPrice(product);
  const details = [product.metal, product.weight ? `${product.weight} г` : null, product.sku]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
        <Package className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{product.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{details || "Карточка товара"}</p>
        <p className="mt-1 text-sm font-semibold">{price > 0 ? formatSom(price) : "Цена не указана"}</p>
      </div>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          disabled={price <= 0}
          aria-label={`${actionLabel ?? "Добавить"}: ${product.name}`}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {actionLabel ?? "Добавить"}
        </button>
      )}
    </div>
  );
}

function CustomerRow({ customer }: { customer: Customer }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-medium">{customer.name || "Без имени"}</p>
      <p className="mt-1 text-sm text-muted-foreground">{customer.phone || "Телефон не указан"}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Покупок: {Number(customer.purchase_count) || 0} · Бонусы: {Number(customer.bonus_points) || 0}
      </p>
    </div>
  );
}

export function NativeCrm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [screen, setScreen] = useState<NativeScreen>("pos");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [receiptType, setReceiptType] = useState<"fiscal" | "non_fiscal" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncProgressState>(getSyncState());
  const [outboxSummary, setOutboxSummary] = useState({
    pendingCount: 0,
    needsAttentionCount: 0,
    unresolvedCount: 0,
    lastError: null as string | null,
  });
  const [logoutPrompt, setLogoutPrompt] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const logoutPromptRef = useRef(false);
  const accountGeneration = useRef(0);
  const [exitPrompt, setExitPrompt] = useState(false);
  const screenRef = useRef<NativeScreen>("pos");
  const scannerOpenRef = useRef(false);
  const exitPromptRef = useRef(false);
  const backCountRef = useRef(0);

  const localCrm = useLocalCrm({
    profile: profile ?? EMPTY_PROFILE,
    enabled: Boolean(profile?.id && profile.status === "approved" && profile.shop_id),
  });

  const refreshOutbox = useCallback(async (shopId?: string | null) => {
    if (!shopId) {
      setOutboxSummary({ pendingCount: 0, needsAttentionCount: 0, unresolvedCount: 0, lastError: null });
      return;
    }
    try {
      setOutboxSummary(await getOutboxStatusSummary(shopId));
    } catch {
      // Keep the last known local queue indicator if storage is temporarily busy.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSavedProfile = async () => {
      try {
        const restored = await restoreDeviceProfile();
        if (!restored) return;
        const saved = await getSavedUserSession();
        if (!mounted) return;
        if (saved?.profile?.status === "approved" && saved.profile.role && saved.profile.shop_id) {
          setProfile(saved.profile as Profile);
          void refreshOutbox(saved.shopId ?? saved.profile.shop_id);
          // Migrate an older session into Capacitor Preferences when possible.
          // A failed refresh never blocks the local cashier or clears its profile.
          const legacySession = saved.session;
          if (legacySession?.access_token && legacySession?.refresh_token) {
            void createClient().auth
              .setSession({
                access_token: legacySession.access_token,
                refresh_token: legacySession.refresh_token,
              })
              .then(async ({ data, error }) => {
                if (error || !data.session || !saved.profile) return;
                await saveUserSession({
                  userId: saved.userId,
                  email: saved.email,
                  profile: saved.profile,
                  shopId: saved.shopId,
                  session: data.session,
                });
              })
              .catch(() => {});
          }
        }
      } catch {
        // First launch with an empty or unavailable local database continues to login.
      } finally {
        if (mounted) setSessionLoading(false);
      }
    };
    void loadSavedProfile();
    return () => {
      mounted = false;
    };
  }, [refreshOutbox]);

  useEffect(() => {
    let mounted = true;
    const updateNetwork = (connected: boolean) => {
      if (!mounted) return;
      setOnline(connected);
      syncEngine.handleOnlineState(connected);
    };

    if (Capacitor.isNativePlatform()) {
      let removeNetworkListener: (() => void) | undefined;
      void Network.addListener("networkStatusChange", (status) => updateNetwork(status.connected))
        .then((handle) => {
          removeNetworkListener = () => { void handle.remove(); };
          if (!mounted) removeNetworkListener();
        })
        .catch(() => {});
      void Network.getStatus().then((status) => updateNetwork(status.connected)).catch(() => {});
      return () => {
        mounted = false;
        removeNetworkListener?.();
      };
    }

    const onOnline = () => updateNetwork(true);
    const onOffline = () => updateNetwork(false);
    updateNetwork(typeof navigator !== "undefined" && navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    void StatusBar.setBackgroundColor({ color: "#29233d" }).catch(() => {});
    void Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSyncState(setSyncState);
    const onQueued = () => void refreshOutbox(profile?.shop_id);
    window.addEventListener("aura:outbox_enqueued", onQueued);
    return () => {
      unsubscribe();
      window.removeEventListener("aura:outbox_enqueued", onQueued);
    };
  }, [profile?.shop_id, refreshOutbox]);

  useEffect(() => {
    void refreshOutbox(profile?.shop_id);
  }, [profile?.shop_id, refreshOutbox, syncState.status, syncState.outboxPendingCount]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let removeBackListener: (() => void) | undefined;
    void CapacitorApp.addListener("backButton", () => {
      if (logoutPromptRef.current) {
        setLogoutPrompt(false);
        return;
      }
      if (exitPromptRef.current) {
        exitPromptRef.current = false;
        backCountRef.current = 0;
        setExitPrompt(false);
        return;
      }
      if (scannerOpenRef.current) {
        setScannerOpen(false);
        return;
      }
      if (screenRef.current !== "pos") {
        setScreen("pos");
        return;
      }
      if (backCountRef.current === 0) {
        backCountRef.current = 1;
        return;
      }
      backCountRef.current = 0;
      exitPromptRef.current = true;
      setExitPrompt(true);
    }).then((handle) => {
      removeBackListener = () => { void handle.remove(); };
      if (!active) removeBackListener();
    }).catch(() => {});
    return () => {
      active = false;
      removeBackListener?.();
    };
  }, []);

  useEffect(() => { logoutPromptRef.current = logoutPrompt; }, [logoutPrompt]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    scannerOpenRef.current = scannerOpen;
  }, [scannerOpen]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if ((profile && localCrm.isReady) || (!profile && !sessionLoading)) {
      void SplashScreen.hide().catch(() => {});
    }
  }, [profile, localCrm.isReady, sessionLoading]);

  // A cached profile remains usable during network outages. Refresh it only
  // when the device is online, and replace it only after an approved server read.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const generation = accountGeneration.current;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return;
        const { data: remoteProfile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (profileError || !remoteProfile || cancelled || generation !== accountGeneration.current) return;
        if (remoteProfile.status !== "approved" || !remoteProfile.role || !remoteProfile.shop_id) {
          // Do not silently delete pending transactions when access is revoked.
          // Fence offline entry and stop writes, but retain rows for recovery.
          accountGeneration.current++;
          syncEngine.stop();
          await clearDeviceAuth();
          setProfile(null);
          return;
        }
        const nextProfile = { ...remoteProfile, email: authData.user.email ?? undefined } as Profile;
        await saveUserSession({
          userId: nextProfile.id,
          email: nextProfile.email ?? undefined,
          profile: nextProfile,
          shopId: nextProfile.shop_id ?? undefined,
        });
        if (!cancelled) {
          setProfile(nextProfile);
          void refreshOutbox(nextProfile.shop_id);
        }
      } catch {
        // A failed refresh is not a logout: keep the last approved local profile.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, refreshOutbox]);

  const productsInStock = useMemo(
    () => localCrm.products.filter((product) => product.status === "in_stock" && !product.deleted_at),
    [localCrm.products],
  );
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return productsInStock.slice(0, 60);
    return productsInStock
      .filter((product) => `${product.name} ${product.sku ?? ""} ${product.metal ?? ""}`.toLocaleLowerCase().includes(query))
      .slice(0, 80);
  }, [productsInStock, search]);
  const cartTotal = cart.reduce((sum, product) => sum + getProductPrice(product), 0);
  const cartIds = useMemo(() => new Set(cart.map((product) => product.id)), [cart]);

  const authenticate = useCallback((nextProfile: Profile) => {
    accountGeneration.current++;
    setProfile(nextProfile);
    setScreen("pos");
    void refreshOutbox(nextProfile.shop_id);
  }, [refreshOutbox]);

  const addToCart = (product: Product, withHaptic = true) => {
    if (cartIds.has(product.id)) return;
    setCart((items) => [...items, product]);
    setCheckoutMessage(null);
    if (withHaptic) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  const checkout = async () => {
    if (!receiptType || !cart.length || checkoutBusy || !localCrm.isReady) return;
    if (cart.some((product) => getProductPrice(product) <= 0)) {
      setCheckoutMessage("У каждого товара в чеке должна быть указана цена.");
      return;
    }
    setCheckoutBusy(true);
    setCheckoutMessage(null);
    try {
      const result = await localCrm.localCheckout({
        items: cart.map((product) => ({
          id: product.id,
          product_id: product.id,
          sku: product.sku,
          kind: "product",
          quantity: 1,
          name: product.name,
          weight: Number(product.weight) || 0,
          metal: product.metal,
          price: getProductPrice(product),
          cost: Number(product.purchase_price) || 0,
        })),
        discount: 0,
        payment_method: paymentMethod,
        customer_name: "",
        customer_phone: "",
        bonus_used: 0,
        receipt_type: receiptType,
      });
      setCart([]);
      setReceiptType(null);
      setCheckoutMessage(
        `Продажа сохранена на устройстве: ${formatSom(Number(result.sale?.final_price) || cartTotal)}. Синхронизация выполнится при подключении.`,
      );
      void refreshOutbox(profile?.shop_id);
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Не удалось сохранить продажу.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  const manualSync = () => {
    if (!online) return;
    syncEngine.triggerSync();
    void refreshOutbox(profile?.shop_id);
  };

  const renderPos = () => (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 rounded-2xl border p-3 text-sm ${online ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
        {online ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
        <span>{online ? "Подключено — очередь синхронизируется в фоне" : "Офлайн — продажи сохраняются на устройстве"}</span>
      </div>

      <div className="flex gap-2">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visibleProducts.length === 1 && !cartIds.has(visibleProducts[0].id)) {
                addToCart(visibleProducts[0]);
              }
            }}
            className="w-full rounded-2xl border border-input bg-card py-3 pl-10 pr-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Название или артикул"
            aria-label="Поиск товара или ввод штрихкода"
          />
        </label>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label="Сканировать штрихкод или QR-код"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-primary"
        >
          <ScanLine className="h-5 w-5" />
        </button>
      </div>

      {!localCrm.isReady ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" role="status">
          Открываем локальную кассу…
        </div>
      ) : productsInStock.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Каталог пока пуст</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {online ? "Нажмите «Синхронизировать», чтобы загрузить товары." : "Подключитесь к интернету и синхронизируйте каталог."}
          </p>
          {online && (
            <button onClick={manualSync} type="button" className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Синхронизировать
            </button>
          )}
        </div>
      ) : visibleProducts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">Совпадений не найдено.</p>
      ) : (
        <div className="space-y-2">
          {visibleProducts.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              actionLabel={cartIds.has(product.id) ? "В чеке" : "Добавить"}
              onClick={cartIds.has(product.id) ? undefined : () => addToCart(product)}
            />
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <section className="sticky bottom-[calc(4.7rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-primary/20 bg-card p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Чек · {cart.length} {cart.length === 1 ? "товар" : "товара"}</p>
              <p className="mt-1 text-lg font-bold">{formatSom(cartTotal)}</p>
            </div>
            <button type="button" onClick={() => setCart([])} className="rounded-lg p-2 text-muted-foreground" aria-label="Очистить чек">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              aria-pressed={paymentMethod === "cash"}
              className={`rounded-xl border px-3 py-2 text-sm ${paymentMethod === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              Наличные
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              aria-pressed={paymentMethod === "card"}
              className={`rounded-xl border px-3 py-2 text-sm ${paymentMethod === "card" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              Карта
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReceiptType("fiscal")}
              aria-pressed={receiptType === "fiscal"}
              className={`rounded-xl border px-3 py-2 text-xs ${receiptType === "fiscal" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              Фискальный чек
            </button>
            <button
              type="button"
              onClick={() => setReceiptType("non_fiscal")}
              aria-pressed={receiptType === "non_fiscal"}
              className={`rounded-xl border px-3 py-2 text-xs ${receiptType === "non_fiscal" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              Нефискальный чек
            </button>
          </div>
          <button
            type="button"
            disabled={!receiptType || checkoutBusy || !localCrm.isReady}
            onClick={() => void checkout()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {checkoutBusy ? "Сохраняем…" : "Оформить продажу"}
          </button>
          {!receiptType && <p className="mt-2 text-center text-xs text-muted-foreground">Выберите тип чека.</p>}
        </section>
      )}
      {checkoutMessage && (
        <p className="rounded-xl border border-border bg-card p-3 text-sm" role="status">
          {checkoutMessage}
        </p>
      )}
      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={(code) => {
            const scanned = parseQrCode(code).sku || code.trim();
            setSearch(scanned);
            const matchingProduct = productsInStock.find(
              (product) => product.sku?.trim().toLocaleLowerCase() === scanned.toLocaleLowerCase(),
            );
            if (matchingProduct && !cartIds.has(matchingProduct.id)) addToCart(matchingProduct, false);
            setScannerOpen(false);
          }}
        />
      )}
    </div>
  );

  const renderSales = () => (
    <div className="space-y-2">
      {localCrm.sales.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          История продаж появится после загрузки данных или первой операции.
        </p>
      ) : localCrm.sales.slice(0, 100).map((sale) => (
        <article key={sale.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{sale.customer_name || sale.seller_name || "Продажа"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatSaleDate(sale)}</p>
            </div>
            <p className="shrink-0 font-semibold">{formatSom(Number(sale.total ?? sale.final_price) || 0)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {sale.sync_status === "pending" ? "Ожидает синхронизации" : "Сохранено"} · {(sale.items ?? []).length} поз.
          </p>
        </article>
      ))}
    </div>
  );

  const handleLogout = async (discardUnsynced = false) => {
    if (loggingOut || checkoutBusy) return;
    setLoggingOut(true);
    setLogoutError(null);
    accountGeneration.current++;
    try {
      await logoutDeviceAccount({ discardUnsynced });
      setCart([]);
      setSearch('');
      setReceiptType(null);
      setCheckoutMessage(null);
      setScreen('pos');
      setLogoutPrompt(false);
      setProfile(null);
    } catch (error) {
      if (error instanceof UnsyncedLogoutError) setDiscardCount(error.count);
      setLogoutError(error instanceof Error ? error.message : 'Не удалось завершить выход.');
      void refreshOutbox(profile?.shop_id);
    } finally { setLoggingOut(false); }
  };

  const renderCabinet = () => profile && (
    <div className="space-y-4">
      <CabinetProfileCard profile={profile} email={profile.email ?? ''} />
      <div className="space-y-2 border-t border-border py-4 text-sm">
        <p>{profile.shop_name ?? 'Магазин'}</p>
        {profile.phone && <p>{profile.phone}</p>}
        <p className="text-muted-foreground">Операций без подтверждения: {outboxSummary.unresolvedCount}</p>
        <Button variant="outline" onClick={() => setScreen('sync')}><Cloud />Синхронизация</Button>
      </div>
      <Button variant="destructive" className="w-full" disabled={checkoutBusy} onClick={() => {
        setDiscardCount(null); setLogoutError(null); setLogoutPrompt(true);
      }}><LogOut />Выйти из системы</Button>
    </div>
  );

  const renderCustomers = () => (
    <div className="space-y-2">
      {localCrm.clients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Клиенты появятся после синхронизации.
        </p>
      ) : localCrm.clients.slice(0, 200).map((customer) => <CustomerRow key={customer.id} customer={customer} />)}
    </div>
  );

  const titles: Record<NativeScreen, string> = {
    pos: "Касса",
    sales: "Продажи",
    stock: "Склад",
    customers: "Клиенты",
    sync: "Синхронизация",
    cabinet: "Кабинет",
    revisions: "Ревизии",
  };
  const tabs: { id: NativeScreen; label: string; icon: typeof ShoppingCart }[] = [
    { id: "pos", label: "Касса", icon: ShoppingCart },
    { id: "sales", label: "Продажи", icon: ReceiptText },
    { id: "stock", label: "Склад", icon: Package },
    { id: "revisions", label: "Ревизии", icon: ClipboardCheck },
    { id: "customers", label: "Клиенты", icon: UsersRound },
    { id: "sync", label: "Синхр.", icon: Cloud },
    { id: "cabinet", label: "Кабинет", icon: UserRound },
  ];

  if (sessionLoading) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6 text-sm text-muted-foreground" role="status">
        Подготавливаем GOLDUCHET…
      </main>
    );
  }
  if (!profile) return <NativeLogin online={online} onAuthenticated={authenticate} />;

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">GOLDUCHET</p>
            <p className="truncate text-xs text-muted-foreground">{profile.full_name || profile.email || profile.shop_name || "Магазин"}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {online ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
            <span>{online ? "Онлайн" : "Офлайн"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          {screen !== "revisions" && <h1 className="text-xl font-semibold">{titles[screen]}</h1>}
          {screen === "sync" && (
            <button
              type="button"
              onClick={manualSync}
              disabled={!online}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Синхронизировать
            </button>
          )}
        </div>

        {screen === "pos" && renderPos()}
        {screen === "sales" && renderSales()}
        {screen === "stock" && <NativeInventory profile={profile} products={localCrm.products}
          online={online} ready={localCrm.isReady} onSave={localCrm.localSaveProduct} onDelete={localCrm.localDeleteProduct} />}
        {screen === "revisions" && <RevisionsScreen products={localCrm.products} shopId={profile.shop_id} productsReady={localCrm.isReady} />}
        {screen === "cabinet" && renderCabinet()}
        {screen === "customers" && renderCustomers()}
        {screen === "sync" && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              {online ? <Cloud className="mt-0.5 h-5 w-5 text-emerald-500" /> : <CloudOff className="mt-0.5 h-5 w-5 text-amber-500" />}
              <div>
                <p className="font-medium">{syncState.phaseLabel}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {online ? "Изменения отправляются в фоне." : "Локальные операции сохраняются до восстановления сети."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">В очереди</p>
                <p className="mt-1 text-lg font-semibold">{outboxSummary.pendingCount}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Требуют внимания</p>
                <p className="mt-1 text-lg font-semibold">{outboxSummary.needsAttentionCount}</p>
              </div>
            </div>
            {outboxSummary.lastError && (
              <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{outboxSummary.lastError}</span>
              </p>
            )}
            {syncState.lastSuccessAt && (
              <p className="text-xs text-muted-foreground">
                Последняя успешная синхронизация: {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(syncState.lastSuccessAt))}
              </p>
            )}
          </section>
        )}
      </main>

      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-7 px-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              aria-current={screen === id ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] ${screen === id ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {logoutPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="logout-title" className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-5">
            <h2 id="logout-title" className="font-semibold">{discardCount !== null ? "Данные будут стёрты навсегда" : "Выйти из учётной записи?"}</h2>
            <p className="text-sm text-muted-foreground">{discardCount !== null ? `Не синхронизировано операций: ${discardCount}. Эти данные будут стёрты навсегда, не попадут на сервер и не смогут быть восстановлены. Вы согласны?` : "Локальные данные будут очищены. Для повторного входа нужен интернет."}</p>
            {logoutError && <p role="alert" className="text-sm text-destructive">{logoutError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" disabled={loggingOut} onClick={() => setLogoutPrompt(false)}>Отмена</Button>
              <Button variant="destructive" disabled={loggingOut} onClick={() => void handleLogout(discardCount !== null)}><LogOut />{loggingOut ? 'Выходим…' : discardCount !== null ? 'Стереть данные и выйти' : 'Выйти'}</Button>
            </div>
          </section>
        </div>
      )}

      {exitPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <h2 className="font-semibold">Закрыть GOLDUCHET?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Синхронизация продолжится при следующем открытии. Локальные продажи останутся в очереди.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  exitPromptRef.current = false;
                  setExitPrompt(false);
                }}
                className="flex-1 rounded-xl border border-border px-3 py-2.5"
              >
                Остаться
              </button>
              <button
                type="button"
                onClick={() => void CapacitorApp.exitApp()}
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 font-semibold text-primary-foreground"
              >
                Закрыть
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
