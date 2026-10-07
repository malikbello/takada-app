import type { CapacitorConfig } from "@capacitor/cli";

// Native shells for Android and iPhone around the same web build (ADR-0027).
// appId is permanent once published to a store: change it only before the first release.
const config: CapacitorConfig = {
  appId: "dev.malikbello.takada",
  appName: "Tákàdá",
  webDir: "dist",
  // Serve the bundled files from a secure origin, so the microphone and IndexedDB work
  // without the hub; calls to the hub are ordinary HTTPS requests (the hub allows both
  // origins: deploy/compose/hub.yml CORS_ORIGINS). Android: https://localhost. iPhone:
  // capacitor://localhost, since WKWebView cannot serve the app under https (Capacitor would
  // silently fall back to it anyway).
  server: { androidScheme: "https", iosScheme: "capacitor" },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#fffdfb", showSpinner: false },
    // Keep fetch() as the browser's: the native HTTP bridge would bypass the CSP and our timeouts.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
