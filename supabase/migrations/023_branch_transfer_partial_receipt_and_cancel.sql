BEGIN;
SET LOCAL lock_timeout = '5s';

-- Preserve the original send/full-receipt API while adding explicit outcomes
-- for partial receipt and scanned returns to the source branch.
ALTER TABLE public.branch_transfers
  DROP CONSTRAINT IF EXISTS branch_transfers_status_check,
  ADD CONSTRAINT branch_transfers_status_check
    CHECK (status IN (
      'in_transit',
      'partially_received',
      'partially_cancelled',
      'received',
      'cancelled'
    ));

ALTER TABLE public.branch_transfer_items
  DROP CONSTRAINT IF EXISTS branch_transfer_items_status_check,
  ADD CONSTRAINT branch_transfer_items_status_check
    CHECK (status IN ('in_transit', 'received', 'cancelled'));

ALTER TABLE public.branch_transfer_audit
  DROP CONSTRAINT IF EXISTS branch_transfer_audit_event_type_check,
  ADD CONSTRAINT branch_transfer_audit_event_type_check
    CHECK (event_type IN ('started', 'received_partial', 'received', 'cancelled'));

ALTER TABLE public.branch_transfer_items
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.branch_transfer_audit
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS branch_transfer_audit_request_key
  ON public.branch_transfer_audit (business_id, actor_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Transfers that have received or cancelled items may still contain goods in
-- transit, so they remain discoverable in pending-transfer lookups.
DROP INDEX IF EXISTS public.branch_transfers_in_transit_source_idx;
CREATE INDEX branch_transfers_in_transit_source_idx
  ON public.branch_transfers (business_id, source_shop_id, created_at DESC)
  WHERE status IN ('in_transit', 'partially_received', 'partially_cancelled');

DROP INDEX IF EXISTS public.branch_transfers_in_transit_destination_idx;
CREATE INDEX branch_transfers_in_transit_destination_idx
  ON public.branch_transfers (business_id, destination_shop_id, created_at DESC)
  WHERE status IN ('in_transit', 'partially_received', 'partially_cancelled');

CREATE OR REPLACE FUNCTION public.refresh_branch_transfer_status(
  _transfer_id uuid,
  _completed_by uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_in_transit integer;
  v_received integer;
  v_cancelled integer;
  v_status text;
BEGIN
  SELECT
    count(*) FILTER (WHERE i.status = 'in_transit'),
    count(*) FILTER (WHERE i.status = 'received'),
    count(*) FILTER (WHERE i.status = 'cancelled')
  INTO v_in_transit, v_received, v_cancelled
  FROM public.branch_transfer_items AS i
  WHERE i.transfer_id = _transfer_id;

  IF v_in_transit = 0 THEN
    IF v_received = 0 THEN
      v_status := 'cancelled';
    ELSIF v_cancelled > 0 THEN
      v_status := 'partially_cancelled';
    ELSE
      v_status := 'received';
    END IF;
  ELSIF v_cancelled > 0 THEN
    v_status := 'partially_cancelled';
  ELSIF v_received > 0 THEN
    v_status := 'partially_received';
  ELSE
    v_status := 'in_transit';
  END IF;

  UPDATE public.branch_transfers
     SET status = v_status,
         received_by = CASE
           WHEN v_status = 'received' THEN _completed_by
           ELSE received_by
         END,
         received_at = CASE
           WHEN v_status = 'received' THEN coalesce(received_at, now())
           ELSE received_at
         END
   WHERE id = _transfer_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_branch_transfer_items(
  _transfer_id uuid,
  _product_ids uuid[],
  _client_request_id uuid,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.branch_transfers%ROWTYPE;
  v_existing public.branch_transfer_audit%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_requested uuid[];
  v_remaining uuid[];
  v_product_count integer;
  v_distinct_count integer;
  v_status text;
  v_reason text := nullif(btrim(_reason), '');
  v_previous_setting text := current_setting('app.branch_transfer_operation', true);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  IF _transfer_id IS NULL OR _client_request_id IS NULL OR _product_ids IS NULL
     OR cardinality(_product_ids) = 0 THEN
    RAISE EXCEPTION 'Укажите перемещение, ключ запроса и полученные товары'
      USING errcode = '22023';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Причина не должна превышать 500 символов'
      USING errcode = '22023';
  END IF;

  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_branch_access(v_transfer.destination_shop_id)
     OR public.current_shop_id() IS DISTINCT FROM v_transfer.destination_shop_id THEN
    RAISE EXCEPTION 'Нет доступа к филиалу-получателю' USING errcode = '42501';
  END IF;

  SELECT count(*), count(DISTINCT requested.id)
    INTO v_product_count, v_distinct_count
  FROM unnest(_product_ids) AS requested(id);
  IF v_product_count <> v_distinct_count THEN
    RAISE EXCEPTION 'В списке полученных товаров есть повторы'
      USING errcode = '22023';
  END IF;
  SELECT array_agg(requested.id ORDER BY requested.id)
    INTO v_requested
  FROM unnest(_product_ids) AS requested(id);

  -- A retry of the same request returns its original result. Reusing the key
  -- with a different payload or operation is rejected.
  SELECT a.* INTO v_existing
  FROM public.branch_transfer_audit AS a
  WHERE a.business_id = v_transfer.business_id
    AND a.actor_id = v_user_id
    AND a.client_request_id = _client_request_id;
  IF FOUND THEN
    IF v_existing.transfer_id <> v_transfer.id
       OR v_existing.event_type NOT IN ('received_partial', 'received')
       OR v_existing.details -> 'product_ids' IS DISTINCT FROM to_jsonb(v_requested)
       OR v_existing.details ->> 'reason' IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Ключ запроса уже использован для другого действия'
        USING errcode = '23505';
    END IF;
    RETURN v_transfer.id;
  END IF;

  IF v_transfer.status NOT IN ('in_transit', 'partially_received', 'partially_cancelled') THEN
    RAISE EXCEPTION 'В перемещении нет товаров, доступных для приёмки'
      USING errcode = '23514';
  END IF;

  SELECT array_agg(i.product_id ORDER BY i.product_id)
    INTO v_remaining
  FROM public.branch_transfer_items AS i
  WHERE i.transfer_id = v_transfer.id AND i.status = 'in_transit';
  IF coalesce(cardinality(v_remaining), 0) = 0 THEN
    RAISE EXCEPTION 'В перемещении нет товаров, доступных для приёмки'
      USING errcode = '23514';
  END IF;

  IF (
    SELECT count(*)
    FROM unnest(v_requested) AS requested(id)
    JOIN public.branch_transfer_items AS i
      ON i.transfer_id = v_transfer.id
     AND i.product_id = requested.id
     AND i.status = 'in_transit'
  ) <> cardinality(v_requested) THEN
    RAISE EXCEPTION 'Полученный товар не входит в это перемещение или уже обработан'
      USING errcode = '23514';
  END IF;
  IF cardinality(v_requested) < cardinality(v_remaining) AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Для частичной приёмки укажите причину расхождения'
      USING errcode = '22023';
  END IF;

  PERFORM p.id
  FROM public.products AS p
  WHERE p.id = ANY(v_requested)
    AND p.business_id = v_transfer.business_id
  ORDER BY p.id
  FOR UPDATE;
  SELECT count(*) INTO v_product_count
  FROM public.products AS p
  JOIN public.branch_transfer_items AS i
    ON i.product_id = p.id AND i.business_id = p.business_id
  WHERE i.transfer_id = v_transfer.id
    AND i.product_id = ANY(v_requested)
    AND i.status = 'in_transit'
    AND p.current_location_shop_id = v_transfer.source_shop_id
    AND p.status::text = 'in_stock'
    AND p.deleted_at IS NULL;
  IF v_product_count <> cardinality(v_requested) THEN
    RAISE EXCEPTION 'Состав перемещения или местоположение товара изменились'
      USING errcode = '23514';
  END IF;

  PERFORM set_config('app.branch_transfer_operation', 'on', true);
  UPDATE public.products AS p
     SET current_location_shop_id = v_transfer.destination_shop_id
    FROM public.branch_transfer_items AS i
   WHERE i.transfer_id = v_transfer.id
     AND i.product_id = p.id
     AND i.business_id = p.business_id
     AND i.product_id = ANY(v_requested)
     AND i.status = 'in_transit';
  UPDATE public.branch_transfer_items AS i
     SET status = 'received', received_at = now()
   WHERE i.transfer_id = v_transfer.id
     AND i.product_id = ANY(v_requested)
     AND i.status = 'in_transit';
  PERFORM set_config('app.branch_transfer_operation', coalesce(v_previous_setting, ''), true);

  v_status := public.refresh_branch_transfer_status(v_transfer.id, v_user_id);
  INSERT INTO public.branch_transfer_audit (
    transfer_id, business_id, event_type, actor_id, details, client_request_id
  ) VALUES (
    v_transfer.id,
    v_transfer.business_id,
    CASE WHEN v_status = 'received' THEN 'received' ELSE 'received_partial' END,
    v_user_id,
    jsonb_build_object(
      'product_ids', to_jsonb(v_requested),
      'in_transit_product_ids', (
        SELECT coalesce(jsonb_agg(i.product_id ORDER BY i.product_id), '[]'::jsonb)
        FROM public.branch_transfer_items AS i
        WHERE i.transfer_id = v_transfer.id AND i.status = 'in_transit'
      ),
      'reason', v_reason,
      'status', v_status
    ),
    _client_request_id
  );
  RETURN v_transfer.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_branch_transfer(_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.branch_transfers%ROWTYPE;
  v_product_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_branch_access(v_transfer.destination_shop_id)
     OR public.current_shop_id() IS DISTINCT FROM v_transfer.destination_shop_id THEN
    RAISE EXCEPTION 'Нет доступа к филиалу-получателю' USING errcode = '42501';
  END IF;

  SELECT array_agg(i.product_id ORDER BY i.product_id)
    INTO v_product_ids
  FROM public.branch_transfer_items AS i
  WHERE i.transfer_id = v_transfer.id AND i.status = 'in_transit';
  IF coalesce(cardinality(v_product_ids), 0) = 0 THEN
    IF v_transfer.status IN ('received', 'cancelled', 'partially_cancelled') THEN
      RETURN v_transfer.id;
    END IF;
    RAISE EXCEPTION 'В перемещении нет товаров, доступных для приёмки'
      USING errcode = '23514';
  END IF;

  RETURN public.receive_branch_transfer_items(
    v_transfer.id,
    v_product_ids,
    gen_random_uuid(),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_branch_transfer(
  _transfer_id uuid,
  _returned_product_ids uuid[],
  _client_request_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.branch_transfers%ROWTYPE;
  v_existing public.branch_transfer_audit%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_requested uuid[];
  v_remaining uuid[];
  v_product_count integer;
  v_distinct_count integer;
  v_status text;
  v_reason text := nullif(btrim(_reason), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  IF _transfer_id IS NULL OR _client_request_id IS NULL
     OR _returned_product_ids IS NULL OR cardinality(_returned_product_ids) = 0
     OR v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Укажите перемещение, возвращённые товары, ключ и причину отмены'
      USING errcode = '22023';
  END IF;

  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_branch_access(v_transfer.source_shop_id)
     OR public.current_shop_id() IS DISTINCT FROM v_transfer.source_shop_id THEN
    RAISE EXCEPTION 'Нет доступа к филиалу-отправителю' USING errcode = '42501';
  END IF;

  SELECT count(*), count(DISTINCT requested.id)
    INTO v_product_count, v_distinct_count
  FROM unnest(_returned_product_ids) AS requested(id);
  IF v_product_count <> v_distinct_count THEN
    RAISE EXCEPTION 'В списке возвращённых товаров есть повторы'
      USING errcode = '22023';
  END IF;
  SELECT array_agg(requested.id ORDER BY requested.id)
    INTO v_requested
  FROM unnest(_returned_product_ids) AS requested(id);

  SELECT a.* INTO v_existing
  FROM public.branch_transfer_audit AS a
  WHERE a.business_id = v_transfer.business_id
    AND a.actor_id = v_user_id
    AND a.client_request_id = _client_request_id;
  IF FOUND THEN
    IF v_existing.transfer_id <> v_transfer.id
       OR v_existing.event_type <> 'cancelled'
       OR v_existing.details -> 'product_ids' IS DISTINCT FROM to_jsonb(v_requested)
       OR v_existing.details ->> 'reason' IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Ключ запроса уже использован для другого действия'
        USING errcode = '23505';
    END IF;
    RETURN v_transfer.id;
  END IF;

  IF v_transfer.status NOT IN ('in_transit', 'partially_received', 'partially_cancelled') THEN
    RAISE EXCEPTION 'Перемещение нельзя отменить в текущем состоянии'
      USING errcode = '23514';
  END IF;

  SELECT array_agg(i.product_id ORDER BY i.product_id)
    INTO v_remaining
  FROM public.branch_transfer_items AS i
  WHERE i.transfer_id = v_transfer.id AND i.status = 'in_transit';
  IF coalesce(cardinality(v_remaining), 0) = 0 THEN
    RAISE EXCEPTION 'В перемещении нет товаров, которые можно вернуть'
      USING errcode = '23514';
  END IF;
  IF (
    SELECT count(*)
    FROM unnest(v_requested) AS requested(id)
    JOIN public.branch_transfer_items AS i
      ON i.transfer_id = v_transfer.id
     AND i.product_id = requested.id
     AND i.status = 'in_transit'
  ) <> cardinality(v_requested) THEN
    RAISE EXCEPTION 'Возвращённый товар не входит в это перемещение или уже обработан'
      USING errcode = '23514';
  END IF;

  PERFORM p.id
  FROM public.products AS p
  WHERE p.id = ANY(v_requested)
    AND p.business_id = v_transfer.business_id
  ORDER BY p.id
  FOR UPDATE;
  SELECT count(*) INTO v_product_count
  FROM public.products AS p
  JOIN public.branch_transfer_items AS i
    ON i.product_id = p.id AND i.business_id = p.business_id
  WHERE i.transfer_id = v_transfer.id
    AND i.product_id = ANY(v_requested)
    AND i.status = 'in_transit'
    AND p.current_location_shop_id = v_transfer.source_shop_id
    AND p.status::text = 'in_stock'
    AND p.deleted_at IS NULL;
  IF v_product_count <> cardinality(v_requested) THEN
    RAISE EXCEPTION 'Состав перемещения или местоположение возвращённого товара изменились'
      USING errcode = '23514';
  END IF;

  UPDATE public.branch_transfer_items AS i
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user_id
   WHERE i.transfer_id = v_transfer.id
     AND i.product_id = ANY(v_requested)
     AND i.status = 'in_transit';
  v_status := public.refresh_branch_transfer_status(v_transfer.id, v_user_id);
  INSERT INTO public.branch_transfer_audit (
    transfer_id, business_id, event_type, actor_id, details, client_request_id
  ) VALUES (
    v_transfer.id,
    v_transfer.business_id,
    'cancelled',
    v_user_id,
    jsonb_build_object(
      'product_ids', to_jsonb(v_requested),
      'in_transit_product_ids', (
        SELECT coalesce(jsonb_agg(i.product_id ORDER BY i.product_id), '[]'::jsonb)
        FROM public.branch_transfer_items AS i
        WHERE i.transfer_id = v_transfer.id AND i.status = 'in_transit'
      ),
      'received_product_ids', (
        SELECT coalesce(jsonb_agg(i.product_id ORDER BY i.product_id), '[]'::jsonb)
        FROM public.branch_transfer_items AS i
        WHERE i.transfer_id = v_transfer.id AND i.status = 'received'
      ),
      'reason', v_reason,
      'returned_to_source', true,
      'status', v_status
    ),
    _client_request_id
  );
  RETURN v_transfer.id;
END;
$$;

-- A product is saleable as soon as that item is received, even when other
-- items from the same transfer remain in transit or are returned/cancelled.
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
       AND t.status IN ('in_transit', 'partially_received', 'partially_cancelled')
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

-- The checkout RPC's location predicate also required a fully completed
-- transfer. Remove exactly that predicate; item receipt and destination are
-- still verified, and an in-transit item remains explicitly blocked below.
DO $patch$
DECLARE
  v_definition text;
  v_old_condition text := $old$AND t.status = 'received'$old$;
BEGIN
  v_definition := pg_get_functiondef(
    'public.commit_offline_sale(text,jsonb)'::regprocedure
  );
  IF (length(v_definition) - length(replace(v_definition, v_old_condition, '')))
       / length(v_old_condition) <> 1 THEN
    RAISE EXCEPTION
      'commit_offline_sale changed; review the partial-transfer sale predicate';
  END IF;
  v_definition := replace(v_definition, v_old_condition, '');
  EXECUTE v_definition;
END;
$patch$;

REVOKE ALL ON FUNCTION public.branch_sale_product_failure(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_sale_product_failure(uuid, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_branch_transfer_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_branch_transfer_items(uuid, uuid[], uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_branch_transfer(uuid, uuid[], uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_branch_transfer(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_branch_transfer_items(uuid, uuid[], uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_branch_transfer(uuid, uuid[], uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_branch_transfer(uuid)
  TO authenticated;

COMMIT;
