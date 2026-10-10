// Copies the ONNX Runtime Web runtime files to public/ort/ so they are served from our own origin (needed for the
// service worker to cache them for offline use). Only the files the app loads are copied: Vite is configured to use
// ONNX Runtime's "extern wasm" build (vite.config.ts), which loads these from wasmPaths = "/ort/" and bundles none
// of its own. The default entry runs both the WebGPU and the WASM execution providers from the jsep build.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "onnxruntime-web", "dist");
const dest = join(root, "public", "ort");

if (!existsSync(src)) {
  console.error("copy-ort: node_modules/onnxruntime-web/dist not found. Run `npm install` first.");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(dest)) if (!FILES.includes(f)) rmSync(join(dest, f)); // drop files an older version copied
for (const f of FILES) {
  if (!existsSync(join(src, f))) {
    console.error(`copy-ort: ${f} not found in onnxruntime-web/dist. The runtime layout changed; update FILES.`);
    process.exit(1);
  }
  cpSync(join(src, f), join(dest, f));
}
console.log(`copy-ort: copied ${FILES.length} files to public/ort/`);
