CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid,
  shop_name text,
  status text NOT NULL,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shop_settings (
  shop_id uuid PRIMARY KEY,
  shop_name text,
  seq_id integer
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL DEFAULT 'Test product',
  sku text,
  status text NOT NULL DEFAULT 'in_stock',
  deleted_at timestamptz
);
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  items jsonb NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.current_shop_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT shop_id FROM public.profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.is_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved') $$;
CREATE FUNCTION public.is_shop_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved' AND role IN ('admin', 'super_admin')) $$;
CREATE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved' AND role = 'super_admin') $$;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
CREATE POLICY profiles_fixture_self_read ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
GRANT SELECT ON public.shop_settings, public.products TO authenticated;
GRANT INSERT, UPDATE ON public.products TO authenticated;
GRANT INSERT, SELECT ON public.sales TO authenticated;
CREATE POLICY "products: shop update" ON public.products
  FOR UPDATE TO authenticated
  USING (shop_id = public.current_shop_id())
  WITH CHECK (shop_id = public.current_shop_id());
CREATE POLICY "products: shop read" ON public.products
  FOR SELECT TO authenticated
  USING (shop_id = public.current_shop_id());
CREATE POLICY "products: shop insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (shop_id = public.current_shop_id());

CREATE FUNCTION public.commit_offline_sale(_client_op_id text, _sale jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_shop_id uuid := public.current_shop_id();
  v_profile public.profiles%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item jsonb := _sale->'items'->0;
  v_item_id uuid := nullif(v_item->>'product_id', '')::uuid;
  v_sale_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.status::text <> 'approved' OR v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступа к магазину' USING ERRCODE = '42501';
  END IF;

  PERFORM p.id
    FROM public.products AS p
   WHERE p.shop_id = v_shop_id
     AND p.id = v_item_id
   ORDER BY p.id
   FOR UPDATE;

  SELECT * INTO v_product
    FROM public.products AS p
   WHERE p.id = v_item_id
     AND p.shop_id = v_shop_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'stock_conflict',
      'product_id', v_item_id,
      'product_name', coalesce(v_item->>'name', 'Товар')
    );
  END IF;

  IF v_product.status <> 'in_stock' OR v_product.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'stock_conflict',
      'product_id', v_product.id,
      'product_name', v_product.name
    );
  END IF;

  UPDATE public.products SET status = 'sold' WHERE id = v_product.id;
  INSERT INTO public.sales (shop_id, product_id, items)
  VALUES (v_shop_id, v_product.id, _sale->'items')
  RETURNING id INTO v_sale_id;
  RETURN jsonb_build_object('accepted', true, 'sale_id', v_sale_id);
END;
$$;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.shop_settings (shop_id, shop_name, seq_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Аура', 1),
  ('22222222-2222-4222-8222-222222222222', 'Другой бизнес', 99);
INSERT INTO public.profiles (id, shop_id, shop_name, status, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Аура', 'approved', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Аура', 'approved', 'seller'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'Другой бизнес', 'approved', 'admin');
INSERT INTO public.products (id, shop_id, created_by) VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('99999999-9999-4999-8999-999999999998', '22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
