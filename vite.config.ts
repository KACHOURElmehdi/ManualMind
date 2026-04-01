import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

const filePath = fileURLToPath(import.meta.url);
const rootDir = path.dirname(filePath);
const localDevConfigPath = path.resolve(rootDir, "src/shared/config/localDevConfig.ts");
const localDevConfigFallbackPath = path.resolve(rootDir, "src/shared/config/localDevConfig.fallback.ts");

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@local-dev-config": fs.existsSync(localDevConfigPath)
        ? localDevConfigPath
        : localDevConfigFallbackPath
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
