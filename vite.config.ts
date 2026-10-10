import { defaultClientConditions, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { ortStatic } from "./vite-ort-plugin.js";

const apiPort = Number(process.env.API_PORT ?? 8787);

// HTTPS (self-signed) is required so a phone on the same Wi-Fi can use camera + mic.
export default defineConfig({
  plugins: [react(), basicSsl(), ortStatic()],
  resolve: {
    // Use ONNX Runtime's build that does NOT bundle its WASM: the runtime files are loaded from /ort/ (see
    // scripts/copy-ort.mjs and wasmPaths in src/vision/detector.ts), so they are deployed once, not twice.
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  // Don't inherit PostCSS/Tailwind configs from parent folders (e.g. the Desktop).
  css: { postcss: { plugins: [] } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${apiPort}`, changeOrigin: true },
    },
  },
});
