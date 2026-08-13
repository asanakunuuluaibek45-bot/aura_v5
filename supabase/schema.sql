-- =============================================================================
-- Aura Gold KG — database schema
-- Run once in the Supabase SQL editor of a fresh project.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('seller', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('in_stock', 'reserved', 'sold');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- One row per auth user. shop_id groups everyone working in the same shop.
-- Roles live here only as the *effective* role granted by an admin; every
-- privileged check goes through the security-definer helpers below.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  shop_name      text,
  shop_id        uuid,
  phone          text,
  requested_role text,
  role           public.app_role,
  status         public.profile_status not null default 'pending',
  bonus_points   numeric not null default 0,
  created_at     timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Security-definer helpers: read profile facts without recursing into RLS.
create or replace function public.current_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_shop_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and role in ('admin', 'super_admin')
  )
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  )
$$;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles: read shop" on public.profiles;
create policy "profiles: read shop" on public.profiles
  for select to authenticated
  using (shop_id is not null and shop_id = public.current_shop_id());

-- Self-update is limited to contact details; role/status changes are guarded by
-- the trigger below so a seller cannot promote themselves.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles: admin manages shop" on public.profiles;
create policy "profiles: admin manages shop" on public.profiles
  for update to authenticated
  using (public.is_shop_admin() and shop_id = public.current_shop_id())
  with check (public.is_shop_admin() and shop_id = public.current_shop_id());

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_shop_admin() then
    return new;
  end if;
  -- Bootstrap exception: the first approved member of a shop is auto-promoted
  -- by the app, so allow pending -> admin when the shop has no admin yet.
  if old.status = 'pending' and not exists (
    select 1 from public.profiles
    where shop_id = old.shop_id and status = 'approved' and id <> old.id
  ) then
    return new;
  end if;
  new.role   := old.role;
  new.status := old.status;
  new.shop_id := old.shop_id;
  new.bonus_points := old.bonus_points;
  return new;
end $$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Sign-up metadata (full_name, shop_name, phone, requested_role) becomes a profile.
-- Members joining an existing shop by name reuse its shop_id.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shop_name text := nullif(new.raw_user_meta_data ->> 'shop_name', '');
  v_shop_id   uuid;
begin
  select shop_id into v_shop_id
  from public.profiles
  where shop_name is not distinct from v_shop_name and shop_id is not null
  limit 1;

  insert into public.profiles (id, full_name, shop_name, shop_id, phone, requested_role, status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    v_shop_name,
    coalesce(v_shop_id, gen_random_uuid()),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'requested_role',
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null,
  created_by     uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  category       text,
  metal          text,
  purity         text,
  weight         numeric not null default 0,
  size           text,
  sku            text,
  quantity       integer not null default 1,
  purchase_price numeric not null default 0,
  sale_price     numeric not null default 0,
  image_url      text,
  status         public.product_status not null default 'in_stock',
  created_at     timestamptz not null default now()
);

create index if not exists products_shop_idx on public.products (shop_id, created_at desc);

grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

drop policy if exists "products: shop read" on public.products;
create policy "products: shop read" on public.products
  for select to authenticated
  using (public.is_approved() and shop_id = public.current_shop_id());

drop policy if exists "products: shop insert" on public.products;
create policy "products: shop insert" on public.products
  for insert to authenticated
  with check (public.is_approved() and shop_id = public.current_shop_id());

drop policy if exists "products: shop update" on public.products;
create policy "products: shop update" on public.products
  for update to authenticated
  using (public.is_approved() and shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

-- Deleting stock is an admin action.
drop policy if exists "products: admin delete" on public.products;
create policy "products: admin delete" on public.products
  for delete to authenticated
  using (public.is_shop_admin() and shop_id = public.current_shop_id());

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null,
  name         text,
  phone        text,
  bonus_points numeric not null default 0,
  created_at   timestamptz not null default now()
);

create unique index if not exists customers_shop_phone_idx
  on public.customers (shop_id, phone) where phone is not null;

grant select, insert, update on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;

drop policy if exists "customers: shop access" on public.customers;
create policy "customers: shop access" on public.customers
  for all to authenticated
  using (public.is_approved() and shop_id = public.current_shop_id())
  with check (public.is_approved() and shop_id = public.current_shop_id());

-- -----------------------------------------------------------------------------
-- sales
-- items is a JSONB snapshot of what was sold, so reports stay correct even if
-- a product is later edited or deleted.
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null,
  seller_id      uuid not null references auth.users(id) on delete cascade,
  seller_name    text,
  customer_id    uuid references public.customers(id) on delete set null,
  customer_name  text,
  customer_phone text,
  payment_method text not null default 'cash',
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,
  total          numeric not null default 0,
  cost_total     numeric not null default 0,
  profit         numeric not null default 0,
  bonus_earned   numeric not null default 0,
  bonus_used     numeric not null default 0,
  items          jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists sales_shop_created_idx on public.sales (shop_id, created_at desc);

grant select, insert on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;

-- Sellers see their own receipts; admins see the whole shop (reports screen).
drop policy if exists "sales: seller reads own" on public.sales;
create policy "sales: seller reads own" on public.sales
  for select to authenticated
  using (public.is_approved() and seller_id = auth.uid());

drop policy if exists "sales: admin reads shop" on public.sales;
create policy "sales: admin reads shop" on public.sales
  for select to authenticated
  using (public.is_shop_admin() and shop_id = public.current_shop_id());

drop policy if exists "sales: insert own" on public.sales;
create policy "sales: insert own" on public.sales
  for insert to authenticated
  with check (
    public.is_approved()
    and seller_id = auth.uid()
    and shop_id = public.current_shop_id()
  );
