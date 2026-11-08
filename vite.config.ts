import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: { importScripts: ["push-sw.js"] },
      manifest: {
        name: "Recipe Box",
        short_name: "Recipes",
        description: "Snap your paper recipes, plan the week, and shop from one list.",
        theme_color: "#2f6b47",
        background_color: "#f3f5f1",
        display: "standalone",
        start_url: "/",
        // Lets Android's Share menu send a recipe web page straight into the app.
        share_target: { action: "/", method: "GET", params: { title: "title", text: "text", url: "url" } },
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
