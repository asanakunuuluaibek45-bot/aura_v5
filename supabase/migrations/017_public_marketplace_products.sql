-- Public, paginated product discovery for the marketplace and store catalogs.
-- Keep public_shop_products unchanged for existing clients and legacy pages.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.public_marketplace_products(
  _shop_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _before_created_at timestamp with time zone DEFAULT NULL,
  _before_id uuid DEFAULT NULL,
  _limit integer DEFAULT 25
)
RETURNS TABLE(
  id uuid, shop_id uuid, shop_seq_id integer, shop_name text, name text,
  category text, metal text, metal_color text, weight numeric, size text,
  sku text, stones text, description text, sale_price numeric, status text,
  images text[], image_url text, created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.shop_id, s.seq_id, s.shop_name, p.name, p.category, p.metal,
         p.metal_color, p.weight, p.size, p.sku, p.stones, p.description,
         p.sale_price, p.status::text, p.images, p.image_url, p.created_at
    FROM public.products AS p
    JOIN public.shop_settings AS s ON s.shop_id = p.shop_id
   WHERE s.public_enabled = true
     AND p.status = 'in_stock'
     AND coalesce(p.is_hidden, false) = false
     AND (_shop_id IS NULL OR p.shop_id = _shop_id)
     AND (
       nullif(btrim(_search), '') IS NULL
       OR p.name ILIKE '%' || btrim(_search) || '%'
       OR coalesce(p.sku, '') ILIKE '%' || btrim(_search) || '%'
       OR coalesce(p.category, '') ILIKE '%' || btrim(_search) || '%'
       OR coalesce(p.metal, '') ILIKE '%' || btrim(_search) || '%'
       OR coalesce(s.shop_name, '') ILIKE '%' || btrim(_search) || '%'
     )
     AND (
       (_before_created_at IS NULL AND _before_id IS NULL)
       OR (
         _before_created_at IS NOT NULL
         AND _before_id IS NOT NULL
         AND (p.created_at, p.id) < (_before_created_at, _before_id)
       )
     )
   ORDER BY p.created_at DESC, p.id DESC
   LIMIT LEAST(GREATEST(coalesce(_limit, 25), 1), 49);
$$;

REVOKE ALL ON FUNCTION public.public_marketplace_products(
  uuid, text, timestamp with time zone, uuid, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_marketplace_products(
  uuid, text, timestamp with time zone, uuid, integer
) TO anon, authenticated;

COMMIT;
