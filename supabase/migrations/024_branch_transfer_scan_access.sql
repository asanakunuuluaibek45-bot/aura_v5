BEGIN;
SET LOCAL lock_timeout = '5s';

-- Expose product details only in the scope of an authorized transfer. The
-- destination branch must not receive general read access to source inventory.
CREATE OR REPLACE FUNCTION public.get_branch_transfer_details(_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.branch_transfers%ROWTYPE;
  v_active_shop_id uuid := public.current_shop_id();
  v_source_name text;
  v_destination_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id;
  IF NOT FOUND
     OR v_active_shop_id NOT IN (v_transfer.source_shop_id, v_transfer.destination_shop_id)
     OR NOT public.has_branch_access(v_active_shop_id) THEN
    RAISE EXCEPTION 'Нет доступа к этому перемещению' USING errcode = '42501';
  END IF;

  SELECT s.shop_name INTO v_source_name
  FROM public.shop_settings AS s
  WHERE s.business_id = v_transfer.business_id
    AND s.shop_id = v_transfer.source_shop_id;
  SELECT s.shop_name INTO v_destination_name
  FROM public.shop_settings AS s
  WHERE s.business_id = v_transfer.business_id
    AND s.shop_id = v_transfer.destination_shop_id;

  RETURN jsonb_build_object(
    'transfer_id', v_transfer.id,
    'business_id', v_transfer.business_id,
    'source_shop_id', v_transfer.source_shop_id,
    'source_shop_name', v_source_name,
    'destination_shop_id', v_transfer.destination_shop_id,
    'destination_shop_name', v_destination_name,
    'status', v_transfer.status,
    'created_by', v_transfer.created_by,
    'created_at', v_transfer.created_at,
    'received_by', v_transfer.received_by,
    'received_at', v_transfer.received_at,
    'items', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_id', i.product_id,
            'sku', p.sku,
            'product_name', p.name,
            'status', i.status,
            'qr_shop_id', i.qr_shop_id,
            'qr_shop_seq_id', origin.seq_id,
            'received_at', i.received_at,
            'cancelled_at', i.cancelled_at
          )
          ORDER BY i.product_id
        ),
        '[]'::jsonb
      )
      FROM public.branch_transfer_items AS i
      JOIN public.products AS p
        ON p.id = i.product_id AND p.business_id = i.business_id
      LEFT JOIN public.shop_settings AS origin
        ON origin.business_id = i.business_id AND origin.shop_id = i.qr_shop_id
      WHERE i.transfer_id = v_transfer.id
        AND i.business_id = v_transfer.business_id
    )
  );
END;
$$;

-- Resolve a QR only against current source stock or an explicitly selected
-- transfer. The return is deliberately limited to product identity and status.
CREATE OR REPLACE FUNCTION public.resolve_branch_transfer_scan(
  _sku text,
  _qr_shop_seq_id integer,
  _transfer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  sku text,
  product_name text,
  item_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active_shop_id uuid := public.current_shop_id();
  v_business_id uuid;
  v_transfer public.branch_transfers%ROWTYPE;
  v_sku text := upper(btrim(_sku));
  v_match_count integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_approved() OR v_active_shop_id IS NULL
     OR NOT public.has_branch_access(v_active_shop_id) THEN
    RAISE EXCEPTION 'Нет доступа к активному филиалу' USING errcode = '42501';
  END IF;
  IF v_sku !~ '^[A-Z]{2}[0-9]{1,8}$'
     OR (_qr_shop_seq_id IS NOT NULL AND _qr_shop_seq_id <= 0) THEN
    RAISE EXCEPTION 'Некорректный QR-код товара' USING errcode = '22023';
  END IF;
  SELECT p.business_id INTO v_business_id
  FROM public.profiles AS p
  WHERE p.id = v_user_id AND p.status::text = 'approved';
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Профиль не подтверждён' USING errcode = '42501';
  END IF;

  IF _transfer_id IS NULL THEN
    SELECT count(*) INTO v_match_count
    FROM (
      SELECT p.id
      FROM public.products AS p
      JOIN public.shop_settings AS origin
        ON origin.business_id = p.business_id AND origin.shop_id = p.shop_id
      WHERE p.business_id = v_business_id
        AND p.current_location_shop_id = v_active_shop_id
        AND p.status::text = 'in_stock'
        AND p.deleted_at IS NULL
        AND upper(btrim(p.sku)) = v_sku
        AND (_qr_shop_seq_id IS NULL OR origin.seq_id = _qr_shop_seq_id)
      ORDER BY p.id
      LIMIT 2
    ) AS matches;
    IF v_match_count <> 1 THEN
      RETURN;
    END IF;
    RETURN QUERY
    SELECT p.id, p.sku, p.name, 'source_stock'::text
    FROM public.products AS p
    JOIN public.shop_settings AS origin
      ON origin.business_id = p.business_id AND origin.shop_id = p.shop_id
    WHERE p.business_id = v_business_id
      AND p.current_location_shop_id = v_active_shop_id
      AND p.status::text = 'in_stock'
      AND p.deleted_at IS NULL
      AND upper(btrim(p.sku)) = v_sku
      AND (_qr_shop_seq_id IS NULL OR origin.seq_id = _qr_shop_seq_id)
    ORDER BY p.id
    LIMIT 1;
    RETURN;
  END IF;

  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id;
  IF NOT FOUND
     OR v_active_shop_id NOT IN (v_transfer.source_shop_id, v_transfer.destination_shop_id)
     OR NOT public.has_branch_access(v_active_shop_id) THEN
    RAISE EXCEPTION 'Нет доступа к этому перемещению' USING errcode = '42501';
  END IF;

  SELECT count(*) INTO v_match_count
  FROM (
    SELECT i.product_id
    FROM public.branch_transfer_items AS i
    JOIN public.products AS p
      ON p.id = i.product_id AND p.business_id = i.business_id
    JOIN public.shop_settings AS origin
      ON origin.business_id = i.business_id AND origin.shop_id = i.qr_shop_id
    WHERE i.transfer_id = v_transfer.id
      AND i.business_id = v_transfer.business_id
      AND i.status = 'in_transit'
      AND p.current_location_shop_id = v_transfer.source_shop_id
      AND p.status::text = 'in_stock'
      AND p.deleted_at IS NULL
      AND upper(btrim(p.sku)) = v_sku
      AND (_qr_shop_seq_id IS NULL OR origin.seq_id = _qr_shop_seq_id)
    ORDER BY i.product_id
    LIMIT 2
  ) AS matches;
  IF v_match_count <> 1 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.sku, p.name, i.status
  FROM public.branch_transfer_items AS i
  JOIN public.products AS p
    ON p.id = i.product_id AND p.business_id = i.business_id
  JOIN public.shop_settings AS origin
    ON origin.business_id = i.business_id AND origin.shop_id = i.qr_shop_id
  WHERE i.transfer_id = v_transfer.id
    AND i.business_id = v_transfer.business_id
    AND i.status = 'in_transit'
    AND p.current_location_shop_id = v_transfer.source_shop_id
    AND p.status::text = 'in_stock'
    AND p.deleted_at IS NULL
    AND upper(btrim(p.sku)) = v_sku
    AND (_qr_shop_seq_id IS NULL OR origin.seq_id = _qr_shop_seq_id)
  ORDER BY i.product_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_transfer_details(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_branch_transfer_scan(text, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_transfer_details(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_branch_transfer_scan(text, integer, uuid)
  TO authenticated;

COMMIT;
