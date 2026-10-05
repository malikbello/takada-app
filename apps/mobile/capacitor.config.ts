import type { CapacitorConfig } from "@capacitor/cli";

// Native shells for Android and iPhone around the same web build (ADR-0027).
// appId is permanent once published to a store: change it only before the first release.
const config: CapacitorConfig = {
  appId: "dev.malikbello.takada",
  appName: "Tákàdá",
  webDir: "dist",
  // Serve the bundled files from https://localhost (a secure origin), so the microphone
  // and IndexedDB work without the hub; calls to the hub are ordinary HTTPS requests.
  server: { androidScheme: "https", iosScheme: "https" },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#fffdfb", showSpinner: false },
    // Keep fetch() as the browser's: the native HTTP bridge would bypass the CSP and our timeouts.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
