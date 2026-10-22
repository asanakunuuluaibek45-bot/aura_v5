# Dejen DP27P / DP30P — experimental Android BLE support

This is an independent, experimental DothanTech-family BLE implementation for
Android Chrome over HTTPS. It is not the NIIMBOT protocol. No physical printer
has been tested by the author of this change; automated mocks do not establish
firmware compatibility or print alignment.

## Supported and fail-closed behavior

- Profiles: Dejen DP27P and Dejen DP30P, requested resolution **300 dpi**.
- The manufacturer's Android SDK scans the vendor E781 service and selects
  writable/notify characteristics by properties; the legacy FFE0/FFE1
  Bluetooth-serial service remains supported as a fallback. Other services are
  rejected.
- The driver reads the device-reported model, DPI and print-head width before
  any raster or paper-feed command. Wrong models, non-300-dpi units, absent
  responses and oversized rasters are rejected.
- The profile width limits are conservative estimates from 48 mm / 80 mm
  advertised printable widths. Actual head width is queried at runtime.
- Adhesive labels with gaps are the only configured paper mode.
- Writes are sequential, at most 20 bytes, acknowledged where supported, and
  paced. A failed print is never automatically retried.
- “Data sent” is not a claim that physical output has been inspected.
- Classic-only Bluetooth variants, other GATT UUIDs and iPhone Safari are not
  supported by this browser implementation.

## Sources and a specification discrepancy

- [Manufacturer's DP27 manual](https://en.detonger.com/userManual/User's%20Manual%20for%20DP27%20Thermal%20Label%20Printer.pdf):
  DP27P is 300 dpi; printable width 48 mm.
- [Manufacturer's DP30P product image](https://en.detonger.com/img/DP30P/5.jpg):
  printable width 28–80 mm.
- [Another DP30P specification image](https://en.detonger.com/img/DP30P/6.jpg)
  says **203 dpi**, conflicting with the requested 300-dpi profile. No 300-dpi
  DP30P support is assumed from that image: the device must report 300 dpi or
  printing is blocked.
- [Manufacturer's Android SDK](https://en.detonger.com/software/Bluetooth%20Print%20Android%20SDK%20(Include%20API%20document).zip),
  LPAPI-2026-01-08-R: vendor service UUID E7810A71-73AE-499D-8C15-FAA9AEF0C3F2;
  legacy FFE0/FFE1 is also recognized. SDK binaries are not bundled.
- [Published protocol notes](https://github.com/sb-child/dz-print/blob/master/protocol.md):
  framing, checksums, identity queries, settings and raster commands.
- [Published status observations](https://github.com/sb-child/dz-print/blob/master/print-status.md).

## Before merging or claiming hardware support

1. Open Preview in Android Chrome over HTTPS; close WePrint or other apps
   currently connected to the printer.
2. Select the exact model in printer settings and press Connect.
3. Confirm that model/DPI checks pass. If the chooser finds nothing, verify
   Bluetooth and Android's Nearby Devices / Location permissions. Do not change
   to a NIIMBOT profile to bypass identification.
4. Print **one** test label first. Check size, orientation, left margin, QR code,
   text and gap feed. Repeat separately on DP27P and DP30P.
5. Test disconnect/reconnect, no-paper and cover-open cases. If transmission
   fails, inspect the printer before repeating; output may be partial.

Automated tests (Node 22.18+ or Node 24):

```sh
node --test tests/dejen.test.mjs
```

Connection diagnostics regression tests (Node 24):

```sh
node --test tests/dejen.test.mjs tests/dejen-monitor.test.mjs
```

Selecting an entry in Chrome's chooser is not a completed protocol connection.
The app shows a connected status only after the identity/DPI/width handshake.
For Dejen, focus changes do not silently reconnect raw GATT or clear a failed
handshake diagnostic. The error identifies the failed stage, including a
missing supported service, instead of misreporting it as chooser cancellation.
