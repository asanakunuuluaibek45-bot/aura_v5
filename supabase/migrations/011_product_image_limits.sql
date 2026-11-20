-- Enforce the same strict image policy at the storage boundary:
-- uploaded product/supplier photos must be WebP and no larger than 50 KiB.
DO $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = 51200,
      allowed_mime_types = ARRAY['image/webp']::text[]
  WHERE id = 'product-images';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Required storage bucket product-images does not exist';
  END IF;
END;
$$;
