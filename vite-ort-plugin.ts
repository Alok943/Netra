import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Plugin } from "vite";

// ONNX Runtime Web loads its .mjs/.wasm files at runtime from /ort/. In dev, Vite refuses to serve
// .mjs files from public/ when they are dynamically imported, so serve /ort/* as plain static files.
const TYPES: Record<string, string> = { ".mjs": "text/javascript", ".wasm": "application/wasm" };

export function ortStatic(): Plugin {
  return {
    name: "netra-ort-static",
    apply: "serve",
    configureServer(server) {
      const dir = join(server.config.root, "public", "ort");
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/ort/")) return next();
        const file = normalize(join(dir, url.slice("/ort/".length)));
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
  };
}
