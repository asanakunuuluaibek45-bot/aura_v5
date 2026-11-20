# aura_v5: iOS readiness and PWA parity

## Status

The previous native-only CRM was **not UI/UX-equivalent** to the Android PWA.
That interface has been removed. This correction packages the original PWA
components, without rewriting the CRM in SwiftUI or creating another design.
Physical-device acceptance and signed distribution remain required.

## One interface and one offline implementation

`native/app/native-crm.tsx` now handles only device identity/bootstrap and
Capacitor lifecycle; it renders the original `components/dashboard.tsx`.
The native target reuses:

- The original root layout, fonts, theme, CSS and notifications.
- Login/signup, header, responsive navigation and role-based menus.
- Full cashier: search, cart, discounts, payment/receipt modes and history.
- Full stock screen, product forms, photographs and label editor.
- Cabinet, printer settings, revisions and online CRM screens.
- IndexedDB, checkout transactions, outbox, reconciliation and sync engine.

All HTML/JS/fonts ship inside the IPA. Native startup does not depend on loading
the website or registering a service worker on `capacitor://`. The PWA provider
still registers the native Bluetooth bridge but skips web SW registration for
the native build. The running Android/browser PWA keeps its normal transport
and service worker.

Offline behavior is the existing policy in `lib/offline-sections.ts` and
`lib/offline-policy.ts`: cashier, stock reading, cabinet and revisions remain
available offline; stock mutations and financial/other online-only operations
retain their existing restrictions. Native hardware plugins do not change
business policy. This is Capacitor's packaged WebView plus native plugins,
not a separate SwiftUI + SQLite rewrite.

## Online actions and deployment

A static Capacitor export cannot execute Next server actions directly.
`scripts/generate-native-actions.mjs` generates type-preserving adapters only
for transport. Native webpack resolves action imports to these adapters;
browser/web builds continue using the original server actions.

`POST /api/native-actions`:

1. Accepts only an explicit module/action allowlist and bounded JSON arguments.
2. Verifies the bearer token with Supabase and requires an approved account.
3. Establishes this request's authenticated cookie context.
4. Calls the original action, retaining role/shop guards and Supabase RLS.
5. Disables caching. It never uses a service-role key or client-supplied shop identity.

iOS uses an HTTPS-only, cookie-isolated ephemeral URLSession. Requests are
restricted to the configured backend's action endpoint; redirects are rejected.
No remote HTML receives access to the native Capacitor bridge. No second
online WebView or different native navigation remains.

**The website backend must include this PR's `/api/native-actions` endpoint
before the new IPA's online actions can work.** Its public GET health response
must be `{"contract":"aura-native-actions-v1"}`.

The default is the canonical origin `https://www.golduchet.com`, without a
redirect. For public staging, set Actions variable `NATIVE_API_ORIGIN` before
building. That sets both native transports and the signup callback domain.
A preview protected by Vercel SSO is not a usable native backend. Do not embed
preview bypass credentials in the IPA. This branch does not publish production;
backend deployment needs separate approval/merge.

## Native hardware and session fixes retained

| Finding | Change |
| --- | --- |
| ML Kit requires CocoaPods; the old Xcode SPM setup could omit its native scanner | CocoaPods workspace, actual Google ML Kit SDK and mandatory linkage checks; iOS 15.5 minimum |
| BLE characteristic capabilities were fabricated | Use discovered capabilities; reject unsupported services/characteristics; clear handles on disconnect |
| iOS session tokens were stored in Preferences | Device-only after-first-unlock Keychain; migrate plaintext only after a confirmed secure write |
| Explicit logout could be undone by stale writes | Durable logout fence, cleanup of both stores and late-write protection |
| Relogin could fail to save an offline profile | Shared login prepares native signin and clears logout fence before persisting the profile |
| Scanner cleanup could leave camera acquired | Independent best-effort listener and camera cleanup, including partial startup failure |
| An archive alone did not prove plugin linkage | Regression tests, packaged-asset checks, installed-pod checks and dependency-lock artifact |

CoreBluetooth supports BLE GATT, not arbitrary Bluetooth Classic/SPP printers.
A Classic-only printer needs a supported vendor/MFi path or different hardware.

## Build and verification

On macOS with Xcode, Node 22+, CocoaPods and the existing public Supabase
configuration in the build environment:

```sh
bash scripts/build-ios-unsigned.sh
```

The script runs `npm ci`, static export, Capacitor sync, plugin verification and
Xcode archive, then packages an **unsigned** IPA. This is not TestFlight-ready
or installable without signing/provisioning. Configure signing credentials only
through CI secret management.

The `Build iOS App` workflow runs on relevant PR changes or manually; it uploads
the IPA and resolved dependency locks. Accept and commit a resolved
`ios/App/Podfile.lock` before release to pin transitive native dependencies.

Historical evidence for the **previous, superseded UI**, not this correction:
[run 44730000220](https://github.com/asanakunuuluaibek45-bot/aura_v5/actions/runs/44730000220)
at `24b876ed548c9caead1becbf969c5e2738581a7e` passed 155 tests, native compile,
TypeScript, static export, ten-plugin CocoaPods resolution and Xcode archive.
That green build did not establish UI/UX parity.

This correction adds gateway-authentication/allowlist tests and structural
regressions requiring the native target to render the original PWA. A fresh
macOS run must pass before claiming the corrected IPA builds. Local dependency
installation was blocked by unavailable package downloads; a local typecheck
or archive is not claimed.

## Device acceptance before release

- Compare PWA and iOS at the same viewport/account/shop: navigation, screens,
  fonts/theme, cart, discounts, payment modes, stock form and label editor.
- Approved online login → full initial sync → airplane mode → force quit →
  relaunch: cashier, stock, revisions and cabinet remain usable.
- Make offline sales; relaunch; reconnect. Confirm stock and pending count
  remain consistent and the server records exactly one sale per operation.
- Logout with pending operations: cancel preserves data; destructive discard
  requires confirmation. Relogin and offline restart retain the new profile.
- Scan real QR/EAN/Code128/Code39/UPC/DataMatrix labels; measure latency against
  Android. Test denied camera permission, torch and background/resume.
- With the exact BLE printer: chooser, test label, product labels, disconnect,
  Bluetooth off/on, reconnect, print alignment and long print jobs.
- Open Money online, then remove connectivity: no financial mutation may be
  queued locally. Check reconnect, session expiry and correct shop identity.
- Check seller/admin/super-admin permissions, shop impersonation and isolation
  from another account/shop. No physical-device result is claimed by CI.
