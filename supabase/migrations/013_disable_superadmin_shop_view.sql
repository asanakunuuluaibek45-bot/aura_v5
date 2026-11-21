BEGIN;

-- End any active temporary shop context. The profile's own shop_id is preserved.
UPDATE public.profiles
SET impersonated_shop_id = NULL
WHERE role = 'super_admin'
  AND impersonated_shop_id IS NOT NULL;

-- Tenant RLS now always uses the authenticated profile's assigned shop.
CREATE OR REPLACE FUNCTION public.current_shop_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT shop_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Remove the direct context-switch RPC until an approved, audited support flow exists.
DROP FUNCTION IF EXISTS public.superadmin_impersonate(uuid);

COMMIT;
