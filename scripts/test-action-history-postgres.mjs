// Destructive fixture setup: run ONLY in a fresh disposable local database.
// No production credentials. Auth context helpers are test stubs; the history
// functions, row types, whitelist, and undo implementation come from schema.sql.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

if (process.env.PGDATABASE !== "aura_history_test") {
  throw new Error("Use a fresh disposable PGDATABASE=aura_history_test only")
}
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8")
const migration = readFileSync(new URL(
  "../supabase/migrations/20261024_action_history_product_update_gate.sql", import.meta.url,
), "utf8")
const shop = "11111111-1111-4111-8111-111111111111"
const shop2 = "22222222-2222-4222-8222-222222222222"
const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const product = "10000000-0000-4000-8000-000000000001"
const product2 = "10000000-0000-4000-8000-000000000002"
const context = `SET request.jwt.claim.sub='${uid}'; SET test.shop_id='${shop}';`

function sql(query) {
  const result = spawnSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: `${context}\n${query}`, env: process.env, encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return result.stdout.trim()
}
function extract(pattern) {
  const result = schema.match(pattern)?.[0]
  assert.ok(result, `Missing schema object: ${pattern}`)
  return result
}
function table(name) {
  return extract(new RegExp(`CREATE TABLE ${name.replaceAll(".", "\\.")} \\([\\s\\S]*?\\n\\);`))
}
function fn(name) {
  return extract(new RegExp(
    `CREATE FUNCTION public\\.${name}\\([^]*?AS (\\$[\\w]*\\$)[^]*?\\1;`,
  ))
}
function count(where = "") {
  return Number(sql(`SELECT count(*) FROM public.action_history ${where}`))
}
function explain(set) {
  return JSON.parse(sql(`EXPLAIN (ANALYZE, FORMAT JSON)
    UPDATE public.products SET ${set} WHERE id='${product}';`))[0]
}
function triggerCalls(plan) {
  return (plan.Triggers ?? []).filter((t) => t["Trigger Name"] === "products_capture_action_history")
    .reduce((n, t) => n + t.Calls, 0)
}
function latest() {
  return sql("SELECT id FROM public.action_history ORDER BY seq DESC LIMIT 1")
}
function pass(text) { console.log(`PASS: ${text}`) }

// Refuse an existing application database, even if someone gave it the test name.
assert.equal(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"), "0")
sql(`
  CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
  CREATE SCHEMA auth;
  CREATE SCHEMA action_history_private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  CREATE FUNCTION public.current_shop_id() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT current_setting('test.shop_id')::uuid $$;
  CREATE FUNCTION public.is_shop_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  ${extract(/CREATE TYPE public\.product_status AS ENUM \([\s\S]*?\n\);/)}
  ${extract(/CREATE TYPE public\.app_role AS ENUM \([\s\S]*?\n\);/)}
  ${extract(/CREATE TYPE public\.profile_status AS ENUM \([\s\S]*?\n\);/)}
  ${table("public.profiles")}
  ${table("public.products")}
  ${table("public.metal_rates")}
  ${table("public.action_history")}
  ${table("action_history_private.undo_guard")}
  ALTER TABLE public.action_history ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY;
  ALTER TABLE public.action_history ADD PRIMARY KEY (id), ADD UNIQUE (seq);
  CREATE INDEX action_history_shop_seq_idx ON public.action_history(shop_id,seq DESC);
  ${fn("capture_action_history_update")}
  ${fn("capture_action_history_insert")}
  ${fn("undo_edit_action")}
  INSERT INTO public.profiles(id,full_name,shop_id,role,status)
    VALUES ('${uid}','Test employee','${shop}','admin','approved');
  INSERT INTO public.products(id,shop_id,created_by,name,sku)
    VALUES ('${product}','${shop}','${uid}','Original','AA1'),
           ('${product2}','${shop2}','${uid}','Other shop','AA2');
  CREATE TRIGGER products_capture_action_history AFTER UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.capture_action_history_update('product');
`)

const whitelist = [...fn("capture_action_history_update")
  .match(/IF v_entity_type = 'product' THEN\s+FOREACH v_field IN ARRAY ARRAY\[([\s\S]*?)\]/)[1]
  .matchAll(/'(\w+)'/g)].map((match) => match[1])
const oldFields = [...migration.matchAll(/\bOLD\.(\w+)/g)].map((match) => match[1])
const newFields = [...migration.matchAll(/\bNEW\.(\w+)/g)].map((match) => match[1])
assert.deepEqual(oldFields, whitelist)
assert.deepEqual(newFields, whitelist)
const schemaTrigger = extract(/CREATE TRIGGER products_capture_action_history AFTER UPDATE[\s\S]*?EXECUTE FUNCTION public\.capture_action_history_update\('product'\);/)
assert.equal(migration.match(/CREATE TRIGGER products_capture_action_history[\s\S]*?EXECUTE FUNCTION public\.capture_action_history_update\('product'\);/)?.[0], schemaTrigger)
pass("migration and fresh-schema predicate match every existing product whitelist field")

assert.equal(triggerCalls(explain("status='sold'")), 1)
assert.equal(count(), 0)
sql(migration)
assert.equal(triggerCalls(explain("status='in_stock'")), 0)
assert.equal(count(), 0)
pass("status-only update invoked snapshot function before migration, never invokes it after")

for (const set of [
  "updated_at=clock_timestamp()",
  "deleted_at=clock_timestamp(), client_op_id='service-op'",
  "consignment_at=clock_timestamp(), consignment_by=created_by",
  "name=name, images=images, purchase_price=purchase_price, is_hidden=is_hidden",
]) {
  assert.equal(triggerCalls(explain(set)), 0)
}
assert.equal(count(), 0)
pass("timestamps, deletion/consignment metadata and explicit no-op edits bypass snapshot function")

const values = {
  name: "'Edited'", category: "'Rings'", metal: "'Gold'", metal_color: "'Yellow'",
  weight: "1.25", size: "'17'", purchase_price: "900", purchase_price_visible: "950",
  price_per_gram_sale: "1100", price_per_gram_purchase: "700",
  price_per_gram_purchase_visible: "750", stones: "'Diamond'", description: "'Details'",
  sale_price: "1300", image_url: "'https://example.invalid/one.jpg'",
  images: "ARRAY['https://example.invalid/one.jpg','https://example.invalid/two.jpg']",
  supplier_name: "'Supplier'", supplier_phone: "'test-phone'", is_hidden: "true",
}
for (const field of whitelist) {
  const before = count()
  assert.equal(triggerCalls(explain(`${field}=${values[field]}`)), 1, field)
  assert.equal(count(), before + 1, field)
  assert.equal(sql(`SELECT changed_fields = ARRAY['${field}'] FROM public.action_history
    ORDER BY seq DESC LIMIT 1`), "t", field)
}
pass(`all ${whitelist.length} real card fields still produce correct history`)

assert.equal(triggerCalls(explain("supplier_name='SUPPLIER'")), 1)
assert.equal(sql(`SELECT prev_state->>'supplier_name'='Supplier'
  AND next_state->>'supplier_name'='SUPPLIER' FROM public.action_history
  ORDER BY seq DESC LIMIT 1`), "t")
pass("citext case-only supplier changes remain undoable")

const beforeArrays = count()
assert.equal(triggerCalls(explain("images=ARRAY['https://example.invalid/two.jpg','https://example.invalid/one.jpg']")), 1)
assert.equal(triggerCalls(explain("description=NULL")), 1)
assert.equal(triggerCalls(explain("description=NULL")), 0)
assert.equal(triggerCalls(explain("description='New description'")), 1)
assert.equal(count(), beforeArrays + 3)
pass("array ordering, NULL transitions and NULL no-op preserve JSON history semantics")

assert.equal(triggerCalls(explain("name='Mixed edit', status='sold'")), 1)
assert.equal(sql(`SELECT prev_state ? 'images' AND next_state ? 'images'
  AND prev_state->>'name'='Edited' AND next_state->>'name'='Mixed edit'
  AND next_state->>'status'='sold' AND changed_fields=ARRAY['name']
  FROM public.action_history ORDER BY seq DESC LIMIT 1`), "t")
const event = latest()
const beforeUndo = count()
sql(`SELECT public.undo_edit_action('${event}');`)
assert.equal(count(), beforeUndo)
assert.equal(sql(`SELECT name='Edited' AND status='sold' FROM public.products WHERE id='${product}'`), "t")
assert.equal(sql(`SELECT status FROM public.action_history WHERE id='${event}'`), "undone")
assert.equal(sql("SELECT count(*) FROM action_history_private.undo_guard"), "0")
pass("real undo restores edited field, preserves lifecycle status and creates no recursive history")

// AFTER-trigger WHEN must see final values produced by BEFORE triggers.
sql(`CREATE FUNCTION public.test_before_edit() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.name := 'Changed by BEFORE'; RETURN NEW; END $$;
  CREATE TRIGGER test_before_edit BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.test_before_edit();`)
assert.equal(triggerCalls(explain("status='in_stock'")), 1)
assert.equal(sql(`SELECT changed_fields=ARRAY['name'] FROM public.action_history
  ORDER BY seq DESC LIMIT 1`), "t")
sql("DROP TRIGGER test_before_edit ON public.products; DROP FUNCTION public.test_before_edit();")
pass("business edits from BEFORE triggers are captured even with status-only SQL")

sql(`TRUNCATE public.action_history;
  DO $$ BEGIN
    FOR i IN 1..60 LOOP
      UPDATE public.products SET name='First '||i WHERE id='${product}';
      UPDATE public.products SET name='Second '||i WHERE id='${product2}';
    END LOOP;
  END $$;`)
assert.equal(count(`WHERE shop_id='${shop}'`), 50)
assert.equal(count(`WHERE shop_id='${shop2}'`), 50)
assert.equal(sql("SELECT min(next_state->>'name') FROM public.action_history WHERE shop_id='"+shop+"' AND seq=(SELECT min(seq) FROM public.action_history WHERE shop_id='"+shop+"')"), "First 11")
pass("retention remains exactly newest 50 events independently for each shop")

sql(`CREATE TRIGGER products_capture_action_history_insert AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.capture_action_history_insert('product_create');
  INSERT INTO public.products(shop_id,created_by,name) VALUES ('${shop}','${uid}','New item');`)
assert.equal(sql("SELECT entity_type FROM public.action_history ORDER BY seq DESC LIMIT 1"), "product_create")
assert.equal(count(`WHERE shop_id='${shop}'`), 50)
sql(migration)
assert.equal(triggerCalls(explain("status='sold'")), 0)
pass("creation history unchanged; migration is repeatable")
console.log("All product-history gate checks passed against disposable PostgreSQL.")
