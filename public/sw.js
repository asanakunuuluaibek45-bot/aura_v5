/**
 * Service Worker for Aura CRM.
 *
 * What is cached
 * --------------
 * 1. Same-origin HTML shells for the CRM routes. Next.js can return a server error
 *    when its Supabase auth check cannot reach the cloud; these shells let the
 *    already-installed CRM boot from its IndexedDB copy instead.
 * 2. Static build assets (JS/CSS/fonts/icons), including chunks referenced by the
 *    pre-cached HTML. That makes a hard refresh work after the first online visit.
 *
 * Privacy / scope
 * ---------------
 * CRM HTML can contain the initial server-rendered account data. It is cached only
 *    on this browser profile, and the application clears its caches on logout and
 *    drops route shells when the active shop changes. Supabase API responses are
 *    still network-only. The editable offline business data and pending writes live
 *    in IndexedDB, which is also wiped on logout and isolated by shop.
 *
 * Cache invalidation
 * ------------------
 * - Cache names carry a version; one previous version is retained as an update
 *   fallback in case the new worker installs while the server is unreachable.
 * - Shell documents use network-first with a short timeout, so a fresh deploy or a
 *   changed shell is picked up as soon as the network allows, and the cached copy is
 *   only a fallback.
 * - Static assets are immutable build artifacts (content-hashed) → cache-first.
 * - On logout the page posts AURA_LOGOUT_CLEANUP and every cache is dropped.
 */

const VERSION = 'offline-labels-20261119-v5'
const SHELL_CACHE = `aura-crm-shell-${VERSION}`
const STATIC_CACHE = `aura-crm-static-${VERSION}`
const STATE_CACHE = `aura-crm-state-${VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE]
const CACHE_STAMP_KEY = new URL('/__aura_cache_created__', self.location.origin).href
const CLOUD_FAILURE_KEY = new URL('/__aura_cloud_unreachable__', self.location.origin).href

/** Network-first timeout for navigations: fast enough to feel instant offline. */
const NAV_TIMEOUT_MS = 3500
const PRECACHE_TIMEOUT_MS = 5000

// Shell routes pre-cached so the app boots interactive without a network.
const PRECACHE_SHELL_URLS = [
  '/crm/pos',
  '/pos',
  '/',
  '/crm',
  '/crm/inventory',
  '/inventory',
  '/crm/revisions',
  '/revisions',
  '/crm/showcase',
  '/showcase',
  '/crm/customers',
  '/customers',
  '/crm/stores',
  '/stores',
  '/crm/notifications',
  '/notifications',
  '/crm/suppliers',
  '/suppliers',
  '/crm/cabinet',
  '/cabinet',
  '/crm/reports',
  '/reports',
  '/manifest.json',
  '/manifest.webmanifest',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/icon.svg',
  '/golduchet-icon-transparent.svg',
  '/apple-icon.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
]

// Every JS/CSS file of the build, filled in by scripts/precache-sw.mjs after
// `next build`. Lazy chunks (barcode scanner, label editor, sales history…) are
// not referenced from the HTML, so without this list they were missing offline
// and opening them showed the "no connection" screen (ChunkLoadError).
const PRECACHE_ASSETS = [] // AURA_PRECACHE_ASSETS

async function precacheBuildAssets() {
  if (!PRECACHE_ASSETS.length) return
  const staticCache = await caches.open(STATIC_CACHE)
  const oldNames = (await caches.keys()).filter((k) => k.startsWith('aura-crm-static-') && k !== STATIC_CACHE)
  const queue = [...PRECACHE_ASSETS]
  const worker = async () => {
    while (queue.length) {
      const href = new URL(queue.shift(), self.location.origin).href
      try {
        if (await staticCache.match(href)) continue
        // Hashed build files never change: reuse a copy from an older cache first.
        let copied = false
        for (const name of oldNames) {
          const old = await (await caches.open(name)).match(href)
          if (old) { await staticCache.put(href, old); copied = true; break }
        }
        if (copied) continue
        const res = await fetchWithTimeout(href, { credentials: 'same-origin' }, 20000)
        if (res?.status === 200 && !isPrivateResponse(res)) await staticCache.put(href, res)
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}

const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#29233d">
<title>GOLDUCHET — офлайн</title>
<style>:root{color-scheme:dark;--bg:#1c1830;--card:#29233d;--text:#f3f1f7;--muted:#b2acbf;--accent:#c9a227}
:root[data-theme="light"]{color-scheme:light;--bg:#fbfaff;--card:#fff;--text:#302d3d;--muted:#696579;--accent:#7055d9}
@media(prefers-color-scheme:light){:root:not([data-theme]){color-scheme:light;--bg:#fbfaff;--card:#fff;--text:#302d3d;--muted:#696579;--accent:#7055d9}}
*{box-sizing:border-box}html,body{min-height:100%;overscroll-behavior:none}body{margin:0;min-height:100vh;min-height:100svh;min-height:100dvh;padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:var(--bg);color:var(--text)}div{text-align:center;max-width:420px;padding:24px;border-radius:20px;background:var(--card)}p{color:var(--muted);line-height:1.5}button{margin-top:16px;padding:12px 18px;border:0;border-radius:8px;background:var(--accent);color:#1a1a1a;font-weight:600}</style>
</head><body><div>
<h1>Нет подключения</h1>
<p>Для первого запуска и загрузки каталога нужен интернет. После входа и первичной загрузки откройте кассу повторно.</p>
<button onclick="location.reload()">Повторить</button>
</div><script>try{var s=localStorage.getItem("aura-theme"),t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;document.querySelector('meta[name="theme-color"]').content=t==="dark"?"#29233d":"#fbfaff"}catch(e){}</script></body></html>`

// ---------------------------------------------------------------------------
// Install / activate
// ---------------------------------------------------------------------------

function shellCacheKey(pathname) {
  pathname = pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
  return new Request(new URL(pathname, self.location.origin).href, {
    method: 'GET',
    credentials: 'same-origin',
  })
}

async function fetchWithTimeout(input, options = {}, timeoutMs = PRECACHE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function isCacheableShell(response, url) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false
  if (url.origin !== self.location.origin) return false
  const finalUrl = new URL(response.url || url.href)
  // A protected route may redirect to the login screen when the server-side auth
  // lookup cannot reach Supabase. Never save that login page over the CRM shell.
  if (finalUrl.pathname.startsWith('/auth/')) return false
  return (response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')
}

async function cacheBuildAssetsFromHtml(response, staticCache) {
  try {
    const html = await response.text()
    const references = new Set()
    const pattern = /(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g
    for (const match of html.matchAll(pattern)) {
      try {
        const assetUrl = new URL(match[1].replace(/&amp;/g, '&'), self.location.origin)
        if (assetUrl.origin === self.location.origin && assetUrl.pathname.startsWith('/_next/static/')) {
          references.add(assetUrl.href)
        }
      } catch {}
    }

    await Promise.all(
      [...references].map(async (assetUrl) => {
        try {
          if (await staticCache.match(assetUrl)) return
          const asset = await fetchWithTimeout(assetUrl, { credentials: 'same-origin', cache: 'reload' })
          if (asset?.status === 200 && !isPrivateResponse(asset)) {
            await staticCache.put(assetUrl, asset)
          }
        } catch {}
      })
    )
  } catch {}
}

async function cacheShellDocument(cache, staticCache, pathname, response) {
  // A followed trailing-slash redirect has redirected=true, which Chromium
  // rejects as a navigation fallback with redirect mode "manual".
  const shell = response.redirected
    ? new Response(await response.clone().arrayBuffer(), { status: response.status, headers: response.headers })
    : response.clone()
  await cache.put(shellCacheKey(pathname), shell)
  // The clone is consumed separately so the HTML response can still be returned.
  await cacheBuildAssetsFromHtml(response.clone(), staticCache)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all([SHELL_CACHE, STATIC_CACHE].map(stampCache))
      const cache = await caches.open(SHELL_CACHE)
      const staticCache = await caches.open(STATIC_CACHE)
      for (const url of PRECACHE_SHELL_URLS) {
        try {
          // cache: 'reload' so a new version never precaches a stale HTTP-cached shell.
          // The cashier shell is server-rendered and can be slow: give it more time.
          const timeout = ESSENTIAL_SHELLS.includes(url) ? 15000 : PRECACHE_TIMEOUT_MS
          const res = await fetchWithTimeout(url, { credentials: 'same-origin', cache: 'reload' }, timeout)
          const parsedUrl = new URL(url, self.location.origin)
          if (isCacheableShell(res, parsedUrl)) {
            await cacheShellDocument(cache, staticCache, parsedUrl.pathname, res)
          } else if (res?.status === 200 && isStaticAsset(parsedUrl) && !isPrivateResponse(res)) {
            await staticCache.put(parsedUrl.href, res)
          }
        } catch (err) {
          // A single missing route must not fail the whole install.
        }
      }
      await precacheBuildAssets()
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await loadCacheStamps(keys)
      // Never lose the offline cashier on update: keep older shells the new
      // install could not fetch (slow server, auth redirect, offline install).
      await carryOverShells(keys.filter((key) => key.startsWith('aura-crm-shell-') && key !== SHELL_CACHE))
      const previousShell = newestPreviousCache(keys, 'aura-crm-shell-')
      const previousStatic = newestPreviousCache(keys, 'aura-crm-static-')
      const previousState = newestPreviousCache(keys, 'aura-crm-state-')
      const keep = new Set([...CURRENT_CACHES, previousShell, previousStatic, previousState].filter(Boolean))
      const obsoleteAuraCaches = keys.filter(
        (key) => key.startsWith('aura-crm-') && !keep.has(key),
      )
      await Promise.all(obsoleteAuraCaches.map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

function newestPreviousCache(keys, prefix) {
  return keys
    .filter((key) => key.startsWith(prefix) && !CURRENT_CACHES.includes(key))
    .sort((a, b) => cacheVersion(b, prefix) - cacheVersion(a, prefix))[0] || null
}

// Build versions are "<sha>-<base36 time>" and cannot be ordered by digits.
// Each cache keeps its creation time under CACHE_STAMP_KEY; caches are ordered by it.
const cacheStamps = new Map()
async function stampCache(name) {
  const cache = await caches.open(name)
  if (!(await cache.match(CACHE_STAMP_KEY))) {
    await cache.put(CACHE_STAMP_KEY, new Response(String(Date.now()), { headers: { 'Content-Type': 'text/plain' } }))
  }
}
async function loadCacheStamps(keys) {
  for (const key of keys) {
    if (!key.startsWith('aura-crm-')) continue
    try {
      const res = await (await caches.open(key)).match(CACHE_STAMP_KEY)
      cacheStamps.set(key, res ? Number(await res.text()) || 0 : 0)
    } catch { cacheStamps.set(key, 0) }
  }
}
function cacheVersion(name, prefix) {
  if (CURRENT_CACHES.includes(name) || name === STATE_CACHE) return Number.MAX_SAFE_INTEGER
  return cacheStamps.get(name) || 0
}

// Shells the cashier needs offline. Re-fetched after shop switches and on request.
const ESSENTIAL_SHELLS = ['/crm/pos', '/pos', '/crm', '/crm/inventory', '/crm/cabinet', '/crm/revisions']

async function warmShells(paths) {
  const cache = await caches.open(SHELL_CACHE)
  const staticCache = await caches.open(STATIC_CACHE)
  for (const path of paths) {
    try {
      const url = new URL(path, self.location.origin)
      const res = await fetchWithTimeout(url.href, { credentials: 'same-origin', cache: 'reload' }, 15000)
      if (isCacheableShell(res, url)) await cacheShellDocument(cache, staticCache, url.pathname, res)
    } catch {}
  }
}

/** Copy shells missing from the new cache out of older caches before they are deleted. */
async function carryOverShells(oldNames) {
  const cache = await caches.open(SHELL_CACHE)
  for (const name of oldNames) {
    try {
      const old = await caches.open(name)
      for (const req of await old.keys()) {
        if (req.url === CACHE_STAMP_KEY) continue
        if (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) continue
        const res = await old.match(req)
        if (res) await cache.put(req, res)
      }
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Messages from the app
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  const data = event.data || {}

  if (data.type === 'AURA_SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type === 'AURA_CLOUD_UNREACHABLE' || data.type === 'AURA_CLOUD_REACHABLE') {
    event.waitUntil(updateCloudReachability(data.type === 'AURA_CLOUD_UNREACHABLE'))
    return
  }

  // Logout / account switch: remove every cached byte this worker owns.
  if (data.type === 'AURA_LOGOUT_CLEANUP') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys()
        await Promise.all(keys.filter((key) => key.startsWith('aura-crm-')).map((key) => caches.delete(key)))
        const clients = await self.clients.matchAll({ includeUncontrolled: true })
        for (const client of clients) {
          client.postMessage({ type: 'AURA_CACHES_CLEARED' })
        }
      })()
    )
    return
  }

  // Shop switch: cached server-rendered shells may contain shop-specific props.
  if (data.type === 'AURA_SHOP_CHANGED') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys()
        await Promise.all(
          keys.filter((key) => key.startsWith('aura-crm-shell-')).map((key) => caches.delete(key)),
        )
        // Immediately re-save the cashier for the new shop so it still opens offline.
        await stampCache(SHELL_CACHE)
        await warmShells(ESSENTIAL_SHELLS)
        await precacheBuildAssets()
      })(),
    )
    return
  }

  // Page asks to (re)save the offline shells, e.g. after login or app start.
  if (data.type === 'AURA_WARM_SHELLS') {
    event.waitUntil(warmShells(ESSENTIAL_SHELLS).then(precacheBuildAssets))
  }
})

// ---------------------------------------------------------------------------
// Fetch routing
// ---------------------------------------------------------------------------

function isPrivateHost(url) {
  return (
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/rest/v1') ||
    url.pathname.startsWith('/auth/v1') ||
    url.pathname.startsWith('/storage/v1') ||
    url.pathname.startsWith('/realtime/v1') ||
    url.pathname.startsWith('/functions/v1') ||
    url.pathname.startsWith('/api/')
  )
}

/** Static files are safe to cache only when they are ordinary public responses. */
function isPrivateResponse(response) {
  if (!response) return true
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return true
  const cacheControl = response.headers.get('Cache-Control') || ''
  if (/no-store|private/i.test(cacheControl)) return true
  if (response.headers.get('Set-Cookie')) return true
  if (response.headers.get('Authorization')) return true
  return false
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.protocol === 'ws:' || url.protocol === 'wss:') return

  // A. Private data and APIs: network-only, never cached, never read from cache.
  if (isPrivateHost(url)) return

  // B. Navigation documents: network-first with timeout, cached shell as fallback.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(handleNavigation(request, url))
    return
  }

  // C. Static build assets: cache-first (content-hashed, safe to keep).
  if (isStaticAsset(url)) {
    event.respondWith(handleStatic(request))
  }
})

async function updateCloudReachability(unreachable) {
  if (unreachable) {
    const cache = await caches.open(STATE_CACHE)
    await cache.put(
      CLOUD_FAILURE_KEY,
      new Response(String(Date.now()), {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
      }),
    )
  } else {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('aura-crm-state-'))
        .map(async (key) => (await caches.open(key)).delete(CLOUD_FAILURE_KEY)),
    )
  }
}

async function cloudWasRecentlyUnreachable() {
  try {
    const keys = await caches.keys()
    await loadCacheStamps(keys)
    const stateCaches = keys
      .filter((key) => key.startsWith('aura-crm-state-'))
      .sort((a, b) => cacheVersion(b, 'aura-crm-state-') - cacheVersion(a, 'aura-crm-state-'))
    for (const cacheName of stateCaches) {
      const response = await (await caches.open(cacheName)).match(CLOUD_FAILURE_KEY)
      if (!response) continue
      const failedAt = Number(await response.text())
      // Keep offline fallback enabled briefly even when the browser's own online flag
      // remains true (for example, Wi-Fi is connected but DNS/Supabase is not).
      if (!Number.isFinite(failedAt) || Date.now() - failedAt > 5 * 60 * 1000) {
        await updateCloudReachability(false)
        return false
      }
      return true
    }
    return false
  } catch {
    return false
  }
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.json' ||
    /\.(js|css|png|jpg|jpeg|svg|ico|woff2|webmanifest)$/.test(url.pathname)
  )
}

async function handleNavigation(request, url) {
  // Static Capacitor exports use trailing slashes; website routes do not.
  url = new URL(url.href)
  url.pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
  const cache = await caches.open(SHELL_CACHE)
  const staticCache = await caches.open(STATIC_CACHE)

  try {
    if (navigator.onLine === false) {
      const fallback = await offlineNavigationFallback(cache, url)
      if (fallback) return fallback
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS)
    let network
    try {
      network = await fetch(request, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (isCacheableShell(network, url)) {
      cacheShellDocument(cache, staticCache, url.pathname, network).catch(() => {})
      return network
    }

    // Some auth SDK versions turn an unreachable auth lookup into a redirect rather
    // than a 5xx. In a browser-known offline state, use the already-cached CRM shell.
    const finalPath = network?.url ? new URL(network.url).pathname : ''
    const authLookupFailed = finalPath.startsWith('/auth/login') && url.pathname.startsWith('/crm/')
    if (authLookupFailed && (!navigator.onLine || await cloudWasRecentlyUnreachable())) {
      const fallback = await offlineNavigationFallback(cache, url)
      if (fallback) return fallback
    }

    // When Next's server-side auth/data checks fail because Supabase is unreachable,
    // prefer the last good document over an error page. Do not mask auth redirects or
    // ordinary 4xx responses (for example, a genuinely missing page).
    if (network && (network.status >= 500 || network.status === 408 || network.status === 429)) {
      const fallback = await offlineNavigationFallback(cache, url)
      if (fallback) return fallback
    }
    return network
  } catch {
    // Offline (or the network is too slow): open the cached cashier first.
    const fallback = await offlineNavigationFallback(cache, url)
    if (fallback) return fallback

    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
}

/**
 * The native app and the installable PWA both launch on /crm/pos. If iOS restores
 * the website root (or a different CRM route) while offline, send the navigation
 * to that known cached route instead of rendering an unrelated cached server page.
 * Logout clears the shell cache, so this fallback only exists for a previously
 * authenticated local profile.
 */
async function offlineNavigationFallback(cache, url) {
  const pathname = url.pathname
  const posPath = '/crm/pos'
  const isPosRoute = pathname === posPath || pathname === '/pos'
  const isCrmRoute =
    pathname === '/crm' ||
    pathname.startsWith('/crm/') ||
    [
      '/pos',
      '/showcase',
      '/inventory',
  '/crm/revisions',
  '/revisions',
      '/customers',
      '/stores',
      '/notifications',
      '/suppliers',
      '/cabinet',
      '/reports',
    ].includes(pathname)
  const localSectionPaths = ['/crm/cabinet', '/cabinet', '/crm/inventory', '/inventory', '/crm/revisions', '/revisions']
  if (localSectionPaths.includes(pathname)) {
    // Exact sections only; never serve a stale reports HTML as an offline screen.
    const canonical = pathname.startsWith('/crm/') ? pathname : `/crm${pathname}`
    const section = await findExactCachedShell(cache, canonical) || await findExactCachedShell(cache, pathname)
    if (section) {
      notifyClients({ type: 'AURA_OFFLINE_SHELL', path: canonical })
      return section
    }
  }
  const shouldOpenCashier =
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    (isCrmRoute && !isPosRoute)

  if (shouldOpenCashier) {
    const cachedPos = await findExactCachedShell(cache, posPath)
    if (cachedPos) {
      notifyClients({ type: 'AURA_OFFLINE_SHELL', path: posPath })
      return Response.redirect(new URL(posPath, self.location.origin), 302)
    }

    // Do not expose a cached reports/inventory page when the cashier shell has
    // not been saved. The generic offline page is safer and more honest.
    if (isCrmRoute) return null
  }

  const cached = await findCachedShell(cache, pathname)
  if (!cached) return null

  notifyClients({ type: 'AURA_OFFLINE_SHELL', path: pathname })
  return cached
}

async function findExactCachedShell(cache, pathname) {
  const keys = await caches.keys()
  await loadCacheStamps(keys)
  const shellCaches = keys
    .filter((key) => key.startsWith('aura-crm-shell-'))
    .sort((a, b) => cacheVersion(b, 'aura-crm-shell-') - cacheVersion(a, 'aura-crm-shell-'))

  for (const cacheName of shellCaches) {
    const candidateCache = cacheName === SHELL_CACHE ? cache : await caches.open(cacheName)
    const match = await candidateCache.match(shellCacheKey(pathname), {
      ignoreSearch: true,
      ignoreVary: true,
    })
    if (match) return match
  }
  return null
}

async function findCachedShell(cache, pathname) {
  const keys = await caches.keys()
  await loadCacheStamps(keys)
  const shellCaches = keys
    .filter((key) => key.startsWith('aura-crm-shell-'))
    .sort((a, b) => cacheVersion(b, 'aura-crm-shell-') - cacheVersion(a, 'aura-crm-shell-'))
  const legacyCrmRoutes = new Set([
    '/pos',
    '/showcase',
    '/inventory',
  '/crm/revisions',
  '/revisions',
    '/customers',
    '/stores',
    '/notifications',
    '/suppliers',
    '/cabinet',
    '/reports',
  ])
  const isCrmRoute = pathname === '/crm' || pathname.startsWith('/crm/') || legacyCrmRoutes.has(pathname)
  const lookupPaths = [pathname]
  if (isCrmRoute) lookupPaths.push('/crm/pos', '/crm')

  // Prefer the exact route from any retained version before falling back to the
  // POS shell. A new cache may be only partially populated during an offline update.
  for (const path of lookupPaths) {
    for (const cacheName of shellCaches) {
      const candidateCache = cacheName === SHELL_CACHE ? cache : await caches.open(cacheName)
      const match = await candidateCache.match(shellCacheKey(path), {
        ignoreSearch: true,
        ignoreVary: true,
      })
      if (match) return match
    }
  }
  return null
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const cacheNames = await caches.keys()
  const previousCaches = cacheNames
    .filter((key) => key.startsWith('aura-crm-static-') && key !== STATIC_CACHE)
    .sort((a, b) => cacheVersion(b, 'aura-crm-static-') - cacheVersion(a, 'aura-crm-static-'))
  for (const cacheName of previousCaches) {
    const previous = await (await caches.open(cacheName)).match(request)
    if (previous) return previous
  }

  try {
    const network = await fetch(request)
    if (network && network.status === 200 && !isPrivateResponse(network)) {
      cache.put(request, network.clone()).catch(() => {})
    }
    return network
  } catch (err) {
    if (cached) return cached
    throw err
  }
}

async function notifyClients(message) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    for (const client of clients) client.postMessage(message)
  } catch {}
}
