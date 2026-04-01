import fs from "fs";
import path from "path";

const loaderPath = path.resolve(process.cwd(), "dist", "service-worker-loader.js");

if (!fs.existsSync(loaderPath)) {
  console.error("[verify:dist] Missing dist/service-worker-loader.js. Run npm run build first.");
  process.exit(1);
}

const content = fs.readFileSync(loaderPath, "utf8");
const invalidPatterns = ["http://localhost:", "https://localhost:", "/@vite/env", "@crx/client-worker"];

const foundInvalid = invalidPatterns.find((pattern) => content.includes(pattern));
if (foundInvalid) {
  console.error(
    `[verify:dist] Invalid service worker loader for unpacked build. Found pattern: ${foundInvalid}`
  );
  console.error(
    "[verify:dist] Rebuild with npm run build and load unpacked from dist only after build completes."
  );
  process.exit(1);
}

console.log("[verify:dist] service-worker-loader.js is static and safe for unpacked loading.");
