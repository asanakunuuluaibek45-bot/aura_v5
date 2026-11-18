# Нативный сканер QR/штрихкодов на iOS (ML Kit)

В iOS-приложении (Capacitor) сканер `components/BarcodeScannerModal.tsx` сначала
использует `@capacitor-mlkit/barcode-scanning` (Google ML Kit). Если плагин недоступен
или не запускается, остаётся браузерный резервный путь. В браузере/PWA и на Android
работает прежняя логика (BarcodeDetector → ZXing). Обёртка: `lib/native-barcode-scanner.ts`.

## Сборка iOS
1. `npm install`
2. Если папки `ios` ещё нет: `npx cap add ios`.
3. `npm run cap:sync` — синхронизирует плагины и копирует иконки в Xcode.
4. `npm run cap:ios` — открывает Xcode с актуальной иконкой.
5. В `ios/App/App/Info.plist` проверьте наличие:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Камера нужна для съёмки товаров и сканирования QR-кодов и штрихкодов</string>
   ```
6. Минимальная версия iOS — 15.5 (требование ML Kit), в Xcode: Deployment Target 15.5+.
7. В Xcode выберите iPhone 11 (или подключённое устройство) и нажмите Run.

## Важно
Приложение открывает `https://golduchet.com/crm/pos`, поэтому изменения веб-интерфейса
появятся после деплоя Next.js-приложения; нативный ML Kit и иконка требуют
`npm run cap:sync` и пересборки в Xcode. Камера рендерится под WebView:
на время сканирования фон страницы прозрачен через класс `barcode-scanner-active`
в `app/globals.css`. Поддерживаются одиночный и непрерывный режим (ревизия),
фонарик и переключение объектива.

Офлайн-касса доступна только после хотя бы одного успешного входа и загрузки
каталога на этом iPhone: Service Worker сохраняет оболочку кассы и её JS/CSS,
а товары, локальная сессия и очередь продаж находятся в IndexedDB. Принудительное
закрытие приложения эти данные не удаляет; выход из аккаунта, очистка данных
сайта или удаление приложения удаляют их, и при следующем старте понадобится сеть.
Недоступные CRM-разделы при потере сети возвращают пользователя на сохранённую кассу.
Проверить работу Service Worker и нативной строки состояния нужно на реальном
iPhone после сборки/деплоя: Capacitor в этом проекте загружает удалённый сайт.

Иконки находятся в `resources/ios/AppIcon.appiconset` и подготовлены из
`public/icon.svg`. Скрипт `scripts/sync-ios-icon.mjs` копирует все размеры в
`ios/App/App/Assets.xcassets/AppIcon.appiconset`; он вызывается при `npm run cap:sync`
и перед открытием Xcode командой `npm run cap:ios`.
