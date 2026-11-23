BEGIN;
SET LOCAL lock_timeout = '5s';

-- A business groups existing shop_settings rows. Legacy shops each become a
-- one-branch business, preserving all existing shop IDs and QR identities.
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY,
  business_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS business_id uuid;

CREATE OR REPLACE FUNCTION public.initialize_shop_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id
       AND OLD.business_id IS NOT NULL THEN
      RAISE EXCEPTION 'Филиал нельзя перенести в другой бизнес' USING errcode = '42501';
    END IF;
    IF NEW.business_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.businesses AS b WHERE b.id = NEW.business_id
    ) THEN
      RAISE EXCEPTION 'Бизнес не найден' USING errcode = '23503';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.business_id IS NULL THEN
    NEW.business_id := NEW.shop_id;
    INSERT INTO public.businesses (id, business_name)
    VALUES (
      NEW.business_id,
      coalesce(nullif(btrim(NEW.shop_name), ''), 'Бизнес ' || left(NEW.shop_id::text, 8))
    )
    ON CONFLICT (id) DO NOTHING;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.businesses AS b WHERE b.id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'Бизнес не найден' USING errcode = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_shop_business ON public.shop_settings;
CREATE TRIGGER initialize_shop_business
  BEFORE INSERT OR UPDATE OF business_id ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.initialize_shop_business();

-- Repair orphan shop settings rows referenced by existing profiles/products.
INSERT INTO public.shop_settings (shop_id, shop_name)
SELECT p.shop_id, max(p.shop_name)
FROM public.profiles AS p
WHERE p.shop_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.shop_settings AS s WHERE s.shop_id = p.shop_id
  )
GROUP BY p.shop_id;

INSERT INTO public.shop_settings (shop_id)
SELECT p.shop_id
FROM public.products AS p
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_settings AS s WHERE s.shop_id = p.shop_id
)
GROUP BY p.shop_id;

INSERT INTO public.businesses (id, business_name)
SELECT s.shop_id,
       coalesce(nullif(btrim(s.shop_name), ''), 'Бизнес ' || left(s.shop_id::text, 8))
FROM public.shop_settings AS s
ON CONFLICT (id) DO NOTHING;

UPDATE public.shop_settings
SET business_id = shop_id
WHERE business_id IS NULL;

ALTER TABLE public.shop_settings
  ALTER COLUMN business_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_business_shop_key
  ON public.shop_settings (business_id, shop_id);
ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS shop_settings_business_id_fkey,
  ADD CONSTRAINT shop_settings_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS active_shop_id uuid;

CREATE OR REPLACE FUNCTION public.initialize_profile_branch_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF NEW.shop_id IS NULL THEN
    NEW.business_id := NULL;
    NEW.active_shop_id := NULL;
    RETURN NEW;
  END IF;
  SELECT s.business_id INTO v_business_id
  FROM public.shop_settings AS s WHERE s.shop_id = NEW.shop_id;
  IF v_business_id IS NOT NULL THEN
    NEW.business_id := v_business_id;
    NEW.active_shop_id := coalesce(NEW.active_shop_id, NEW.shop_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS initialize_profile_branch_context ON public.profiles;
CREATE TRIGGER initialize_profile_branch_context
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.initialize_profile_branch_context();

UPDATE public.profiles AS p
SET business_id = s.business_id,
    active_shop_id = coalesce(p.active_shop_id, p.shop_id)
FROM public.shop_settings AS s
WHERE p.shop_id = s.shop_id
  AND (p.business_id IS NULL OR p.active_shop_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_business_key
  ON public.profiles (id, business_id);
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_home_branch_business_fkey,
  DROP CONSTRAINT IF EXISTS profiles_active_branch_business_fkey,
  ADD CONSTRAINT profiles_home_branch_business_fkey
    FOREIGN KEY (business_id, shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT,
  ADD CONSTRAINT profiles_active_branch_business_fkey
    FOREIGN KEY (business_id, active_shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT;

-- shop_id remains the original shop encoded in QR labels. The separate
-- current_location_shop_id is the server-controlled physical stock location.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS current_location_shop_id uuid;

UPDATE public.products AS p
SET business_id = s.business_id,
    current_location_shop_id = coalesce(p.current_location_shop_id, p.shop_id)
FROM public.shop_settings AS s
WHERE p.shop_id = s.shop_id
  AND (p.business_id IS NULL OR p.current_location_shop_id IS NULL);

ALTER TABLE public.products
  ALTER COLUMN business_id SET NOT NULL,
  ALTER COLUMN current_location_shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_id_business_key
  ON public.products (id, business_id);
CREATE INDEX IF NOT EXISTS products_current_location_idx
  ON public.products (business_id, current_location_shop_id, status)
  WHERE deleted_at IS NULL;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_source_business_fkey,
  DROP CONSTRAINT IF EXISTS products_location_business_fkey,
  ADD CONSTRAINT products_source_business_fkey
    FOREIGN KEY (business_id, shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT,
  ADD CONSTRAINT products_location_business_fkey
    FOREIGN KEY (business_id, current_location_shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.profile_branch_access (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, business_id, shop_id),
  CONSTRAINT profile_branch_access_branch_fkey
    FOREIGN KEY (business_id, shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profile_branch_access_branch_idx
  ON public.profile_branch_access (business_id, shop_id, profile_id);

-- Preserve the old single-shop access for every existing profile. Pending
-- profiles are not authorized until approved; their membership is harmless.
INSERT INTO public.profile_branch_access (profile_id, business_id, shop_id)
SELECT p.id, p.business_id, p.shop_id
FROM public.profiles AS p
WHERE p.business_id IS NOT NULL AND p.shop_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  source_shop_id uuid NOT NULL,
  destination_shop_id uuid NOT NULL,
  client_request_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_transit'
    CHECK (status IN ('in_transit', 'received')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  received_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  CONSTRAINT branch_transfers_different_branches CHECK (source_shop_id <> destination_shop_id),
  CONSTRAINT branch_transfers_source_business_fkey
    FOREIGN KEY (business_id, source_shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT,
  CONSTRAINT branch_transfers_destination_business_fkey
    FOREIGN KEY (business_id, destination_shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT,
  CONSTRAINT branch_transfers_request_key UNIQUE (business_id, created_by, client_request_id),
  CONSTRAINT branch_transfers_id_business_key UNIQUE (id, business_id)
);
CREATE INDEX IF NOT EXISTS branch_transfers_in_transit_source_idx
  ON public.branch_transfers (business_id, source_shop_id, created_at DESC)
  WHERE status = 'in_transit';
CREATE INDEX IF NOT EXISTS branch_transfers_in_transit_destination_idx
  ON public.branch_transfers (business_id, destination_shop_id, created_at DESC)
  WHERE status = 'in_transit';

CREATE TABLE IF NOT EXISTS public.branch_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qr_shop_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_transit'
    CHECK (status IN ('in_transit', 'received')),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  CONSTRAINT branch_transfer_items_transfer_business_fkey
    FOREIGN KEY (transfer_id, business_id)
    REFERENCES public.branch_transfers (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT branch_transfer_items_product_business_fkey
    FOREIGN KEY (product_id, business_id)
    REFERENCES public.products (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT branch_transfer_items_qr_branch_fkey
    FOREIGN KEY (business_id, qr_shop_id)
    REFERENCES public.shop_settings (business_id, shop_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_transfer_items_one_active_transfer_idx
  ON public.branch_transfer_items (product_id)
  WHERE status = 'in_transit';
CREATE INDEX IF NOT EXISTS branch_transfer_items_transfer_idx
  ON public.branch_transfer_items (transfer_id, product_id);

CREATE TABLE IF NOT EXISTS public.branch_transfer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('started', 'received')),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_transfer_audit_transfer_business_fkey
    FOREIGN KEY (transfer_id, business_id)
    REFERENCES public.branch_transfers (id, business_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS branch_transfer_audit_transfer_idx
  ON public.branch_transfer_audit (transfer_id, created_at);

CREATE OR REPLACE FUNCTION public.has_branch_access(_shop_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles AS p
       JOIN public.profile_branch_access AS a
         ON a.profile_id = p.id AND a.business_id = p.business_id
       WHERE p.id = auth.uid()
         AND p.status::text = 'approved'
         AND a.shop_id = _shop_id
     )
$$;

CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles AS p
       JOIN public.profile_branch_access AS a
         ON a.profile_id = p.id AND a.business_id = p.business_id
       WHERE p.id = auth.uid()
         AND p.status::text = 'approved'
         AND a.business_id = _business_id
     )
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin(_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles AS p
       JOIN public.profile_branch_access AS a
         ON a.profile_id = p.id AND a.business_id = p.business_id
       WHERE p.id = auth.uid()
         AND p.business_id = _business_id
         AND p.status::text = 'approved'
         AND p.role::text = 'admin'
     )
$$;

CREATE OR REPLACE FUNCTION public.get_branch_context()
RETURNS TABLE (
  business_id uuid,
  shop_id uuid,
  shop_name text,
  is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH profile_context AS (
    SELECT p.id, p.business_id, p.shop_id AS home_shop_id, p.active_shop_id
    FROM public.profiles AS p
    WHERE p.id = auth.uid() AND p.status::text = 'approved'
  ), member_branches AS (
    SELECT a.business_id, a.shop_id, s.shop_name, a.created_at,
           (a.shop_id = coalesce(
              CASE WHEN EXISTS (
                SELECT 1 FROM public.profile_branch_access AS active_access
                WHERE active_access.profile_id = p.id
                  AND active_access.business_id = p.business_id
                  AND active_access.shop_id = p.active_shop_id
              ) THEN p.active_shop_id END,
              CASE WHEN EXISTS (
                SELECT 1 FROM public.profile_branch_access AS home_access
                WHERE home_access.profile_id = p.id
                  AND home_access.business_id = p.business_id
                  AND home_access.shop_id = p.home_shop_id
              ) THEN p.home_shop_id END,
              (
                SELECT min(first_branch.shop_id::text)::uuid
                FROM public.profile_branch_access AS first_branch
                WHERE first_branch.profile_id = p.id
                  AND first_branch.business_id = p.business_id
              )
            )) AS active
    FROM profile_context AS p
    JOIN public.profile_branch_access AS a
      ON a.profile_id = p.id AND a.business_id = p.business_id
    JOIN public.shop_settings AS s
      ON s.business_id = a.business_id AND s.shop_id = a.shop_id
  )
  SELECT m.business_id, m.shop_id, m.shop_name, m.active
  FROM member_branches AS m
  ORDER BY m.active DESC, m.created_at, m.shop_id
$$;

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.shop_id FROM public.get_branch_context() AS c
  WHERE c.is_active
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.set_active_shop(_shop_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous_setting text := current_setting('app.branch_profile_write', true);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_branch_access(_shop_id) THEN
    RAISE EXCEPTION 'Нет доступа к выбранному филиалу' USING errcode = '42501';
  END IF;
  PERFORM set_config('app.branch_profile_write', 'on', true);
  UPDATE public.profiles
     SET active_shop_id = _shop_id
   WHERE id = auth.uid() AND status::text = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Профиль не найден или не подтверждён' USING errcode = '42501';
  END IF;
  PERFORM set_config('app.branch_profile_write', coalesce(v_previous_setting, ''), true);
  RETURN _shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_branch(
  _business_id uuid,
  _shop_name text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shop_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_business_admin(_business_id) THEN
    RAISE EXCEPTION 'Недостаточно прав для создания филиала' USING errcode = '42501';
  END IF;
  IF nullif(btrim(_shop_name), '') IS NULL OR length(btrim(_shop_name)) > 200 THEN
    RAISE EXCEPTION 'Укажите название филиала длиной не более 200 символов' USING errcode = '22023';
  END IF;
  INSERT INTO public.shop_settings (shop_id, business_id, shop_name)
  VALUES (v_shop_id, _business_id, btrim(_shop_name));
  INSERT INTO public.profile_branch_access (profile_id, business_id, shop_id, granted_by)
  VALUES (auth.uid(), _business_id, v_shop_id, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN v_shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_branch_access(
  _profile_id uuid,
  _shop_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT s.business_id INTO v_business_id
  FROM public.shop_settings AS s WHERE s.shop_id = _shop_id;
  IF v_business_id IS NULL OR NOT public.is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Недостаточно прав для назначения филиала' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = _profile_id AND p.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Пользователь относится к другому бизнесу' USING errcode = '42501';
  END IF;
  INSERT INTO public.profile_branch_access (profile_id, business_id, shop_id, granted_by)
  VALUES (_profile_id, v_business_id, _shop_id, auth.uid())
  ON CONFLICT (profile_id, business_id, shop_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_branch_access(
  _profile_id uuid,
  _shop_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_next_shop_id uuid;
  v_previous_setting text := current_setting('app.branch_profile_write', true);
BEGIN
  SELECT s.business_id INTO v_business_id
  FROM public.shop_settings AS s WHERE s.shop_id = _shop_id;
  IF v_business_id IS NULL OR NOT public.is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Недостаточно прав для отзыва доступа' USING errcode = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = _profile_id AND p.business_id = v_business_id
      AND p.role::text = 'admin'
      AND (SELECT count(*) FROM public.profile_branch_access AS a
           WHERE a.profile_id = p.id AND a.business_id = v_business_id) <= 1
  ) THEN
    RAISE EXCEPTION 'У администратора должен остаться доступ хотя бы к одному филиалу'
      USING errcode = '23514';
  END IF;
  DELETE FROM public.profile_branch_access
  WHERE profile_id = _profile_id AND business_id = v_business_id AND shop_id = _shop_id;
  IF (SELECT p.active_shop_id FROM public.profiles AS p WHERE p.id = _profile_id) = _shop_id THEN
    SELECT a.shop_id INTO v_next_shop_id
    FROM public.profile_branch_access AS a
    JOIN public.profiles AS p ON p.id = a.profile_id AND p.business_id = a.business_id
    WHERE a.profile_id = _profile_id AND a.business_id = v_business_id
    ORDER BY (a.shop_id = p.shop_id) DESC, a.created_at, a.shop_id
    LIMIT 1;
    PERFORM set_config('app.branch_profile_write', 'on', true);
    UPDATE public.profiles
       SET active_shop_id = v_next_shop_id
     WHERE id = _profile_id;
    PERFORM set_config('app.branch_profile_write', coalesce(v_previous_setting, ''), true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_branch_context()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF NEW.shop_id IS DISTINCT FROM OLD.shop_id THEN
    IF current_setting('app.branch_profile_write', true) IS DISTINCT FROM 'on'
       AND NOT public.is_super_admin()
       AND OLD.status::text <> 'pending' THEN
      RAISE EXCEPTION 'Основной магазин профиля нельзя изменить напрямую' USING errcode = '42501';
    END IF;
    IF NEW.shop_id IS NULL THEN
      NEW.business_id := NULL;
      NEW.active_shop_id := NULL;
    ELSE
      SELECT s.business_id INTO v_business_id
      FROM public.shop_settings AS s WHERE s.shop_id = NEW.shop_id;
      IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Филиал профиля не найден' USING errcode = '23503';
      END IF;
      NEW.business_id := v_business_id;
      NEW.active_shop_id := NEW.shop_id;
    END IF;
  ELSIF NEW.business_id IS DISTINCT FROM OLD.business_id
     AND current_setting('app.branch_profile_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Бизнес профиля нельзя изменить напрямую' USING errcode = '42501';
  END IF;

  IF NEW.active_shop_id IS DISTINCT FROM OLD.active_shop_id
     AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
     AND current_setting('app.branch_profile_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Активный филиал изменяется только через серверную операцию'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_branch_context ON public.profiles;
CREATE TRIGGER guard_profile_branch_context
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_branch_context();

CREATE OR REPLACE FUNCTION public.sync_profile_branch_access()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous_setting text := current_setting('app.branch_profile_write', true);
BEGIN
  IF NEW.shop_id IS NULL OR NEW.business_id IS NULL THEN
    DELETE FROM public.profile_branch_access
    WHERE profile_id = NEW.id
      AND (NEW.business_id IS NULL OR business_id <> NEW.business_id);
    RETURN NEW;
  END IF;

  DELETE FROM public.profile_branch_access
  WHERE profile_id = NEW.id AND business_id <> NEW.business_id;
  INSERT INTO public.profile_branch_access (profile_id, business_id, shop_id)
  SELECT NEW.id, NEW.business_id, NEW.shop_id
  WHERE EXISTS (
    SELECT 1 FROM public.shop_settings AS s
    WHERE s.shop_id = NEW.shop_id AND s.business_id = NEW.business_id
  )
  ON CONFLICT (profile_id, business_id, shop_id) DO NOTHING;

  PERFORM set_config('app.branch_profile_write', 'on', true);
  UPDATE public.profiles
     SET active_shop_id = NEW.shop_id
   WHERE id = NEW.id
     AND active_shop_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.profile_branch_access AS a
       WHERE a.profile_id = NEW.id AND a.business_id = NEW.business_id
         AND a.shop_id = NEW.shop_id
     );
  PERFORM set_config('app.branch_profile_write', coalesce(v_previous_setting, ''), true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_branch_access ON public.profiles;
CREATE TRIGGER sync_profile_branch_access
  AFTER INSERT OR UPDATE OF shop_id, business_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_branch_access();

CREATE OR REPLACE FUNCTION public.attach_profiles_to_new_branch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous_setting text := current_setting('app.branch_profile_write', true);
BEGIN
  PERFORM set_config('app.branch_profile_write', 'on', true);
  UPDATE public.profiles
     SET business_id = NEW.business_id,
         active_shop_id = coalesce(active_shop_id, shop_id)
   WHERE shop_id = NEW.shop_id
     AND business_id IS DISTINCT FROM NEW.business_id;
  PERFORM set_config('app.branch_profile_write', coalesce(v_previous_setting, ''), true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS attach_profiles_to_new_branch ON public.shop_settings;
CREATE TRIGGER attach_profiles_to_new_branch
  AFTER INSERT ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.attach_profiles_to_new_branch();

CREATE OR REPLACE FUNCTION public.guard_product_location_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.shop_id IS DISTINCT FROM OLD.shop_id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'Исходный магазин QR-метки неизменяем' USING errcode = '42501';
  END IF;
  IF NEW.current_location_shop_id IS DISTINCT FROM OLD.current_location_shop_id
     AND current_setting('app.branch_transfer_operation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Местоположение товара меняется только через перемещение'
      USING errcode = '42501';
  END IF;
  IF NEW.status::text = 'sold' AND OLD.status::text <> 'sold'
     AND current_setting('app.branch_transfer_operation', true) IS DISTINCT FROM 'on'
     AND (
       NEW.current_location_shop_id IS DISTINCT FROM public.current_shop_id()
       OR EXISTS (
         SELECT 1 FROM public.branch_transfer_items AS i
         WHERE i.product_id = OLD.id AND i.status = 'in_transit'
       )
     ) THEN
    RAISE EXCEPTION 'Товар в пути или в другом филиале нельзя продать здесь'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_product_location_update ON public.products;
CREATE TRIGGER guard_product_location_update
  BEFORE UPDATE OF shop_id, business_id, current_location_shop_id, status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_location_update();

CREATE OR REPLACE FUNCTION public.begin_branch_transfer(
  _client_request_id uuid,
  _destination_shop_id uuid,
  _product_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_source_shop_id uuid := public.current_shop_id();
  v_transfer_id uuid;
  v_existing public.branch_transfers%ROWTYPE;
  v_inserted_id uuid;
  v_product_count integer;
  v_distinct_count integer;
  v_saved_products uuid[];
  v_requested_products uuid[];
BEGIN
  IF v_user_id IS NULL OR NOT public.has_branch_access(v_source_shop_id) THEN
    RAISE EXCEPTION 'Требуется доступ к филиалу-отправителю' USING errcode = '42501';
  END IF;
  SELECT p.business_id INTO v_business_id
  FROM public.profiles AS p WHERE p.id = v_user_id AND p.status::text = 'approved';
  IF _client_request_id IS NULL
     OR _product_ids IS NULL
     OR cardinality(_product_ids) = 0
     OR _destination_shop_id IS NULL
     OR _destination_shop_id = v_source_shop_id
     OR NOT public.has_branch_access(_destination_shop_id) THEN
    RAISE EXCEPTION 'Недопустимые параметры перемещения' USING errcode = '22023';
  END IF;

  SELECT count(*), count(DISTINCT requested.id)
    INTO v_product_count, v_distinct_count
  FROM unnest(_product_ids) AS requested(id);
  IF v_product_count <> v_distinct_count THEN
    RAISE EXCEPTION 'В списке товара есть повторы' USING errcode = '22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_requested_products
  FROM unnest(_product_ids) AS requested(id);

  SELECT t.* INTO v_existing
  FROM public.branch_transfers AS t
  WHERE t.business_id = v_business_id
    AND t.created_by = v_user_id
    AND t.client_request_id = _client_request_id;
  IF FOUND THEN
    SELECT array_agg(i.product_id ORDER BY i.product_id) INTO v_saved_products
    FROM public.branch_transfer_items AS i WHERE i.transfer_id = v_existing.id;
    IF v_existing.source_shop_id <> v_source_shop_id
       OR v_existing.destination_shop_id <> _destination_shop_id
       OR v_saved_products IS DISTINCT FROM v_requested_products THEN
      RAISE EXCEPTION 'Ключ запроса уже использован для другого перемещения'
        USING errcode = '23505';
    END IF;
    RETURN v_existing.id;
  END IF;

  PERFORM p.id
  FROM public.products AS p
  WHERE p.id = ANY(_product_ids) AND p.business_id = v_business_id
  ORDER BY p.id
  FOR UPDATE;
  SELECT count(*) INTO v_product_count
  FROM public.products AS p
  WHERE p.id = ANY(_product_ids)
    AND p.business_id = v_business_id
    AND p.current_location_shop_id = v_source_shop_id
    AND p.status::text = 'in_stock'
    AND p.deleted_at IS NULL;
  IF v_product_count <> cardinality(_product_ids) THEN
    RAISE EXCEPTION 'Товар отсутствует в филиале или недоступен для перемещения'
      USING errcode = '23514';
  END IF;

  INSERT INTO public.branch_transfers (
    business_id, source_shop_id, destination_shop_id, client_request_id, created_by
  ) VALUES (
    v_business_id, v_source_shop_id, _destination_shop_id, _client_request_id, v_user_id
  )
  ON CONFLICT (business_id, created_by, client_request_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT t.* INTO v_existing
    FROM public.branch_transfers AS t
    WHERE t.business_id = v_business_id
      AND t.created_by = v_user_id
      AND t.client_request_id = _client_request_id;
    SELECT array_agg(i.product_id ORDER BY i.product_id) INTO v_saved_products
    FROM public.branch_transfer_items AS i WHERE i.transfer_id = v_existing.id;
    IF v_existing.source_shop_id <> v_source_shop_id
       OR v_existing.destination_shop_id <> _destination_shop_id
       OR v_saved_products IS DISTINCT FROM v_requested_products THEN
      RAISE EXCEPTION 'Ключ запроса уже использован для другого перемещения'
        USING errcode = '23505';
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.branch_transfer_items (transfer_id, business_id, product_id, qr_shop_id)
  SELECT v_inserted_id, v_business_id, p.id, p.shop_id
  FROM public.products AS p
  WHERE p.id = ANY(_product_ids)
  ORDER BY p.id;
  INSERT INTO public.branch_transfer_audit (
    transfer_id, business_id, event_type, actor_id, details
  ) VALUES (
    v_inserted_id, v_business_id, 'started', v_user_id,
    jsonb_build_object(
      'source_shop_id', v_source_shop_id,
      'destination_shop_id', _destination_shop_id,
      'product_ids', v_requested_products
    )
  );
  RETURN v_inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_branch_transfer(_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.branch_transfers%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_item_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в систему' USING errcode = '42501';
  END IF;
  SELECT t.* INTO v_transfer
  FROM public.branch_transfers AS t
  WHERE t.id = _transfer_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_branch_access(v_transfer.destination_shop_id)
     OR public.current_shop_id() <> v_transfer.destination_shop_id THEN
    RAISE EXCEPTION 'Нет доступа к филиалу-получателю' USING errcode = '42501';
  END IF;
  IF v_transfer.status = 'received' THEN
    RETURN v_transfer.id;
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Перемещение нельзя принять в текущем состоянии' USING errcode = '23514';
  END IF;

  PERFORM p.id
  FROM public.products AS p
  JOIN public.branch_transfer_items AS i
    ON i.product_id = p.id AND i.business_id = p.business_id
  WHERE i.transfer_id = v_transfer.id
  ORDER BY p.id
  FOR UPDATE OF p;
  SELECT count(*) INTO v_item_count
  FROM public.branch_transfer_items AS i
  JOIN public.products AS p
    ON p.id = i.product_id AND p.business_id = i.business_id
  WHERE i.transfer_id = v_transfer.id
    AND i.status = 'in_transit'
    AND p.current_location_shop_id = v_transfer.source_shop_id
    AND p.status::text = 'in_stock'
    AND p.deleted_at IS NULL;
  IF v_item_count = 0 OR v_item_count <> (
    SELECT count(*) FROM public.branch_transfer_items AS i
    WHERE i.transfer_id = v_transfer.id
  ) THEN
    RAISE EXCEPTION 'Состав перемещения или местоположение товара изменились'
      USING errcode = '23514';
  END IF;

  PERFORM set_config('app.branch_transfer_operation', 'on', true);
  UPDATE public.products AS p
     SET current_location_shop_id = v_transfer.destination_shop_id
    FROM public.branch_transfer_items AS i
   WHERE i.transfer_id = v_transfer.id
     AND i.product_id = p.id
     AND i.business_id = p.business_id;
  UPDATE public.branch_transfer_items
     SET status = 'received', received_at = now()
   WHERE transfer_id = v_transfer.id AND status = 'in_transit';
  UPDATE public.branch_transfers
     SET status = 'received', received_by = v_user_id, received_at = now()
   WHERE id = v_transfer.id;
  INSERT INTO public.branch_transfer_audit (
    transfer_id, business_id, event_type, actor_id, details
  ) VALUES (
    v_transfer.id, v_transfer.business_id, 'received', v_user_id,
    jsonb_build_object('destination_shop_id', v_transfer.destination_shop_id)
  );
  RETURN v_transfer.id;
END;
$$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_member_read ON public.businesses;
CREATE POLICY businesses_member_read ON public.businesses
  FOR SELECT TO authenticated USING (public.has_business_access(id));
DROP POLICY IF EXISTS branch_access_self_read ON public.profile_branch_access;
CREATE POLICY branch_access_self_read ON public.profile_branch_access
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
DROP POLICY IF EXISTS branch_access_admin_read ON public.profile_branch_access;
CREATE POLICY branch_access_admin_read ON public.profile_branch_access
  FOR SELECT TO authenticated USING (public.is_business_admin(business_id));
DROP POLICY IF EXISTS branch_access_admin_insert ON public.profile_branch_access;
CREATE POLICY branch_access_admin_insert ON public.profile_branch_access
  FOR INSERT TO authenticated WITH CHECK (public.is_business_admin(business_id));
DROP POLICY IF EXISTS branch_access_admin_delete ON public.profile_branch_access;
CREATE POLICY branch_access_admin_delete ON public.profile_branch_access
  FOR DELETE TO authenticated USING (public.is_business_admin(business_id));
DROP POLICY IF EXISTS shop_settings_accessible_branches_read ON public.shop_settings;
CREATE POLICY shop_settings_accessible_branches_read ON public.shop_settings
  FOR SELECT TO authenticated USING (public.has_branch_access(shop_id));
DROP POLICY IF EXISTS branch_transfers_member_read ON public.branch_transfers;
CREATE POLICY branch_transfers_member_read ON public.branch_transfers
  FOR SELECT TO authenticated USING (
    public.has_branch_access(source_shop_id)
    OR public.has_branch_access(destination_shop_id)
  );
DROP POLICY IF EXISTS branch_transfer_items_member_read ON public.branch_transfer_items;
CREATE POLICY branch_transfer_items_member_read ON public.branch_transfer_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.branch_transfers AS t
      WHERE t.id = transfer_id AND t.business_id = branch_transfer_items.business_id
        AND (public.has_branch_access(t.source_shop_id)
             OR public.has_branch_access(t.destination_shop_id))
    )
  );
DROP POLICY IF EXISTS branch_transfer_audit_member_read ON public.branch_transfer_audit;
CREATE POLICY branch_transfer_audit_member_read ON public.branch_transfer_audit
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.branch_transfers AS t
      WHERE t.id = transfer_id AND t.business_id = branch_transfer_audit.business_id
        AND (public.has_branch_access(t.source_shop_id)
             OR public.has_branch_access(t.destination_shop_id))
    )
  );

REVOKE ALL ON TABLE public.businesses, public.profile_branch_access,
  public.branch_transfers, public.branch_transfer_items, public.branch_transfer_audit
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.businesses, public.profile_branch_access,
  public.branch_transfers, public.branch_transfer_items, public.branch_transfer_audit
  TO authenticated;

REVOKE ALL ON FUNCTION public.has_branch_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_business_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_branch_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_active_shop(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_business_branch(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_branch_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_branch_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.begin_branch_transfer(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_branch_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_branch_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_branch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_branch_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_branch_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_branch_transfer(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_branch_transfer(uuid) TO authenticated;

COMMIT;
