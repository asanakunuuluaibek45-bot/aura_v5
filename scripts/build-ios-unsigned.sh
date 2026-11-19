#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Use Node.js 22 in the Bitrise workflow." >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required; run this script on a macOS Bitrise stack." >&2
  exit 1
fi

npm install --legacy-peer-deps
npm run build:native -- ios
if [[ -d "ios" ]]; then
  npx cap sync ios
else
  npx cap add ios
fi
node scripts/sync-ios-icon.mjs

PLIST="$ROOT_DIR/ios/App/App/Info.plist"
if [[ -f "$PLIST" ]]; then
  set_plist_string() {
    local key="$1" value="$2"
    /usr/libexec/PlistBuddy -c "Set :${key} '${value}'" "$PLIST" >/dev/null 2>&1 || \
      /usr/libexec/PlistBuddy -c "Add :${key} string '${value}'" "$PLIST" >/dev/null
  }
  set_plist_string NSCameraUsageDescription "Требуется для фотосъемки товаров и сканирования QR-кодов и штрихкодов"
  set_plist_string NSPhotoLibraryUsageDescription "Требуется для выбора фотографий товаров из галереи"
  set_plist_string NSPhotoLibraryAddUsageDescription "Требуется для сохранения фотографий товаров в галерею"
  set_plist_string NSBluetoothAlwaysUsageDescription "Требуется для подключения к Bluetooth-термопринтеру Niimbot"
  set_plist_string NSBluetoothPeripheralUsageDescription "Требуется для подключения к Bluetooth-термопринтеру Niimbot"
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aura-ios-unsigned.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
APP_DIR="$ROOT_DIR/ios/App"
cd "$APP_DIR"
if [[ -d "App.xcworkspace" ]]; then
  TARGET_ARGS=(-workspace App.xcworkspace)
else
  TARGET_ARGS=(-project App.xcodeproj)
fi

xcodebuild "${TARGET_ARGS[@]}" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$TEMP_DIR/App.xcarchive" \
  archive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=""

APP_PATH="$TEMP_DIR/App.xcarchive/Products/Applications/App.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected archived app was not found at: $APP_PATH" >&2
  exit 1
fi
mkdir -p "$TEMP_DIR/Payload"
cp -R "$APP_PATH" "$TEMP_DIR/Payload/"
IPA_PATH="$ROOT_DIR/aura-crm-ios.ipa"
rm -f "$IPA_PATH"
(cd "$TEMP_DIR" && /usr/bin/zip -qr "$IPA_PATH" Payload)
if [[ -n "${BITRISE_DEPLOY_DIR:-}" ]]; then
  mkdir -p "$BITRISE_DEPLOY_DIR"
  cp "$IPA_PATH" "$BITRISE_DEPLOY_DIR/aura-crm-ios-unsigned.ipa"
fi
echo "Created unsigned IPA: $IPA_PATH"
echo "This IPA must be re-signed before installation or App Store submission."