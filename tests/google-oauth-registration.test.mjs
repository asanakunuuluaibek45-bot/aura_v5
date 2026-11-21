import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("Google buttons use Supabase OAuth and native apps avoid unsupported redirects", () => {
  const button = read("components/auth/google-auth-button.tsx")
  assert.match(button, /provider:\s*"google"/)
  assert.match(button, /\/auth\/callback/)
  assert.match(button, /Capacitor\.isNativePlatform\(\)/)
  assert.match(button, /веб-версии/)
})

test("Google registration completion cannot assign application privileges", () => {
  const migration = read("supabase/migrations/015_google_oauth_registration.sql")
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /v_profile_status <> 'pending'/)
  assert.match(migration, /v_requested_role NOT IN \('seller', 'admin'\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_google_registration/)
  const profileUpdate = migration.match(/UPDATE public\.profiles([\s\S]*?)WHERE id = auth\.uid\(\)/)?.[1]
  assert.ok(profileUpdate, "expected a profile update scoped to the authenticated user")
  assert.match(profileUpdate, /requested_role = v_requested_role/)
  assert.doesNotMatch(profileUpdate, /\brole\s*=/)
  assert.doesNotMatch(profileUpdate, /\bstatus\s*=/)
})
