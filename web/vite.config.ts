import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/api": "http://localhost:3100" },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
  test: { include: ["src/**/*.test.ts"] },
});
