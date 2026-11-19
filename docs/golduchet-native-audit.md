# GOLDUCHET CRM — native/offline audit

## Scope reviewed

Reviewed the Next.js route structure, Capacitor launch configuration, Supabase
browser authentication, IndexedDB local CRM cache, sale outbox/idempotency path,
service-worker startup behavior, scanner platform checks, mobile viewport/safe
areas, and the existing Node regression tests.

## Findings and changes

1. **Native startup depended on the website.** Capacitor used a production
   `server.url` for `golduchet.com`, so a network outage prevented the app shell
   from opening. Production now loads a local static Next.js bundle; a remote URL
   is available only through the explicit `CAPACITOR_DEV_SERVER_URL` development
   setting.
2. **The existing offline data layer was already substantial.** IndexedDB,
   shop-scoped records, queued/idempotent sales, retryable outbox operations, and
   logout protection were present. They remain in place and are reused by the
   new native cashier rather than replaced.
3. **Native auth had no dedicated preference storage.** Capacitor now uses
   Supabase's browser client with a Preferences-backed auth store. The offline
   profile stays in IndexedDB, but native auth tokens are not copied into that
   profile record. The previous web client and cookie behavior are unchanged.
4. **There was no static-export entry isolated from server-only CRM routes.**
   The existing CRM pages use `cookies()`, server profile loading, middleware,
   and Server Actions, which cannot run as local static Capacitor assets. A
   separate Next.js static entry was added under `native/`; the website routes
   and Server Actions were not removed or migrated.
5. **Native scanning was iOS-only.** The existing ML Kit scanner is now enabled
   on both iOS and Android when its native plugin is available, with a throttled
   light haptic response.
6. **Mobile launch and interaction gaps were addressed.** The native entry has
   safe-area-aware layout, a bottom tab bar, touch-sized controls, 16px inputs,
   native status bar/keyboard/splash handling, network events, and Android back
   button handling.

## Native feature boundary

The packaged native interface supports first-time online sign-in, cached
offline startup, point-of-sale checkout into the existing outbox, local recent
sales, stock/customer views, barcode/QR scanning, and background sync.
Server-only administration, supplier, reporting, and other advanced workflows
remain available in the existing website CRM and have not been claimed as
offline-native features.

## Deployment checks still required

- Build with the real `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the deployment environment. Do not embed a
  service-role key in a mobile client.
- Allow `capacitor://localhost` and `https://localhost` in Supabase or custom API
  origin allowlists where those are enforced.
- Verify the live project's RLS policies and schema migrations for the tables
  used by native sync, then test a sale/retry against that project.
- Test the generated iOS and Android apps on physical devices; no device, live
  Supabase project, or deployment credentials were included with the source ZIP.

## Verification performed

- All 108 existing and added Node regression tests pass, including the lockfile
  portability test and offline startup/outbox regressions.
- `node --check` passes for the native build script and native Next.js config.
- `npm audit` allowed non-breaking lockfile updates that removed the reported
  high-severity dependency findings. Four moderate advisories remain through
  `shadcn → ts-morph → @ts-morph/common → minimatch`; npm only offers a breaking
  `shadcn@1.0.0` upgrade, so that upgrade was not forced.
- A complete dependency install/TypeScript check/Next.js static build could not
  be completed in the 1.5 GiB sandbox: `npm ci` was terminated for memory use,
  and a serialized retry remained stalled. Therefore the native production
  build and device behavior still need verification in a normal build
  environment.
