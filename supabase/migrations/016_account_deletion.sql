-- Remove account-owned rows during Auth deletion. If an approved shop admin
-- is the final admin, remove every shop-scoped database record in the same
-- transaction as deleting that Auth user.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.cleanup_user_data_before_auth_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_shop_id uuid;
  v_role text;
  v_status text;
BEGIN
  SELECT p.shop_id, p.role::text, p.status::text
    INTO v_shop_id, v_role, v_status
    FROM public.profiles AS p
   WHERE p.id = OLD.id
   FOR UPDATE;

  -- Serialize concurrent admin deletions for one shop. The later deletion
  -- rechecks the remaining approved admins after the first transaction ends.
  IF v_shop_id IS NOT NULL AND v_role = 'admin' AND v_status = 'approved' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_shop_id::text, 0)
    );
  END IF;

  -- These tables keep account attribution without an Auth foreign key, or
  -- restrict profile deletion. Remove the departing user's own rows first.
  DELETE FROM public.supplier_debt_operations WHERE created_by = OLD.id;
  DELETE FROM public.action_history
   WHERE employee_id = OLD.id OR undone_by = OLD.id;
  DELETE FROM public.label_templates
   WHERE created_by = OLD.id OR updated_by = OLD.id;
  DELETE FROM public.superadmin_notifications WHERE profile_id = OLD.id;
  DELETE FROM public.store_notifications WHERE created_by = OLD.id;
  DELETE FROM public.platform_admin_action_log WHERE actor_id = OLD.id;
  DELETE FROM public.platform_announcements WHERE created_by = OLD.id;

  IF v_shop_id IS NOT NULL AND v_role = 'admin' AND v_status = 'approved'
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles AS remaining
        WHERE remaining.shop_id = v_shop_id
          AND remaining.id <> OLD.id
          AND remaining.role = 'admin'
          AND remaining.status = 'approved'
     ) THEN
    -- Notifications reference profiles with ON DELETE RESTRICT, so remove
    -- them before the Auth deletion cascades through profiles.
    DELETE FROM public.store_notification_reads AS reads
     USING public.store_notifications AS notifications
     WHERE reads.notification_id = notifications.id
       AND notifications.shop_id = v_shop_id;
    DELETE FROM public.store_notifications WHERE shop_id = v_shop_id;

    -- Shop-specific announcements restrict deleting shop_settings.
    DELETE FROM public.platform_admin_action_log
     WHERE entity_id IN (
       SELECT id FROM public.platform_announcements WHERE shop_id = v_shop_id
     );
    DELETE FROM public.platform_announcements WHERE shop_id = v_shop_id;
    DELETE FROM public.announcement_view_state WHERE shop_id = v_shop_id;

    DELETE FROM public.supplier_debt_operations WHERE shop_id = v_shop_id;
    DELETE FROM public.sale_returns WHERE shop_id = v_shop_id;
    DELETE FROM public.products WHERE shop_id = v_shop_id;
    DELETE FROM public.product_unit_usage WHERE shop_id = v_shop_id;
    DELETE FROM public.action_history WHERE shop_id = v_shop_id;
    DELETE FROM public.cash_operations WHERE shop_id = v_shop_id;
    DELETE FROM public.cash_reason_presets WHERE shop_id = v_shop_id;
    DELETE FROM public.customers WHERE shop_id = v_shop_id;
    DELETE FROM public.label_templates WHERE shop_id = v_shop_id;
    DELETE FROM public.metal_rates WHERE shop_id = v_shop_id;
    DELETE FROM public.product_deletion_tombstones WHERE shop_id = v_shop_id;
    DELETE FROM public.sales WHERE shop_id = v_shop_id;
    DELETE FROM public.superadmin_notifications WHERE shop_id = v_shop_id;
    DELETE FROM public.supplier_profiles WHERE shop_id = v_shop_id;
    DELETE FROM public.shop_settings WHERE shop_id = v_shop_id;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_user_data_before_auth_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_delete_cleanup ON auth.users;
CREATE TRIGGER on_auth_user_delete_cleanup
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_user_data_before_auth_delete();

COMMIT;
