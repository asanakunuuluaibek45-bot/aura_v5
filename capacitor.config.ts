import { KeyboardResize } from "@capacitor/keyboard";
import type { CapacitorConfig } from "@capacitor/cli";

const nativeBuild = process.env.BUILD_TARGET === "native";
const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL?.trim();

const config: CapacitorConfig = {
  // Keep the existing app identifier so installed GOLDUCHET clients retain
  // their update identity. Native production builds bundle local web assets.
  appId: "com.auracrm.app",
  appName: "GOLDUCHET",
  webDir: nativeBuild ? "out" : "public",
  // A dev server is opt-in for local development only. No production app
  // depends on golduchet.com being reachable just to render its UI.
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith("http://"),
        },
      }
    : {}),
  ios: {
    // The shared PWA header/menu already account for CSS safe-area insets.
    // Automatic UIKit insets would add a second gap above the same interface.
    contentInset: "never",
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
    Keyboard: {
      resize: KeyboardResize.Native,
    },
  },
};

export default config;
