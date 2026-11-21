-- Platform-wide marketplace controls and numbered catalogue pages.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.marketplace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  hero_image_url text,
  hide_products_without_photo boolean NOT NULL DEFAULT false,
  products_per_page integer NOT NULL DEFAULT 12
    CHECK (products_per_page IN (8, 12, 16, 24)),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT marketplace_settings_hero_image_url_https
    CHECK (
      hero_image_url IS NULL
      OR (
        length(hero_image_url) <= 2048
        AND hero_image_url ~* '^https://[^[:space:]]+$'
      )
    )
);

ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.marketplace_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.public_marketplace_settings()
RETURNS TABLE(
  hero_image_url text,
  hide_products_without_photo boolean,
  products_per_page integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT settings.hero_image_url,
         settings.hide_products_without_photo,
         settings.products_per_page
    FROM public.marketplace_settings AS settings
   WHERE settings.id = true;
$$;

REVOKE ALL ON FUNCTION public.public_marketplace_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_marketplace_settings() TO anon, authenticated;

CREATE FUNCTION public.public_marketplace_products_page(
  _shop_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _category text DEFAULT NULL,
  _metal text DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _hide_without_photo boolean DEFAULT false,
  _offset integer DEFAULT 0,
  _limit integer DEFAULT 12
)
RETURNS TABLE(
  id uuid,
  shop_id uuid,
  shop_seq_id integer,
  shop_name text,
  name text,
  category text,
  metal text,
  metal_color text,
  weight numeric,
  size text,
  sku text,
  stones text,
  description text,
  sale_price numeric,
  status text,
  images text[],
  image_url text,
  created_at timestamp with time zone,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH matching AS MATERIALIZED (
    SELECT p.id,
           p.shop_id,
           s.seq_id AS shop_seq_id,
           s.shop_name,
           p.name,
           p.category,
           p.metal,
           p.metal_color,
           p.weight,
           p.size,
           p.sku,
           p.stones,
           p.description,
           p.sale_price,
           p.status::text AS status,
           p.images,
           p.image_url,
           p.created_at
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
       AND (nullif(btrim(_category), '') IS NULL OR p.category = btrim(_category))
       AND (nullif(btrim(_metal), '') IS NULL OR p.metal = btrim(_metal))
       AND (_min_price IS NULL OR p.sale_price >= _min_price)
       AND (_max_price IS NULL OR p.sale_price <= _max_price)
       AND (
         NOT coalesce(_hide_without_photo, false)
         OR EXISTS (
           SELECT 1
             FROM unnest(coalesce(p.images, ARRAY[]::text[])) AS image(value)
            WHERE nullif(btrim(image.value), '') IS NOT NULL
         )
         OR nullif(btrim(p.image_url), '') IS NOT NULL
       )
  ),
  page_rows AS (
    SELECT matching.*
      FROM matching
     ORDER BY matching.created_at DESC, matching.id DESC
     OFFSET least(greatest(coalesce(_offset, 0), 0), 240000)
     LIMIT least(greatest(coalesce(_limit, 12), 1), 24)
  )
  SELECT page_rows.*,
         (SELECT count(*) FROM matching)::bigint AS total_count
    FROM page_rows
   ORDER BY page_rows.created_at DESC, page_rows.id DESC;
$$;

REVOKE ALL ON FUNCTION public.public_marketplace_products_page(
  uuid, text, text, text, numeric, numeric, boolean, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_marketplace_products_page(
  uuid, text, text, text, numeric, numeric, boolean, integer, integer
) TO anon, authenticated;

CREATE FUNCTION public.public_marketplace_facets_policy(
  _shop_id uuid DEFAULT NULL,
  _hide_without_photo boolean DEFAULT false
)
RETURNS TABLE(categories text[], metals text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    coalesce(
      array_agg(DISTINCT btrim(p.category) ORDER BY btrim(p.category))
        FILTER (WHERE nullif(btrim(p.category), '') IS NOT NULL),
      ARRAY[]::text[]
    ),
    coalesce(
      array_agg(DISTINCT btrim(p.metal) ORDER BY btrim(p.metal))
        FILTER (WHERE nullif(btrim(p.metal), '') IS NOT NULL),
      ARRAY[]::text[]
    )
  FROM public.products AS p
  JOIN public.shop_settings AS s ON s.shop_id = p.shop_id
  WHERE s.public_enabled = true
    AND p.status = 'in_stock'
    AND coalesce(p.is_hidden, false) = false
    AND (_shop_id IS NULL OR p.shop_id = _shop_id)
    AND (
      NOT coalesce(_hide_without_photo, false)
      OR EXISTS (
        SELECT 1
          FROM unnest(coalesce(p.images, ARRAY[]::text[])) AS image(value)
         WHERE nullif(btrim(image.value), '') IS NOT NULL
      )
      OR nullif(btrim(p.image_url), '') IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.public_marketplace_facets_policy(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_marketplace_facets_policy(uuid, boolean) TO anon, authenticated;

CREATE FUNCTION public.superadmin_update_marketplace_settings(
  _hero_image_url text,
  _hide_products_without_photo boolean,
  _products_per_page integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
     AND (
       length(_hero_image_url) > 2048
       OR _hero_image_url !~* '^https://[^[:space:]]+$'
     ) THEN
    RAISE EXCEPTION 'Hero image must use a valid HTTPS URL' USING errcode = '22023';
  END IF;

  UPDATE public.marketplace_settings
     SET hero_image_url = _hero_image_url,
         hide_products_without_photo = _hide_products_without_photo,
         products_per_page = _products_per_page,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_marketplace_settings(text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_update_marketplace_settings(text, boolean, integer) TO authenticated;

COMMIT;
