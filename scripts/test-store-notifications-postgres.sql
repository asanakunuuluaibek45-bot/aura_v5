\set ON_ERROR_STOP on
-- Run only in an empty disposable PostgreSQL database, never in Supabase.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.shop_settings (shop_id uuid PRIMARY KEY, shop_name text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, shop_id uuid, full_name text, role text, status text);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin' AND status = 'approved')
$$;
INSERT INTO public.shop_settings VALUES
  ('00000000-0000-0000-0000-000000000010', 'A'),
  ('00000000-0000-0000-0000-000000000020', 'B');
INSERT INTO public.profiles VALUES
  ('00000000-0000-0000-0000-000000000001', null, 'Owner', 'super_admin', 'approved'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Admin A', 'admin', 'approved'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Seller A', 'seller', 'approved'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000020', 'Seller B', 'seller', 'approved'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'Pending', 'seller', 'pending');

\ir ../supabase/migrations/014_store_notifications.sql

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.superadmin_store_notification_recipients('00000000-0000-0000-0000-000000000010')) <> 2 THEN
    RAISE EXCEPTION 'Recipient list must exclude pending and foreign-shop profiles';
  END IF;
  BEGIN
    PERFORM public.superadmin_store_notification_create('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000004', 'bad', 'bad');
    RAISE EXCEPTION 'Cross-shop recipient was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.superadmin_store_notification_create('00000000-0000-0000-0000-000000000010', null, '', 'bad');
    RAISE EXCEPTION 'Empty title was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
SELECT public.superadmin_store_notification_create(
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'Personal', 'For seller A'
) AS personal_id \gset
SELECT public.superadmin_store_notification_create(
  '00000000-0000-0000-0000-000000000010', null, 'Shop', 'For shop A'
) AS shop_id \gset

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.store_notification_list()) <> 1 THEN RAISE EXCEPTION 'Admin saw personal notice'; END IF;
  BEGIN
    PERFORM public.superadmin_store_notification_create('00000000-0000-0000-0000-000000000010', null, 'bad', 'bad');
    RAISE EXCEPTION 'Shop admin was allowed to send';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.store_notifications;
    RAISE EXCEPTION 'Direct table access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT set_config('test.personal_id', :'personal_id', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.store_notification_mark_read(current_setting('test.personal_id')::uuid);
    RAISE EXCEPTION 'Admin marked another user personal notice read';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.superadmin_store_notification_delete(current_setting('test.personal_id')::uuid);
    RAISE EXCEPTION 'Admin was allowed to delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT public.store_notification_mark_all_read();
DO $$ BEGIN
  IF public.store_notification_unread_count() <> 0 THEN RAISE EXCEPTION 'Mark all failed'; END IF;
END $$;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  IF public.store_notification_unread_count() <> 2 THEN RAISE EXCEPTION 'Read state leaked between users'; END IF;
END $$;
SELECT public.store_notification_mark_read(:'personal_id');
SELECT public.store_notification_mark_read(:'personal_id');
DO $$ BEGIN
  IF public.store_notification_unread_count() <> 1 THEN RAISE EXCEPTION 'Mark read is not idempotent'; END IF;
END $$;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.store_notification_list()) <> 0 THEN RAISE EXCEPTION 'Foreign shop saw notifications'; END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
DO $$ BEGIN
  IF public.store_notification_unread_count() <> 0 THEN RAISE EXCEPTION 'Pending user saw notifications'; END IF;
END $$;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT public.superadmin_store_notification_delete(:'shop_id');
RESET ROLE;
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.store_notifications) <> 0 THEN RAISE EXCEPTION 'Deleting target retained/broadcast the personal message'; END IF;
  IF (SELECT count(*) FROM public.store_notification_reads) <> 0 THEN RAISE EXCEPTION 'Read markers did not cascade'; END IF;
END $$;

SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.store_notification_list();
    RAISE EXCEPTION 'Anonymous execute was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'PASS: notification audience, permissions, validation, independent reads, deletion, anonymous access' AS result;
