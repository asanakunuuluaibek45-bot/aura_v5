import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.auracrm.app",
  appName: "Aura CRM",
  webDir: "public",
  server: {
    url: "https://aura-crm-five.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    BluetoothLe: {
      displayStringsProvider: true,
    },
  },
};

export default config;
