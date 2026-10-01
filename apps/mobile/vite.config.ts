import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"], navigateFallback: "/index.html" },
      manifest: {
        name: "Takada",
        short_name: "Takada",
        description: "Antenatal visit assistant for primary health care",
        theme_color: "#0b1f1a",
        background_color: "#0b1f1a",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
    }),
  ],
  build: { target: "es2020", sourcemap: true },
});
