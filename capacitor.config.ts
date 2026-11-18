import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.auracrm.app",
  appName: "Gold Uchet",
  webDir: "public",
  server: {
    // Start on the main sales screen. The service worker can then restore this
    // cached route on a later offline launch instead of loading the public home page.
    url: "https://golduchet.com/crm/pos",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["golduchet.com", "*.golduchet.com", "aura-crm-five.vercel.app"],
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Поиск устройств...",
        cancel: "Отмена",
        availableDevices: "Доступные устройства",
        noDeviceFound: "Устройства не найдены",
      },
    },
    Camera: {},
  },
};

export default config;
