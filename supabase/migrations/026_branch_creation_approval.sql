BEGIN;

CREATE TABLE public.branch_creation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_shop_name text NOT NULL CHECK (char_length(btrim(requested_shop_name)) BETWEEN 1 AND 200),
  source_shop_id uuid NOT NULL,
  source_shop_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_shop_id uuid REFERENCES public.shop_settings(shop_id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT branch_creation_request_review_state CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND created_shop_id IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND created_shop_id IS NULL)
  )
);

CREATE UNIQUE INDEX branch_creation_requests_one_pending_per_business
  ON public.branch_creation_requests (business_id)
  WHERE status = 'pending';
CREATE INDEX branch_creation_requests_requested_at_idx
  ON public.branch_creation_requests (requested_at DESC, id DESC);

ALTER TABLE public.branch_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.branch_creation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.branch_creation_requests TO authenticated;
CREATE POLICY branch_creation_requests_member_read
  ON public.branch_creation_requests FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (requested_by = auth.uid() AND public.is_business_admin(business_id))
  );

CREATE OR REPLACE FUNCTION public.request_business_branch(_shop_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_source_shop_id uuid;
  v_source_shop_name text;
  v_name text := nullif(pg_catalog.btrim(coalesce(_shop_name, '')), '');
  v_request_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  IF v_name IS NULL OR pg_catalog.char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Укажите название точки длиной от 1 до 200 символов' USING errcode = '22023';
  END IF;

  SELECT p.business_id, p.active_shop_id
    INTO v_business_id, v_source_shop_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.status::text = 'approved'
    AND p.role::text = 'admin';
  IF v_business_id IS NULL OR v_source_shop_id IS NULL
     OR NOT public.is_business_admin(v_business_id)
     OR NOT public.has_branch_access(v_source_shop_id) THEN
    RAISE EXCEPTION 'Только подтверждённый администратор магазина может запросить новую точку'
      USING errcode = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.branch_creation_requests AS r
    WHERE r.business_id = v_business_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Для бизнеса уже есть запрос на открытие точки'
      USING errcode = '23505';
  END IF;
  SELECT coalesce(s.shop_name, 'Магазин') INTO v_source_shop_name
  FROM public.shop_settings AS s
  WHERE s.shop_id = v_source_shop_id AND s.business_id = v_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Не удалось подтвердить текущий магазин' USING errcode = '42501';
  END IF;

  INSERT INTO public.branch_creation_requests (
    id, business_id, requested_by, requested_shop_name,
    source_shop_id, source_shop_name
  ) VALUES (
    v_request_id, v_business_id, auth.uid(), v_name,
    v_source_shop_id, v_source_shop_name
  );
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_branch_creation_request()
RETURNS TABLE (
  id uuid,
  requested_shop_name text,
  status text,
  requested_at timestamptz,
  created_shop_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT p.business_id INTO v_business_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.status::text = 'approved'
    AND p.role::text = 'admin';
  IF v_business_id IS NULL OR NOT public.is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Доступ запрещён: требуется администратор бизнеса' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.requested_shop_name, r.status, r.requested_at, r.created_shop_id
  FROM public.branch_creation_requests AS r
  WHERE r.business_id = v_business_id
  ORDER BY r.requested_at DESC, r.id DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_list_branch_creation_requests()
RETURNS TABLE (
  id uuid,
  business_id uuid,
  business_name text,
  requested_by uuid,
  requester_name text,
  requested_shop_name text,
  source_shop_name text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewer_name text,
  created_shop_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.business_id, b.business_name, r.requested_by,
         p.full_name, r.requested_shop_name, r.source_shop_name,
         r.status, r.requested_at, r.reviewed_at, reviewer.full_name,
         r.created_shop_id
  FROM public.branch_creation_requests AS r
  JOIN public.businesses AS b ON b.id = r.business_id
  JOIN public.profiles AS p ON p.id = r.requested_by
  LEFT JOIN public.profiles AS reviewer ON reviewer.id = r.reviewed_by
  ORDER BY (r.status = 'pending') DESC, r.requested_at DESC, r.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_review_branch_creation_request(
  _request_id uuid,
  _approve boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request record;
  v_requester record;
  v_shop_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _request_id IS NULL OR _approve IS NULL THEN
    RAISE EXCEPTION 'Укажите запрос и решение' USING errcode = '22023';
  END IF;
  SELECT r.business_id, r.requested_by, r.requested_shop_name, r.status
    INTO v_request
  FROM public.branch_creation_requests AS r
  WHERE r.id = _request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Запрос на открытие точки не найден' USING errcode = 'P0002';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Этот запрос уже рассмотрен' USING errcode = '23514';
  END IF;

  IF _approve THEN
    SELECT p.business_id, p.status::text AS status, p.role::text AS role
      INTO v_requester
    FROM public.profiles AS p
    WHERE p.id = v_request.requested_by
    FOR UPDATE;
    IF NOT FOUND OR v_requester.business_id IS DISTINCT FROM v_request.business_id
       OR v_requester.status <> 'approved' OR v_requester.role <> 'admin' THEN
      RAISE EXCEPTION 'Заявитель больше не является подтверждённым администратором этого бизнеса'
        USING errcode = '42501';
    END IF;

    v_shop_id := pg_catalog.gen_random_uuid();
    INSERT INTO public.shop_settings (shop_id, business_id, shop_name)
    VALUES (v_shop_id, v_request.business_id, v_request.requested_shop_name);
    INSERT INTO public.profile_branch_access (profile_id, business_id, shop_id, granted_by)
    VALUES (v_request.requested_by, v_request.business_id, v_shop_id, auth.uid())
    ON CONFLICT (profile_id, business_id, shop_id) DO NOTHING;
    UPDATE public.branch_creation_requests
       SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = pg_catalog.now(),
           created_shop_id = v_shop_id
     WHERE id = _request_id;
    RETURN v_shop_id;
  END IF;

  UPDATE public.branch_creation_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = pg_catalog.now()
   WHERE id = _request_id;
  RETURN NULL;
END;
$$;

-- Direct branch creation would bypass super-admin approval. Requests are the
-- only authenticated entry point; the review RPC creates the branch atomically.
REVOKE ALL ON FUNCTION public.create_business_branch(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_business_branch(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_branch_creation_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_list_branch_creation_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_review_branch_creation_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_business_branch(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_branch_creation_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_list_branch_creation_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_review_branch_creation_request(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
