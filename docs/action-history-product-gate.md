# Product history trigger: skip non-business updates

Migration: `supabase/migrations/20261024_action_history_product_update_gate.sql`.

The product AFTER UPDATE trigger now has a typed, NULL-safe `WHEN` predicate
covering exactly the existing product edit whitelist. A status-only, timestamp-only,
deletion metadata, consignment metadata, or unchanged-field update does not invoke
`capture_action_history_update`, avoiding its full `to_jsonb(OLD/NEW)` snapshots.

Real card edits still invoke the unchanged history function. Full snapshots,
changed-field conflict checks, undo guards, locking order, per-shop 50-event
retention, authorization and client payloads are unchanged. Mixed lifecycle/card
updates and business changes made by BEFORE triggers are still recorded.
`supplier_name::text` intentionally preserves case-only edits of the citext column.

## Rollout

1. Run the focused PostgreSQL test in a NEW disposable database:
   `PGDATABASE=aura_history_test npm run test:history:postgres`.
   Choose only a local disposable server using `PGHOST`, `PGPORT`, `PGUSER`.
   The test refuses a different database name or pre-existing public tables.
   Its auth-context functions are stubs, not a replacement for authorization tests.
2. Review and approve a production migration separately. A Vercel deployment
   or GitHub merge does NOT apply this SQL to Supabase.
3. Apply the migration with the normal approved database migration process.
   It is transactional, repeatable, and fails rather than waiting more than five
   seconds for its DDL lock. If it times out, retry at a quieter time.
4. Confirm a status-only update no longer invokes the history function and a
   real edit still creates an undoable event. Do not create fake production sales.

No history or product rows are deleted by this migration.

## Regression checks

The test uses schema.sql's real history/undo functions and product row type.
It checks baseline vs optimized trigger invocation via EXPLAIN ANALYZE in the
disposable fixture; all whitelist fields; NULLs and arrays; citext case changes;
full snapshots; mixed updates; actual edit undo without recursive history;
BEFORE-trigger changes; independent retention for two shops; creation history;
and repeatable migration. A whitelist parity check guards future schema drift.

This removes work from one update path; it is not a 200-shop capacity benchmark.
It does not change the separate sale/cash-operation history entries.

## Rollback

In an approved migration transaction, replace only this trigger with its previous
unconditional definition:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS products_capture_action_history ON public.products;
CREATE TRIGGER products_capture_action_history AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.capture_action_history_update('product');
COMMIT;
```
