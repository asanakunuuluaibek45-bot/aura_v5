# Нативный сканер QR/штрихкодов на iOS (ML Kit)

В iOS-приложении (Capacitor) сканер `components/BarcodeScannerModal.tsx` автоматически
переключается на `@capacitor-mlkit/barcode-scanning` (Google ML Kit) — скорость как у
`BarcodeDetector` на Android. В браузере/PWA и на Android работает прежняя логика
(BarcodeDetector → ZXing). Обёртка: `lib/native-barcode-scanner.ts`.

## Сборка iOS
1. `npm install`
2. `npx cap sync ios` (если папки ios нет: `npx cap add ios`)
3. В `ios/App/App/Info.plist` добавьте:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Камера нужна для сканирования QR-кодов и штрихкодов товаров</string>
   ```
4. Минимальная версия iOS — 15.5 (требование ML Kit), в Xcode: Deployment Target 15.5+.
5. `npm run cap:ios` → Run.

## Важно
Приложение грузит `https://golduchet.com`, поэтому изменения веб-части нужно задеплоить
(Vercel), а нативный плагин — пересобрать в Xcode. Камера рендерится под WebView:
на время скана фон страницы прозрачный (CSS-класс `barcode-scanner-active` в `app/globals.css`).
Поддерживаются одиночный и непрерывный режим (ревизия), фонарик и подсветка кодов.
