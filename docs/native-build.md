# GOLDUCHET native build

The web CRM remains the existing Next.js + Supabase server-rendered app. The native
bundle is a separate **Next.js static-export entry point** under `native/`; it is
not a replacement framework and is not used by the website.

## Native behavior

- Capacitor opens its bundled local page. It does not require `golduchet.com` to
  render the cashier.
- The first sign-in requires a network connection. After sign-in, the approved
  profile and business data are read from the existing IndexedDB cache.
- The cashier writes sales and stock changes to the existing local database and
  outbox. The existing sync engine submits operations to Supabase when the device
  reconnects; server idempotency continues to use `client_op_id`.
- Native Supabase auth is stored through `@capacitor/preferences`. The offline
  profile remains in IndexedDB, but native refresh/access tokens are not copied
  there.
- Native tabs currently expose the cashier, local recent sales, stock, customers,
  and sync status. Server-only administration and reporting stay on the web CRM;
  they are not represented as working offline features.
- The native entry point does not register the web service worker.

## Build

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the build
environment, then run:

```sh
npm ci
npm run build:native
```

The static bundle is copied to `out/`; the build creates the Android platform once
if it is missing, then Capacitor syncs the bundle into iOS and Android.
Do not put a Supabase service-role key in the app; only the public anon/publishable
key belongs in a client bundle, with RLS enabled for every accessed table.

For live-reload development only, set `CAPACITOR_DEV_SERVER_URL` to a local
development URL before running Capacitor. It is not part of production config.

## Supabase/API networking

When Supabase or a custom API enforces origin allowlists, permit the Capacitor
origins used by the platform: `capacitor://localhost` (iOS) and
`https://localhost` (Android). Validate the project’s RLS policies for profiles,
products, sales, cash operations, customers, rates, returns, and any other table
enabled in native sync before distributing the app.

## Remaining native scope

The website keeps all existing server-rendered CRM routes and Server Actions.
The native bundle intentionally does not import those routes because static
Capacitor assets cannot execute Next.js Server Actions, `cookies()`, middleware,
or server-side profile loaders. Extending native access to administration,
reports, supplier operations, and other web-only workflows requires client-safe
Supabase/RLS or authenticated API implementations for those specific workflows.
