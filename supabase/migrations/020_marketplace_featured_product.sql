-- Let superadmins feature a real public product and one of its photos on the homepage.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.marketplace_settings
  ADD COLUMN hero_shop_id uuid,
  ADD COLUMN hero_product_id uuid,
  ADD COLUMN hero_photo_index integer NOT NULL DEFAULT 0
    CHECK (hero_photo_index >= 0);

DROP FUNCTION public.public_marketplace_settings();
CREATE FUNCTION public.public_marketplace_settings()
RETURNS TABLE(
  hero_image_url text,
  hero_shop_id uuid,
  hero_product_id uuid,
  hero_photo_index integer,
  hide_products_without_photo boolean,
  products_per_page integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT settings.hero_image_url,
         settings.hero_shop_id,
         settings.hero_product_id,
         settings.hero_photo_index,
         settings.hide_products_without_photo,
         settings.products_per_page
    FROM public.marketplace_settings AS settings
   WHERE settings.id = true;
$$;
REVOKE ALL ON FUNCTION public.public_marketplace_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_marketplace_settings() TO anon, authenticated;

DROP FUNCTION public.superadmin_update_marketplace_settings(text, boolean, integer);
CREATE FUNCTION public.superadmin_update_marketplace_settings(
  _hero_image_url text,
  _hero_shop_id uuid,
  _hero_product_id uuid,
  _hero_photo_index integer,
  _hide_products_without_photo boolean,
  _products_per_page integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires super_admin role' USING errcode = '42501';
  END IF;
  IF _products_per_page IS NULL OR _products_per_page NOT IN (8, 12, 16, 24) THEN
    RAISE EXCEPTION 'Invalid marketplace page size' USING errcode = '22023';
  END IF;
  IF _hide_products_without_photo IS NULL THEN
    RAISE EXCEPTION 'Invalid marketplace photo setting' USING errcode = '22023';
  END IF;
  IF _hero_image_url IS NOT NULL
     AND (length(_hero_image_url) > 2048 OR _hero_image_url !~* '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Hero image must use a valid HTTPS URL' USING errcode = '22023';
  END IF;
  IF _hero_photo_index IS NULL OR _hero_photo_index < 0 THEN
    RAISE EXCEPTION 'Invalid featured product photo index' USING errcode = '22023';
  END IF;
  IF _hero_product_id IS NOT NULL AND _hero_shop_id IS NULL THEN
    RAISE EXCEPTION 'A featured product requires a shop' USING errcode = '22023';
  END IF;
  IF _hero_shop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_settings AS shop
     WHERE shop.shop_id = _hero_shop_id
       AND shop.public_enabled = true
  ) THEN
    RAISE EXCEPTION 'Featured shop is not publicly available' USING errcode = '22023';
  END IF;
  IF _hero_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.products AS product
      JOIN public.shop_settings AS shop ON shop.shop_id = product.shop_id
     WHERE product.id = _hero_product_id
       AND product.shop_id = _hero_shop_id
       AND product.status = 'in_stock'
       AND coalesce(product.is_hidden, false) = false
       AND shop.public_enabled = true
       AND (
         EXISTS (
           SELECT 1
             FROM unnest(coalesce(product.images, ARRAY[]::text[])) AS image(value)
            WHERE nullif(btrim(image.value), '') IS NOT NULL
         )
         OR nullif(btrim(product.image_url), '') IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'Featured product must be a public in-stock product with a photo in the selected shop' USING errcode = '22023';
  END IF;

  UPDATE public.marketplace_settings
     SET hero_image_url = _hero_image_url,
         hero_shop_id = _hero_shop_id,
         hero_product_id = _hero_product_id,
         hero_photo_index = CASE WHEN _hero_product_id IS NULL THEN 0 ELSE _hero_photo_index END,
         hide_products_without_photo = _hide_products_without_photo,
         products_per_page = _products_per_page,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true;
END;
$$;
REVOKE ALL ON FUNCTION public.superadmin_update_marketplace_settings(text, uuid, uuid, integer, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_update_marketplace_settings(text, uuid, uuid, integer, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_product(_shop_id uuid, _article text)
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
    FROM public.products p
    JOIN public.shop_settings s ON s.shop_id = p.shop_id
   WHERE p.shop_id = _shop_id
     AND (
       p.id::text = lower(btrim(_article))
       OR p.sku = upper(btrim(_article))
     )
     AND coalesce(p.is_hidden, false) = false
     AND s.public_enabled = true
   ORDER BY (p.id::text = lower(btrim(_article))) DESC
   LIMIT 1;
$$;

COMMIT;
