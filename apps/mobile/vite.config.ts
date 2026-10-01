import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"], navigateFallback: "/index.html" },
      manifest: {
        name: "Tákàdá",
        short_name: "Tákàdá",
        description: "Antenatal visit assistant for primary health care",
        theme_color: "#fffdfb",
        background_color: "#fffdfb",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
    }),
  ],
  build: { target: "es2020", sourcemap: true },
});
