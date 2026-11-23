# Branch and transfer data contract

This contract is the shared data boundary for the branch-management, product,
sales, transfer, and reporting work. `shop_settings` remains the canonical
store/branch record; no second store or product catalog is introduced.

## Business and branch identity

- `businesses.id` identifies a tenant business.
- `shop_settings.shop_id` remains the stable ID of an existing store and is
  also the branch ID. Legacy stores are backfilled as one-branch businesses.
- `shop_settings.business_id` ties each branch to exactly one business.
- A profile's `business_id` is derived from its existing home `shop_id`.
- `profile_branch_access` is the authoritative allowlist of branches for a
  profile. A branch is accessible only when its business matches the profile's
  business and the profile is approved.

## Active branch and server access

- Server code obtains the complete allowlist and active branch with the
  authenticated Supabase RPC `get_branch_context()`, through
  `getBranchContext()` in `lib/supabase/current-shop.ts`.
- The row marked `is_active` is the selected branch. `current_shop_id()` is
  the database/RLS equivalent and returns only that authorized branch.
- Change the active branch with `set_active_shop(shop_id)`. Do not trust a
  request, local storage, or offline profile to select an authorized branch.
- Admin-only branch creation and membership changes use
  `create_business_branch`, `grant_branch_access`, and
  `revoke_branch_access`.

## Product identity and location

- `products.shop_id` is immutable and remains the original shop ID encoded by
  the existing QR label. Do not rewrite it during a branch transfer.
- `products.current_location_shop_id` is the server-checked physical stock
  location. It starts equal to `shop_id` for all existing products.
- Generic product updates cannot change either identity field. Only the
  transactional branch-transfer RPC may change `current_location_shop_id`.
- A product in transit retains its source `current_location_shop_id` until
  `receive_branch_transfer_items` atomically records receipt at the destination.
  `branch_transfer_items.status = 'in_transit'` is the authoritative transit
  state.
- Database guards reject direct location changes, sale-state changes for
  products in transit, and attempts to sell a product from a branch other than
  its recorded location.

## Transfers, retries, and audit

- `begin_branch_transfer(client_request_id, destination_shop_id, product_ids)`
  uses the caller's active branch as the source. Source and destination must
  be accessible branches of the same business.
- `client_request_id` is unique per user and business. Repeating the same key
  and payload returns the original transfer; reusing it with a different
  payload is rejected.
- Product rows are locked in stable ID order. A partial unique index prevents
  a product from being in two active transfers, including concurrent requests.
- `receive_branch_transfer_items(transfer_id, product_ids, client_request_id, reason)`
  can only run from the active destination branch. It accepts only unique,
  in-transit products from that transfer, changes their location atomically,
  and requires a reason when the receipt is partial. Repeating the same
  request key and payload is idempotent; changing the payload is rejected.
- `receive_branch_transfer(transfer_id)` remains compatible and accepts all
  items still in transit. It also completes the remaining items after a
  partial receipt.
- `cancel_branch_transfer(transfer_id, returned_product_ids, client_request_id, reason)`
  can only run from the active source branch after scanning products physically
  returned there. It cancels only the still-in-transit scanned items, leaves
  already received items at the destination, and never silently changes a
  product location. A partially received transfer may cancel only the
  outstanding returned items; received items cannot be cancelled.
- `resolve_branch_transfer_scan(sku, qr_shop_seq_id, transfer_id)` resolves a
  scan only against the active branch's available stock or a selected transfer.
  `get_branch_transfer_details(transfer_id)` exposes product details only to an
  authorized source/destination branch. These functions do not broaden product
  table RLS for items in transit.
- Transfer statuses are `in_transit`, `partially_received`,
  `partially_cancelled`, `received`, and `cancelled`. Item statuses are
  `in_transit`, `received`, and `cancelled`.
- `branch_transfer_audit` records send, partial/full receipt, and cancellation
  in the same database transaction as the state change, including actor,
  reason, item IDs, remaining in-transit items, and an idempotency key.
  Transfer, item, and audit rows are readable only by approved members of the
  source or destination branch; clients cannot write them directly.

## Sales and offline compatibility

This foundation does not change sale records or the offline queue. Follow-up
work must retain the existing `shop_id` on historic operations, assign new
branch-scoped operations from the server's active branch, and preserve the
current QR URL/payload and photo-storage rules.
