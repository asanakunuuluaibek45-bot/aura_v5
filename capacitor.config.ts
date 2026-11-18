import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.auracrm.app",
  appName: "Gold Uchet",
  webDir: "public",
  server: {
    url: "https://golduchet.com",
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
      displayStringsProvider: true,
    },
    Camera: {},
  },
};

export default config;
