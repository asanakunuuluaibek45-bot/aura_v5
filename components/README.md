# Component boundaries

- `crm/` contains CRM navigation, administration, notifications, and business screens.
- `public/` contains components used by the public storefront and marketplace. Next.js route files remain in `app/` so their existing URLs do not change.
- `shared/` contains UI primitives, brand assets, authentication presentation, and providers used across routes.

The product-image upload component remains at `components/product-images.tsx` because the repository's image-policy rules and regression tests explicitly protect that path. Keep its shared compression and storage behavior unchanged unless those rules are intentionally revised.
