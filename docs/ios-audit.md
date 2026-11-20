# aura_v5: iOS readiness audit

## Scope and status

Source baseline: `ab85194208c0a13ac64bee368aff7527146e8f3f` (`main`).
This is an iOS-readiness and Android-PWA parity audit, not a penetration test,
production database audit, or claim of device certification.
There is no checked-in Android native project in this baseline; the existing
PWA policy and local database/outbox are the available reference.

**Not production-ready / full Android parity is not yet established.**
Passing JavaScript tests or generating an unsigned IPA does not establish
camera performance, Bluetooth reliability, offline cold-start correctness
on a physical device, or fiscal compliance.

## Findings and changes

| Finding | Impact | Change in this branch |
| --- | --- | --- |
| Xcode used SPM but `@capacitor-mlkit/barcode-scanning` 8.2.2 explicitly supports CocoaPods only | Successful archive could omit the native ML Kit scanner | Removed SPM Capacitor references, added CocoaPods with ML Kit and all used Capacitor plugins; iOS minimum 15.5 |
| Native shell did not expose the existing printer connection UI | Users could not select/test a BLE printer from this shell | Reused printer settings and connection manager in native cabinet; installed bridge only on native platforms |
| BLE shim claimed every characteristic supported all operations | Driver could select unsupported write/notify mode | Use discovered characteristic properties; reject missing services/characteristics; clear service handles on disconnect |
| Session tokens lived in Preferences on iOS | Plaintext preferences rather than secure platform storage | Keychain adapter, device-only after-first-unlock accessibility; migrate Preferences only after secure write succeeds |
| Login saved offline profile before clearing durable logout fence | Relogin could appear successful but lack an offline profile after restart | Clear fence only after online profile approval, then save profile |
| Scanner cleanup could skip camera stop after listener-removal failure | Camera could remain acquired | Independent best-effort listener and camera cleanup, including partially failed startup |
| Native shell had no online CRM modules | Money, reports and supplier screens unavailable | Added isolated HTTPS WKWebView, online menu and access-only authenticated bootstrap |
| Existing native export relies on an explicit output directory | Changing it can break the verified copy-to-Capacitor path | Retained `distDir: "out"` and limited build workers |
| Native printer globals were outside native TypeScript include | Printer integration could fail native typecheck | Included existing Niimbot declarations |
| iOS workflow ran only manually and checked no plugin linkage | A green build was insufficient evidence | PR trigger, regression tests, native dependency checks, mandatory CocoaPods workspace and lock artifact |

## Offline / online contract

The PWA reference is `lib/offline-sections.ts` and `lib/offline-policy.ts`:
cashier, stock reading, cabinet and revisions are offline-capable; stock
creation/edit/deletion require a connection. The local transaction/outbox
engine remains unchanged.

| Area | Current iOS behavior | Remaining parity work |
| --- | --- | --- |
| Cashier | Packaged UI; local checkout and outbox; stock search; QR/barcode scan; receipt/payment selection | Existing native UI is a simplified cashier, not the full PWA. Verify/port discounts, customer/bonus/credit flows, returns, scrap/loss and full history controls individually |
| Inventory | Packaged searchable/paginated stock; local reading; online-only stock mutation | Existing form does not expose all PWA photo/label tools; full product label editor and product-photo workflow still need native-safe integration |
| Revisions | Reuses existing revision screen and local progress, native scanner where available | Real-device camera/lifecycle and cold-start acceptance tests |
| Cabinet | Local approved profile, printer connection/test and protected logout | Team/settings remain in online module |
| Money / customers / showcase / suppliers / reports / shops / notifications | Hosted existing web screens in separate WKWebView; menu follows current role visibility, backend authorization remains authoritative | Deploy new bootstrap route and test against real hosted site |
| BLE printing | Reuses driver with CoreBluetooth-backed plugin and actual characteristic capabilities | Test the exact printer model/firmware, print alignment, reconnect and Bluetooth power cycling. Full product label editor integration is not claimed |

The packaged interface is still the existing Capacitor WebView with local web
assets and native plugins, not a rewritten SwiftUI cashier or a native SQL
database. IndexedDB/outbox remains the local data store. If “native offline”
means SwiftUI + SQLite, this branch does not implement that separate rewrite.

## Online module security and deployment

1. Deploy `app/auth/native/route.ts` to the existing Next.js website before testing
   online modules. No production deployment is performed by this branch.
2. `AuraWebOrigin` in `ios/App/App/Info.plist` defaults to `https://golduchet.com`,
   matching existing source references. Verify it is the actual deployed CRM
   origin; adjust this non-secret setting if necessary.
3. The local bridge passes only the current access token in an HTTPS POST body,
   never URL query strings or a shared refresh token.
4. The bootstrap verifies the user with Supabase before creating access-only web
   cookies, allows only explicit CRM destinations and disables caching.
5. The remote window has an ephemeral website store and **no Capacitor bridge**.
   Closing the window destroys its session; native device logout closes it.
6. The online window intentionally cannot refresh the native session.
   When its access JWT expires, close/reopen the window to get the current native
   access token. A long-lived seamless remote session is not implemented.
7. Network-path loss hides/stops the remote content. Server/API failures still
   need normal web error handling: a connected Wi-Fi interface is not proof that
   Supabase or the CRM is reachable.
8. Navigation to cashier/inventory/revisions returns to the packaged local screens.
   Off-origin navigation and popup windows are blocked.

## Build and verification

On macOS with Xcode, Node 22+, CocoaPods and the existing public Supabase
configuration in the build environment:

```sh
bash scripts/build-ios-unsigned.sh
```

The script uses `npm ci`, exports/syncs native assets, checks the installed
CocoaPods manifest for the actual Google ML Kit SDK, archives `App.xcworkspace`
and packages an **unsigned** IPA. It is not installable or TestFlight-ready
without appropriate signing/provisioning. Never paste signing credentials in
chat; configure them through the CI provider's secret management if adding a
separate signed distribution workflow.

`Build iOS App` runs manually or for relevant pull requests. The IPA and
dependency lock files are uploaded as artifacts. The first macOS resolution
must be reviewed; check in the generated `ios/App/Podfile.lock` when accepted
to pin transitive Apple dependencies. The resolved lock is available in the
successful CI run's `aura-ios-dependency-locks` artifact.

Local checks performed:

- `node --test --test-concurrency=1 tests/*.test.mjs`: 155 passing tests,
  including 9 new iOS storage/BLE/scanner/bootstrap/build regression tests.
- `bash -n scripts/build-ios-unsigned.sh`: passed.
- `Info.plist` parsed successfully; required camera/Bluetooth keys present.
- `git diff --check`: passed.
- Full dependency installation did not complete in this environment.
  Native TypeScript check was attempted but blocked by missing packages,
  including Next, Lucide and ZXing. Local typecheck is not counted as passing;
  the subsequent CI typecheck below passed.

Verified macOS CI results for code commit
`24b876ed548c9caead1becbf969c5e2738581a7e`:

- [Build iOS App](https://github.com/asanakunuuluaibek45-bot/aura_v5/actions/runs/44730000220)
  succeeded on macOS 15 / Xcode 16.4 with Node 22.
- All 155 regression tests passed on the runner.
- Native Next.js compile, TypeScript and static export passed.
- CocoaPods install/sync found 10 native Capacitor plugins, including ML Kit
  8.2.2, Bluetooth LE 8.4.0 and Camera 8.2.6.
- Native dependency and packaged-shell verification passed.
- Xcode archive finished with `ARCHIVE SUCCEEDED`.
- [Unsigned IPA artifact](https://github.com/asanakunuuluaibek45-bot/aura_v5/actions/runs/44730000220/artifacts/14624774890)
  was uploaded successfully (artifact size 8,215,544 bytes).
- [Resolved dependency locks](https://github.com/asanakunuuluaibek45-bot/aura_v5/actions/runs/44730000220/artifacts/14626017005)
  were uploaded successfully.
- The lockfile-portability job and both Vercel web preview statuses also passed.

No signed IPA, simulator session, physical-device camera scan, BLE print job
or production deployment has been performed. The PR remains a draft because
full cashier/label parity and device acceptance are still outstanding.

## Device acceptance checklist (required before release)

- First approved login online → complete sync → airplane mode → force quit →
  relaunch: cashier, stock, revisions and cabinet still open.
- Make two offline sales; kill/reopen; pending count and stock remain consistent.
  Reconnect and verify server reconciliation produces one sale per operation.
- Logout with pending operations: cancellation preserves data; destructive
  discard occurs only after explicit confirmation. Relogin → offline restart works.
- Scan QR, EAN-13/EAN-8, Code128, Code39, UPC-A and DataMatrix on real labels;
  test denied permission, torch, rapid repeat scans, background/resume and rotation.
  Measure latency and accuracy on the same samples as Android before claiming parity.
- Test the exact BLE printer on iOS: chooser, test label, normal label flow when
  integrated, disconnect, Bluetooth off/on, reconnect, long print jobs and
  foreground return. Do not retry an already-sent print automatically.
- Open Money online; remove network; no financial action must be queued locally.
  Close/reopen online window; verify correct user/store and access restrictions.
- Verify remote token expiry and return from hosted navigation to local screens.
- Validate online-only permissions for seller/admin/super-admin and another store.

**Hardware constraint:** CoreBluetooth supports BLE GATT, not arbitrary Bluetooth
Classic/SPP printers. A Classic-only printer requires a supported vendor/MFi
path or different hardware; software changes cannot promise BLE compatibility.
