BEGIN;

-- A product keeps its original shop_id for QR identity. Stock reads and
-- mutations follow the server-controlled current_location_shop_id instead.
DROP POLICY IF EXISTS "products: admin delete" ON public.products;
CREATE POLICY "products: admin delete" ON public.products
  FOR DELETE TO authenticated
  USING (
    public.is_shop_admin()
    AND public.has_branch_access(public.current_shop_id())
    AND current_location_shop_id = public.current_shop_id()
  );

DROP POLICY IF EXISTS "products: shop insert" ON public.products;
CREATE POLICY "products: shop insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved()
    AND public.has_branch_access(public.current_shop_id())
    AND shop_id = public.current_shop_id()
    AND current_location_shop_id = public.current_shop_id()
    AND EXISTS (
      SELECT 1
      FROM public.shop_settings AS s
      WHERE s.shop_id = public.current_shop_id()
        AND s.business_id = products.business_id
    )
  );

DROP POLICY IF EXISTS "products: shop read" ON public.products;
CREATE POLICY "products: shop read" ON public.products
  FOR SELECT TO authenticated
  USING (
    public.is_approved()
    AND public.has_branch_access(public.current_shop_id())
    AND current_location_shop_id = public.current_shop_id()
    AND EXISTS (
      SELECT 1
      FROM public.shop_settings AS s
      WHERE s.shop_id = current_location_shop_id
        AND s.business_id = products.business_id
    )
  );

DROP POLICY IF EXISTS "products: shop update" ON public.products;
CREATE POLICY "products: shop update" ON public.products
  FOR UPDATE TO authenticated
  USING (
    public.is_approved()
    AND public.has_branch_access(public.current_shop_id())
    AND current_location_shop_id = public.current_shop_id()
  )
  WITH CHECK (
    public.is_approved()
    AND public.has_branch_access(public.current_shop_id())
    AND current_location_shop_id = public.current_shop_id()
    AND EXISTS (
      SELECT 1
      FROM public.shop_settings AS s
      WHERE s.shop_id = current_location_shop_id
        AND s.business_id = products.business_id
    )
  );

DROP POLICY IF EXISTS products_consignment_update ON public.products;
CREATE POLICY products_consignment_update ON public.products
  FOR UPDATE TO authenticated
  USING (
    current_location_shop_id = public.current_shop_id()
    AND public.has_branch_access(public.current_shop_id())
    AND public.is_approved()
  )
  WITH CHECK (
    current_location_shop_id = public.current_shop_id()
    AND public.has_branch_access(public.current_shop_id())
    AND public.is_approved()
  );

-- This SECURITY DEFINER helper returns only a useful rejection reason. It
-- never returns product data from another business.
CREATE OR REPLACE FUNCTION public.branch_sale_product_failure(
  _product_id uuid,
  _shop_id uuid,
  _fallback_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_approved()
     OR _shop_id IS DISTINCT FROM public.current_shop_id()
     OR NOT public.has_branch_access(_shop_id) THEN
    RAISE EXCEPTION 'Нет доступа к активному филиалу' USING ERRCODE = '42501';
  END IF;

  SELECT s.business_id
    INTO v_business_id
    FROM public.shop_settings AS s
   WHERE s.shop_id = _shop_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Активный филиал не найден' USING ERRCODE = '42501';
  END IF;

  SELECT p.*
    INTO v_product
    FROM public.products AS p
   WHERE p.id = _product_id
     AND p.business_id = v_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'foreign_business',
      'product_id', _product_id,
      'message', 'QR-код не найден в вашем бизнесе. Проверьте товар.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.branch_transfer_items AS i
      JOIN public.branch_transfers AS t
        ON t.id = i.transfer_id AND t.business_id = i.business_id
     WHERE i.product_id = _product_id
       AND i.business_id = v_business_id
       AND i.status = 'in_transit'
       AND t.status = 'in_transit'
       AND t.destination_shop_id = _shop_id
  ) THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'awaiting_receipt',
      'product_id', _product_id,
      'product_name', v_product.name,
      'message', 'Сначала подтвердите получение товара в этом филиале.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.branch_transfer_items AS i
     WHERE i.product_id = _product_id
       AND i.business_id = v_business_id
       AND i.status = 'in_transit'
  ) THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'in_transit',
      'product_id', _product_id,
      'product_name', v_product.name,
      'message', 'Товар уже отправлен и находится в пути.'
    );
  END IF;

  IF v_product.current_location_shop_id IS DISTINCT FROM _shop_id THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'wrong_branch',
      'product_id', _product_id,
      'product_name', v_product.name,
      'message', 'Товар числится в другом филиале.'
    );
  END IF;

  IF v_product.shop_id IS DISTINCT FROM _shop_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.branch_transfer_items AS i
         JOIN public.branch_transfers AS t
           ON t.id = i.transfer_id AND t.business_id = i.business_id
        WHERE i.product_id = v_product.id
          AND i.business_id = v_business_id
          AND i.qr_shop_id = v_product.shop_id
          AND i.status = 'received'
          AND t.status = 'received'
          AND t.destination_shop_id = _shop_id
     ) THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'code', 'receipt_missing',
      'product_id', _product_id,
      'product_name', v_product.name,
      'message', 'В базе нет подтверждения получения товара этим филиалом.'
    );
  END IF;

  RETURN jsonb_build_object(
    'accepted', false,
    'code', 'stock_conflict',
    'product_id', _product_id,
    'product_name', coalesce(v_product.name, _fallback_name, 'Товар'),
    'message', 'Товар уже продан или недоступен. Обновите склад и проверьте чек.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.branch_sale_product_failure(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_sale_product_failure(uuid, uuid, text) TO authenticated;

-- Preserve the existing atomic checkout implementation, duplicate-operation
-- behavior, receipt, customer, cash, and bonus logic. Change only its product
-- branch lookup and delegate a missing-location response to the safe helper.
DO $patch$
DECLARE
  v_definition text;
  v_old_access text := $old$IF NOT FOUND OR v_profile.status::text <> 'approved' OR v_shop_id IS NULL THEN$old$;
  v_new_access text := $new$IF NOT FOUND
     OR v_profile.status::text <> 'approved'
     OR v_shop_id IS NULL
     OR NOT public.has_branch_access(v_shop_id) THEN$new$;
  v_old_not_found text := $pattern$IF NOT FOUND THEN\s+RETURN jsonb_build_object\(\s*'accepted', false,\s*'code', 'stock_conflict',\s*'product_id', v_item_id,\s*'product_name', coalesce\(v_item->>'name', 'Товар'\)\s*\);\s*END IF;$pattern$;
  v_new_not_found text := $new$
IF NOT FOUND THEN
  RETURN public.branch_sale_product_failure(
    v_item_id,
    v_shop_id,
    coalesce(v_item->>'name', 'Товар')
  );
END IF;
$new$;
  v_old_location text := 'AND p.current_location_shop_id = v_shop_id;';
  v_new_location text := $new$
     AND p.current_location_shop_id = v_shop_id
     AND (
       p.shop_id = v_shop_id
       OR EXISTS (
         SELECT 1
           FROM public.branch_transfer_items AS i
           JOIN public.branch_transfers AS t
             ON t.id = i.transfer_id AND t.business_id = i.business_id
          WHERE i.product_id = p.id
            AND i.business_id = p.business_id
            AND i.qr_shop_id = p.shop_id
            AND i.status = 'received'
            AND t.status = 'received'
            AND t.destination_shop_id = v_shop_id
       )
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.branch_transfer_items AS i
        WHERE i.product_id = p.id
          AND i.business_id = p.business_id
          AND i.status = 'in_transit'
     );
$new$;
BEGIN
  v_definition := pg_get_functiondef(
    'public.commit_offline_sale(text,jsonb)'::regprocedure
  );

  IF (length(v_definition) - length(replace(v_definition, 'p.shop_id = v_shop_id', '')))
       / length('p.shop_id = v_shop_id') <> 2 THEN
    RAISE EXCEPTION
      'commit_offline_sale changed; review the branch-aware product lookup patch';
  END IF;
  v_definition := replace(
    v_definition,
    'p.shop_id = v_shop_id',
    'p.current_location_shop_id = v_shop_id'
  );

  IF position(v_old_access IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'commit_offline_sale active-branch guard changed; review migration 022';
  END IF;
  v_definition := replace(v_definition, v_old_access, v_new_access);

  IF position(v_old_location IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'commit_offline_sale product location check changed; review migration 022';
  END IF;
  v_definition := replace(v_definition, v_old_location, v_new_location);

  IF v_definition !~ v_old_not_found THEN
    RAISE EXCEPTION
      'commit_offline_sale conflict response changed; review migration 022';
  END IF;
  v_definition := regexp_replace(v_definition, v_old_not_found, v_new_not_found);

  EXECUTE v_definition;
END;
$patch$;

-- Product deletion is also scoped to the physical active branch. Keep
-- tombstones branch-scoped so the active branch's offline catalog is updated.
CREATE OR REPLACE FUNCTION public.delete_product(_product_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shop_id uuid := public.current_shop_id();
  v_profile public.profiles;
  v_product public.products;
  v_mode text := 'hard';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'approved'::public.profile_status THEN
    RAISE EXCEPTION 'Аккаунт не подтверждён' USING errcode = '42501';
  END IF;
  IF v_shop_id IS NULL OR NOT public.has_branch_access(v_shop_id) THEN
    RAISE EXCEPTION 'Активный филиал не выбран или недоступен' USING errcode = '42501';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = _product_id
     AND current_location_shop_id = v_shop_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.product_deletion_tombstones (shop_id, product_id)
    VALUES (v_shop_id, _product_id)
    ON CONFLICT (shop_id, product_id) DO UPDATE
      SET deleted_at = EXCLUDED.deleted_at;
    RETURN jsonb_build_object('id', _product_id, 'mode', 'missing');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.branch_transfer_items AS i
     WHERE i.product_id = _product_id
       AND i.status = 'in_transit'
  ) THEN
    RAISE EXCEPTION 'Товар в пути нельзя удалить' USING errcode = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.sales AS s
     WHERE s.items @> jsonb_build_array(jsonb_build_object('product_id', _product_id::text))
  ) THEN
    v_mode := 'soft';
  END IF;

  IF v_mode = 'hard' THEN
    BEGIN
      DELETE FROM public.products
       WHERE id = _product_id
         AND current_location_shop_id = v_shop_id;
    EXCEPTION WHEN foreign_key_violation THEN
      v_mode := 'soft';
    END;
  END IF;

  IF v_mode = 'soft' THEN
    UPDATE public.products
       SET deleted_at = now(), updated_at = now()
     WHERE id = _product_id
       AND current_location_shop_id = v_shop_id;
  END IF;

  INSERT INTO public.product_deletion_tombstones (shop_id, product_id)
  VALUES (v_shop_id, _product_id)
  ON CONFLICT (shop_id, product_id)
  DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

  RETURN jsonb_build_object('id', _product_id, 'mode', v_mode);
END;
$$;

COMMIT;
