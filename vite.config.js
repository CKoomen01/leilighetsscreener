import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relativ base slik at siden fungerer både på GitHub Pages (/leilighetsscreener/) og lokalt.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
});
