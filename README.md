# Aura Gold CRM

Next.js CRM for jewelry stores, backed by Supabase.

## Deploy to Supabase + Vercel

### 1. Create the database

Create a **new Supabase project**, open **SQL Editor**, and run `supabase/schema.sql` once. This file contains the CRM-owned tables, functions, indexes, security policies, the profile-creation trigger, the public `product-images` bucket, and realtime table setup. Supabase-managed `auth`, `storage`, and `realtime` internals are intentionally not recreated.

The schema is a one-time bootstrap, not an incremental migration. Do not run it against a database that already has the CRM tables.

### 2. Configure Supabase Auth

In **Authentication → URL Configuration**, set the Site URL to the deployed app origin and add this redirect URL:

```text
https://YOUR_DEPLOYMENT_DOMAIN/auth/callback
```

For local development, add `http://localhost:8080/auth/callback` as an additional redirect URL.

### 3. Configure the app environment

Copy `.env.example` to `.env.local` for local development, then fill in the values from **Supabase → Project Settings → API**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key |
| `NEXT_PUBLIC_SITE_URL` | App origin, such as `https://YOUR_DEPLOYMENT_DOMAIN` |

These are the only application environment variables referenced by the app. Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or commit real credentials.

### 4. Build and deploy

Use Node.js 20.9 or newer. The repository includes both npm and Bun lockfiles; for Vercel, select **npm** and keep `package-lock.json` as the install lockfile.

```bash
npm ci
npm run build
npm start
```

For Vercel, import this folder as a Next.js project, add the three environment variables above for the Production environment (and Preview if needed), then deploy. Vercel detects the existing `next build` configuration automatically.

## Database notes

- `supabase/schema.sql` replaces the former migration directory as the single SQL bootstrap.
- It applies the seller sales-read shop boundary, the shop/customer receipt-history index, and shop-folder-restricted product-image uploads.
- Exact duplicate product, sales client-operation, and supplier-operation indexes were removed; one canonical equivalent index for each query pattern remains.
- Existing product image URLs are not changed.
