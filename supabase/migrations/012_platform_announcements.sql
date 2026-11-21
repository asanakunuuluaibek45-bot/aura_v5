-- Platform-wide and shop-scoped announcements. Do not create per-user delivery rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  scope_type text NOT NULL CHECK (scope_type IN ('all', 'shop')),
  shop_id uuid REFERENCES public.shop_settings(shop_id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_announcements_scope_shop_check CHECK (
    (scope_type = 'all' AND shop_id IS NULL)
    OR (scope_type = 'shop' AND shop_id IS NOT NULL)
  ),
  CONSTRAINT platform_announcements_expiry_check CHECK (
    expires_at IS NULL OR expires_at > published_at
  )
);

CREATE INDEX platform_announcements_published_idx
  ON public.platform_announcements (published_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX platform_announcements_shop_published_idx
  ON public.platform_announcements (shop_id, published_at DESC)
  WHERE scope_type = 'shop' AND archived_at IS NULL;

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_announcements TO authenticated;

CREATE POLICY platform_announcements_read_audience
  ON public.platform_announcements FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_approved()
      AND archived_at IS NULL
      AND published_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        scope_type = 'all'
        OR (scope_type = 'shop' AND shop_id = public.current_shop_id())
      )
    )
  );

-- One row per user, updated on feed view; never one row per announcement or poll.
CREATE TABLE public.announcement_view_state (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shop_settings(shop_id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id)
);

ALTER TABLE public.announcement_view_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.announcement_view_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.announcement_view_state TO authenticated;

CREATE POLICY announcement_view_state_own_shop
  ON public.announcement_view_state FOR ALL TO authenticated
  USING (
    public.is_approved()
    AND user_id = auth.uid()
    AND shop_id = public.current_shop_id()
  )
  WITH CHECK (
    public.is_approved()
    AND user_id = auth.uid()
    AND shop_id = public.current_shop_id()
  );

-- Append-only audit trail for platform-admin changes made by this feature.
CREATE TABLE public.platform_admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('announcement_published', 'announcement_archived')),
  entity_type text NOT NULL CHECK (entity_type = 'platform_announcement'),
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_admin_action_log_created_idx
  ON public.platform_admin_action_log (created_at DESC);
ALTER TABLE public.platform_admin_action_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admin_action_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admin_action_log TO authenticated;

CREATE POLICY platform_admin_action_log_super_admin_read
  ON public.platform_admin_action_log FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.admin_create_platform_announcement(
  _body text,
  _scope_type text,
  _shop_id uuid DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_body text := btrim(_body);
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Недостаточно прав' USING errcode = '42501';
  END IF;
  IF v_body IS NULL OR length(v_body) < 1 OR length(v_body) > 5000 THEN
    RAISE EXCEPTION 'Текст объявления должен содержать от 1 до 5000 символов' USING errcode = '22023';
  END IF;
  IF _scope_type IS NULL
     OR _scope_type NOT IN ('all', 'shop')
     OR (_scope_type = 'all' AND _shop_id IS NOT NULL)
     OR (_scope_type = 'shop' AND _shop_id IS NULL) THEN
    RAISE EXCEPTION 'Некорректная область объявления' USING errcode = '22023';
  END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= pg_catalog.statement_timestamp() THEN
    RAISE EXCEPTION 'Дата окончания должна быть в будущем' USING errcode = '22023';
  END IF;

  INSERT INTO public.platform_announcements (
    id, body, scope_type, shop_id, expires_at, created_by
  ) VALUES (
    v_id, v_body, _scope_type, _shop_id, _expires_at, auth.uid()
  );

  INSERT INTO public.platform_admin_action_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(),
    'announcement_published',
    'platform_announcement',
    v_id,
    pg_catalog.jsonb_build_object('scope_type', _scope_type, 'shop_id', _shop_id)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_platform_announcement(text, text, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_platform_announcement(text, text, uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_archive_platform_announcement(_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_scope_type text;
  v_shop_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Недостаточно прав' USING errcode = '42501';
  END IF;

  UPDATE public.platform_announcements
     SET archived_at = pg_catalog.statement_timestamp()
   WHERE id = _announcement_id
     AND archived_at IS NULL
   RETURNING scope_type, shop_id INTO v_scope_type, v_shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Объявление не найдено или уже архивировано' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.platform_admin_action_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    auth.uid(),
    'announcement_archived',
    'platform_announcement',
    _announcement_id,
    pg_catalog.jsonb_build_object('scope_type', v_scope_type, 'shop_id', v_shop_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_platform_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_platform_announcement(uuid) TO authenticated;

COMMIT;
