-- Store announcements are one-way notifications, not conversations.
-- Only approved super admins may create or delete them. Recipients can only
-- read notifications addressed to their own approved shop profile.
-- Existing platform_announcements and announcement history are not modified.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.store_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shop_settings(shop_id) ON DELETE CASCADE,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.store_notifications(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, profile_id)
);

CREATE INDEX store_notifications_shop_created_idx
  ON public.store_notifications (shop_id, created_at DESC);
CREATE INDEX store_notifications_target_created_idx
  ON public.store_notifications (recipient_profile_id, created_at DESC)
  WHERE recipient_profile_id IS NOT NULL;
CREATE INDEX store_notification_reads_profile_idx
  ON public.store_notification_reads (profile_id, read_at DESC);

ALTER TABLE public.store_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_notification_reads ENABLE ROW LEVEL SECURITY;

-- No direct table access: every operation goes through the guarded RPCs below.
REVOKE ALL ON public.store_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.store_notification_reads FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.store_notification_list(_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  title text,
  message text,
  created_at timestamptz,
  is_read boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.id, n.shop_id, n.title, n.message, n.created_at,
         (r.notification_id IS NOT NULL) AS is_read
  FROM public.store_notifications AS n
  JOIN public.profiles AS p
    ON p.id = auth.uid()
   AND p.status = 'approved'
   AND p.role IN ('admin', 'seller')
   AND p.shop_id = n.shop_id
  LEFT JOIN public.store_notification_reads AS r
    ON r.notification_id = n.id
   AND r.profile_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND (n.recipient_profile_id IS NULL OR n.recipient_profile_id = auth.uid())
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.store_notification_unread_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.store_notifications AS n
  JOIN public.profiles AS p
    ON p.id = auth.uid()
   AND p.status = 'approved'
   AND p.role IN ('admin', 'seller')
   AND p.shop_id = n.shop_id
  WHERE auth.uid() IS NOT NULL
    AND (n.recipient_profile_id IS NULL OR n.recipient_profile_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1
      FROM public.store_notification_reads AS r
      WHERE r.notification_id = n.id
        AND r.profile_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.store_notification_mark_read(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.store_notifications AS n
    JOIN public.profiles AS p
      ON p.id = auth.uid()
     AND p.status = 'approved'
     AND p.role IN ('admin', 'seller')
     AND p.shop_id = n.shop_id
    WHERE n.id = _notification_id
      AND (n.recipient_profile_id IS NULL OR n.recipient_profile_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Уведомление не найдено' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.store_notification_reads (notification_id, profile_id)
  VALUES (_notification_id, auth.uid())
  ON CONFLICT (notification_id, profile_id)
  DO UPDATE SET read_at = EXCLUDED.read_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_notification_mark_all_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.store_notification_reads (notification_id, profile_id)
  SELECT n.id, auth.uid()
  FROM public.store_notifications AS n
  JOIN public.profiles AS p
    ON p.id = auth.uid()
   AND p.status = 'approved'
   AND p.role IN ('admin', 'seller')
   AND p.shop_id = n.shop_id
  WHERE auth.uid() IS NOT NULL
    AND (n.recipient_profile_id IS NULL OR n.recipient_profile_id = auth.uid())
  ON CONFLICT (notification_id, profile_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_store_notification_recipients(_shop_id uuid)
RETURNS TABLE (profile_id uuid, full_name text, role text)
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
  SELECT p.id, p.full_name, p.role::text
  FROM public.profiles AS p
  WHERE p.shop_id = _shop_id
    AND p.status = 'approved'
    AND p.role IN ('admin', 'seller')
  ORDER BY p.full_name NULLS LAST, p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_store_notification_list(_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  recipient_profile_id uuid,
  recipient_name text,
  title text,
  message text,
  created_at timestamptz
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
  SELECT n.id, n.shop_id, ss.shop_name, n.recipient_profile_id, p.full_name,
         n.title, n.message, n.created_at
  FROM public.store_notifications AS n
  JOIN public.shop_settings AS ss ON ss.shop_id = n.shop_id
  LEFT JOIN public.profiles AS p ON p.id = n.recipient_profile_id
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_store_notification_create(
  _shop_id uuid,
  _recipient_profile_id uuid,
  _title text,
  _message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_title text := btrim(COALESCE(_title, ''));
  v_message text := btrim(COALESCE(_message, ''));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _shop_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shop_settings WHERE shop_id = _shop_id
  ) THEN
    RAISE EXCEPTION 'Магазин не найден' USING errcode = 'P0002';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Заголовок должен содержать от 1 до 120 символов' USING errcode = '22023';
  END IF;
  IF char_length(v_message) NOT BETWEEN 1 AND 3000 THEN
    RAISE EXCEPTION 'Текст должен содержать от 1 до 3000 символов' USING errcode = '22023';
  END IF;
  IF _recipient_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = _recipient_profile_id
      AND p.shop_id = _shop_id
      AND p.status = 'approved'
      AND p.role IN ('admin', 'seller')
  ) THEN
    RAISE EXCEPTION 'Получатель не найден в выбранном магазине' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.store_notifications
    (shop_id, recipient_profile_id, created_by, title, message)
  VALUES (_shop_id, _recipient_profile_id, auth.uid(), v_title, v_message)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_store_notification_delete(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;

  DELETE FROM public.store_notifications WHERE id = _notification_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Уведомление не найдено' USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_notification_list(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.store_notification_unread_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.store_notification_mark_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.store_notification_mark_all_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_store_notification_recipients(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_store_notification_list(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_store_notification_create(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_store_notification_delete(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.store_notification_list(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_notification_mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_notification_mark_all_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_store_notification_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_store_notification_list(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_store_notification_create(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_store_notification_delete(uuid) TO authenticated;

COMMIT;
