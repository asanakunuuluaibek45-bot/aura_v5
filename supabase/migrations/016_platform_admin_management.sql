-- Safely manage existing platform accounts and remove a tenant without leaving
-- tenant-scoped rows behind. Historical business records prevent hard deletion
-- of an individual account; admins can instead revoke that account's access.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.platform_admin_action_log
  DROP CONSTRAINT IF EXISTS platform_admin_action_log_action_check,
  DROP CONSTRAINT IF EXISTS platform_admin_action_log_entity_type_check;

ALTER TABLE public.platform_admin_action_log
  ADD CONSTRAINT platform_admin_action_log_action_check
    CHECK (action IN (
      'announcement_published',
      'announcement_archived',
      'user_updated',
      'user_deleted',
      'shop_deleted'
    )),
  ADD CONSTRAINT platform_admin_action_log_entity_type_check
    CHECK (entity_type IN ('platform_announcement', 'profile', 'shop'));

-- Storage uses its own API, so authorize a narrowly scoped, short-lived cleanup
-- grant before the server action removes files for one confirmed shop.
CREATE TABLE public.platform_admin_storage_cleanup (
  shop_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, actor_id)
);

ALTER TABLE public.platform_admin_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admin_storage_cleanup FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admin_storage_cleanup TO authenticated;

CREATE POLICY platform_admin_storage_cleanup_actor_read
  ON public.platform_admin_storage_cleanup FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND public.is_super_admin());

DROP POLICY IF EXISTS platform_admin_shop_storage_delete ON storage.objects;
CREATE POLICY platform_admin_shop_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_super_admin()
    AND EXISTS (
      SELECT 1
      FROM public.platform_admin_storage_cleanup AS c
      WHERE c.actor_id = auth.uid()
        AND c.shop_id::text = (storage.foldername(name))[1]
        AND c.created_at > pg_catalog.statement_timestamp() - interval '30 minutes'
    )
  );

CREATE OR REPLACE FUNCTION public.superadmin_authorize_shop_storage_cleanup(_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_shop_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  SELECT p.shop_id INTO v_actor_shop_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
  IF v_actor_shop_id = _shop_id THEN
    RAISE EXCEPTION 'Нельзя удалить глобальный магазин платформы' USING errcode = '42501';
  END IF;
  IF _shop_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shop_settings WHERE shop_id = _shop_id
  ) THEN
    RAISE EXCEPTION 'Магазин не найден' USING errcode = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE shop_id = _shop_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Нельзя удалить магазин, к которому привязан суперадминистратор' USING errcode = '23514';
  END IF;

  INSERT INTO public.platform_admin_storage_cleanup (shop_id, actor_id, created_at)
  VALUES (_shop_id, auth.uid(), pg_catalog.statement_timestamp())
  ON CONFLICT (shop_id, actor_id)
  DO UPDATE SET created_at = EXCLUDED.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_list_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  role text,
  status text,
  shop_id uuid,
  shop_name text,
  requested_role text,
  created_at timestamptz,
  has_business_data boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.email, p.role::text, p.status::text,
         p.shop_id, ss.shop_name, p.requested_role, p.created_at,
         (
           EXISTS (SELECT 1 FROM public.sales AS s WHERE s.seller_id = p.id)
           OR EXISTS (SELECT 1 FROM public.products AS pr WHERE pr.created_by = p.id)
           OR EXISTS (SELECT 1 FROM public.cash_operations AS co WHERE co.created_by = p.id)
           OR EXISTS (SELECT 1 FROM public.cash_reason_presets AS crp WHERE crp.created_by = p.id)
           OR EXISTS (SELECT 1 FROM public.sale_returns AS sr WHERE sr.created_by = p.id)
         )
  FROM public.profiles AS p
  LEFT JOIN public.shop_settings AS ss ON ss.shop_id = p.shop_id
  ORDER BY p.created_at DESC, p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_update_user(
  _user_id uuid,
  _full_name text,
  _phone text,
  _role text,
  _status text,
  _shop_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_role text;
  v_old_status text;
  v_old_shop_id uuid;
  v_role public.app_role;
  v_status public.profile_status;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Пользователь не найден' USING errcode = 'P0002';
  END IF;
  IF _role IS NULL OR _role NOT IN ('seller', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Недопустимая роль пользователя' USING errcode = '22023';
  END IF;
  IF _status IS NULL OR _status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Недопустимый статус пользователя' USING errcode = '22023';
  END IF;
  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(_full_name, ''))) > 120 THEN
    RAISE EXCEPTION 'Имя не должно превышать 120 символов' USING errcode = '22023';
  END IF;
  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(_phone, ''))) > 40 THEN
    RAISE EXCEPTION 'Телефон не должен превышать 40 символов' USING errcode = '22023';
  END IF;
  IF _shop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_settings WHERE shop_id = _shop_id
  ) THEN
    RAISE EXCEPTION 'Магазин не найден' USING errcode = 'P0002';
  END IF;

  v_role := _role::public.app_role;
  v_status := _status::public.profile_status;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform-admin-accounts'));
  SELECT p.role::text, p.status::text, p.shop_id
    INTO v_old_role, v_old_status, v_old_shop_id
  FROM public.profiles AS p
  WHERE p.id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Пользователь не найден' USING errcode = 'P0002';
  END IF;

  IF _user_id = auth.uid()
     AND (
       v_old_role IS DISTINCT FROM _role
       OR v_old_status IS DISTINCT FROM _status
       OR v_old_shop_id IS DISTINCT FROM _shop_id
     ) THEN
    RAISE EXCEPTION 'Нельзя менять собственные роль, статус или магазин' USING errcode = '42501';
  END IF;

  IF v_old_shop_id IS DISTINCT FROM _shop_id
     AND (
       EXISTS (SELECT 1 FROM public.sales WHERE seller_id = _user_id)
       OR EXISTS (SELECT 1 FROM public.products WHERE created_by = _user_id)
       OR EXISTS (SELECT 1 FROM public.cash_operations WHERE created_by = _user_id)
       OR EXISTS (SELECT 1 FROM public.cash_reason_presets WHERE created_by = _user_id)
       OR EXISTS (SELECT 1 FROM public.sale_returns WHERE created_by = _user_id)
     ) THEN
    RAISE EXCEPTION 'Нельзя перенести аккаунт с товарами или финансовой историей в другой магазин' USING errcode = '23514';
  END IF;

  IF v_old_role = 'super_admin' AND v_old_status = 'approved'
     AND (_role <> 'super_admin' OR _status <> 'approved')
     AND (
       SELECT pg_catalog.count(*)
       FROM public.profiles
       WHERE role = 'super_admin' AND status = 'approved'
     ) <= 1 THEN
    RAISE EXCEPTION 'Нельзя отключить последнего действующего суперадминистратора' USING errcode = '23514';
  END IF;

  UPDATE public.profiles
     SET full_name = NULLIF(pg_catalog.btrim(COALESCE(_full_name, '')), ''),
         phone = NULLIF(pg_catalog.btrim(COALESCE(_phone, '')), ''),
         role = v_role,
         status = v_status,
         shop_id = _shop_id
   WHERE id = _user_id;

  INSERT INTO public.platform_admin_action_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(),
    'user_updated',
    'profile',
    _user_id,
    pg_catalog.jsonb_build_object(
      'role_before', v_old_role,
      'role_after', _role,
      'status_before', v_old_status,
      'status_after', _status,
      'shop_id_before', v_old_shop_id,
      'shop_id_after', _shop_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _user_id IS NULL OR _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Нельзя удалить собственную учётную запись' USING errcode = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('platform-admin-accounts'));
  SELECT p.role::text, p.status::text
    INTO v_role, v_status
  FROM public.profiles AS p
  WHERE p.id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Пользователь не найден' USING errcode = 'P0002';
  END IF;

  IF v_role = 'super_admin' AND v_status = 'approved'
     AND (
       SELECT pg_catalog.count(*)
       FROM public.profiles
       WHERE role = 'super_admin' AND status = 'approved'
     ) <= 1 THEN
    RAISE EXCEPTION 'Нельзя удалить последнего действующего суперадминистратора' USING errcode = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sales WHERE seller_id = _user_id)
     OR EXISTS (SELECT 1 FROM public.products WHERE created_by = _user_id)
     OR EXISTS (SELECT 1 FROM public.cash_operations WHERE created_by = _user_id)
     OR EXISTS (SELECT 1 FROM public.cash_reason_presets WHERE created_by = _user_id)
     OR EXISTS (SELECT 1 FROM public.sale_returns WHERE created_by = _user_id) THEN
    RAISE EXCEPTION 'Аккаунт связан с товарами, продажами или кассовой историей. Отключите доступ вместо полного удаления.' USING errcode = '23514';
  END IF;

  -- Notifications authored by this profile have a RESTRICT foreign key.
  DELETE FROM public.store_notifications WHERE created_by = _user_id;
  DELETE FROM public.superadmin_notifications WHERE profile_id = _user_id;

  INSERT INTO public.platform_admin_action_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(),
    'user_deleted',
    'profile',
    _user_id,
    pg_catalog.jsonb_build_object('role', v_role, 'status', v_status)
  );

  -- The profiles row is removed by its auth.users foreign key. Other business
  -- rows are protected above so deletion cannot silently erase their history.
  DELETE FROM auth.users WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Учётная запись не найдена' USING errcode = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_shop(_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shop_name text;
  v_global_shop_id uuid;
  v_table text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _shop_id IS NULL THEN
    RAISE EXCEPTION 'Магазин не найден' USING errcode = 'P0002';
  END IF;

  SELECT p.shop_id INTO v_global_shop_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
  IF v_global_shop_id = _shop_id THEN
    RAISE EXCEPTION 'Нельзя удалить глобальный магазин платформы' USING errcode = '42501';
  END IF;

  SELECT ss.shop_name INTO v_shop_name
  FROM public.shop_settings AS ss
  WHERE ss.shop_id = _shop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Магазин не найден' USING errcode = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_admin_storage_cleanup AS c
    WHERE c.shop_id = _shop_id
      AND c.actor_id = auth.uid()
      AND c.created_at > pg_catalog.statement_timestamp() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'Сначала удалите фотографии магазина через безопасную очистку хранилища' USING errcode = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS o
    WHERE o.bucket_id = 'product-images'
      AND (storage.foldername(o.name))[1] = _shop_id::text
  ) THEN
    RAISE EXCEPTION 'Не все фотографии магазина удалось удалить; повторите очистку хранилища' USING errcode = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE shop_id = _shop_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Нельзя удалить магазин, к которому привязан суперадминистратор' USING errcode = '23514';
  END IF;

  INSERT INTO public.platform_admin_action_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(),
    'shop_deleted',
    'shop',
    _shop_id,
    pg_catalog.jsonb_build_object('shop_name', v_shop_name)
  );

  -- A removed tenant disables its former accounts but preserves their auth
  -- identities and personal contact data. Every public tenant table with a
  -- shop_id column is then emptied, including future tenant tables.
  UPDATE public.profiles
     SET status = 'rejected',
         role = NULL,
         shop_id = NULL,
         impersonated_shop_id = NULL
   WHERE shop_id = _shop_id;

  FOR v_table IN
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT IN ('profiles', 'shop_settings', 'platform_admin_storage_cleanup')
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = c.oid
          AND a.attname = 'shop_id'
          AND NOT a.attisdropped
      )
    ORDER BY c.relname
  LOOP
    EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE shop_id = $1', v_table)
      USING _shop_id;
  END LOOP;

  DELETE FROM public.shop_settings WHERE shop_id = _shop_id;
  DELETE FROM public.platform_admin_storage_cleanup
   WHERE shop_id = _shop_id AND actor_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_authorize_shop_storage_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_update_user(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_delete_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_delete_shop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_authorize_shop_storage_cleanup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_update_user(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_shop(uuid) TO authenticated;

COMMIT;
