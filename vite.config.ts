import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 500,
  },
});
