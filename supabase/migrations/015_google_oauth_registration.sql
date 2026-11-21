BEGIN;
SET LOCAL lock_timeout = '5s';

-- Google users provide store details after OAuth; avoid creating an unnamed shop
-- in the auth.users trigger. Existing email/password registrations still carry
-- shop_name and keep their current provisioning behavior.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shop_name text := nullif(btrim(new.raw_user_meta_data ->> 'shop_name'), '');
  v_full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  );
  v_shop_id uuid;
BEGIN
  IF v_shop_name IS NOT NULL THEN
    SELECT p.shop_id INTO v_shop_id
      FROM public.profiles p
     WHERE p.shop_name IS NOT DISTINCT FROM v_shop_name
       AND p.shop_id IS NOT NULL
     ORDER BY p.created_at ASC
     LIMIT 1;
    IF v_shop_id IS NULL THEN
      v_shop_id := gen_random_uuid();
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, shop_name, shop_id, phone, requested_role, email, status
  ) VALUES (
    new.id,
    v_full_name,
    v_shop_name,
    v_shop_id,
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'requested_role', ''),
    new.email,
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_shop_id IS NOT NULL THEN
    INSERT INTO public.shop_settings AS existing (shop_id, shop_name)
    VALUES (v_shop_id, v_shop_name)
    ON CONFLICT (shop_id) DO UPDATE
      SET shop_name = COALESCE(existing.shop_name, EXCLUDED.shop_name);
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_google_registration(
  _full_name text,
  _shop_name text,
  _phone text DEFAULT NULL,
  _requested_role text DEFAULT 'seller'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_status text;
  v_profile_shop_name text;
  v_profile_requested_role text;
  v_profile_shop_id uuid;
  v_full_name text := nullif(btrim(_full_name), '');
  v_shop_name text := nullif(btrim(_shop_name), '');
  v_phone text := nullif(btrim(_phone), '');
  v_requested_role text := coalesce(nullif(btrim(_requested_role), ''), 'seller');
  v_shop_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '42501';
  END IF;
  IF v_full_name IS NULL OR length(v_full_name) > 160 THEN
    RAISE EXCEPTION 'Укажите имя длиной не более 160 символов' USING ERRCODE = '22023';
  END IF;
  IF v_shop_name IS NULL OR length(v_shop_name) > 200 THEN
    RAISE EXCEPTION 'Укажите название магазина длиной не более 200 символов' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) > 50 THEN
    RAISE EXCEPTION 'Номер телефона не должен превышать 50 символов' USING ERRCODE = '22023';
  END IF;
  IF v_requested_role NOT IN ('seller', 'admin') THEN
    RAISE EXCEPTION 'Недопустимая запрашиваемая роль' USING ERRCODE = '22023';
  END IF;

  SELECT status::text, shop_name, requested_role, shop_id
    INTO v_profile_status, v_profile_shop_name, v_profile_requested_role, v_profile_shop_id
    FROM public.profiles
   WHERE id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND
     OR v_profile_status <> 'pending'
     OR v_profile_shop_name IS NOT NULL
     OR v_profile_requested_role IS NOT NULL THEN
    RAISE EXCEPTION 'Регистрацию Google нельзя изменить' USING ERRCODE = '42501';
  END IF;

  SELECT p.shop_id INTO v_shop_id
    FROM public.profiles p
   WHERE lower(btrim(p.shop_name)) = lower(v_shop_name)
     AND p.shop_id IS NOT NULL
   ORDER BY p.created_at ASC
   LIMIT 1;
  IF v_shop_id IS NULL THEN
    v_shop_id := coalesce(v_profile_shop_id, gen_random_uuid());
  END IF;

  INSERT INTO public.shop_settings AS existing (shop_id, shop_name)
  VALUES (v_shop_id, v_shop_name)
  ON CONFLICT (shop_id) DO UPDATE
    SET shop_name = coalesce(existing.shop_name, EXCLUDED.shop_name);

  UPDATE public.profiles
     SET full_name = v_full_name,
         shop_name = v_shop_name,
         shop_id = v_shop_id,
         phone = v_phone,
         requested_role = v_requested_role
   WHERE id = auth.uid()
     AND status = 'pending'
     AND shop_name IS NULL
     AND requested_role IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Регистрацию Google нельзя изменить' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_google_registration(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_google_registration(text, text, text, text) TO authenticated;

COMMIT;
