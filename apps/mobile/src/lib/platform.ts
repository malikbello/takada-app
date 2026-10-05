// Web app vs native shell (ADR-0027). The same build runs in both: in the Android and
// iPhone apps the files ship inside the app, so there is no service worker to install,
// and the hardware back button and the status bar need native calls.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as "web" | "android" | "ios";

export async function startNative(): Promise<void> {
  if (!isNative) return;
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);
  // Dark text on the white app. Failures here are cosmetic, never fatal.
  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);
  // Android back: step back through the app's screens; on the home screen, leave the app.
  await App.addListener("backButton", () => {
    const home = window.location.hash === "" || window.location.hash === "#/" || window.location.hash === "#";
    if (home) void App.minimizeApp();
    else window.history.back();
  });
}
