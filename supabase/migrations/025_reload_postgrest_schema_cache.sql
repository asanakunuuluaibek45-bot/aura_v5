-- Reload PostgREST after the branch RPCs and schema changes from migrations 021-024.
-- This does not modify application data; the notification is delivered at commit.
BEGIN;
NOTIFY pgrst, 'reload schema';
COMMIT;
