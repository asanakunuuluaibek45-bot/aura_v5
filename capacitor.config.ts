import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.auracrm.app",
  appName: "Gold Uchet",
  webDir: "public",
  server: {
    url: "https://golduchet.com",
    cleartext: false,
    allowNavigation: ["golduchet.com", "*.golduchet.com", "aura-crm-five.vercel.app"],
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    BluetoothLe: {
      displayStringsProvider: true,
    },
    Camera: {
      // Native camera configuration
    },
  },
};

export default config;
