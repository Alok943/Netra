// Netra service worker: makes the app installable and keeps Tier 0 (detection + haptics)
// working offline by caching the app shell, the YOLO26n model and the ONNX Runtime files.
const VERSION = "netra-v3";
// Models and ONNX Runtime files are cached on first use (cache-first below), so the model a phone actually
// runs (GPU or WASM variant) is what gets stored for offline use.
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("/index.html"));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/api/")) return; // never cache backend calls
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/ort/") || url.pathname.startsWith("/audio/") || url.pathname.startsWith("/tutorial/")) return event.respondWith(cacheFirst(req));
  if (req.mode === "navigate") return event.respondWith(networkFirst(req));
  if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(req)); // hashed, immutable
  event.respondWith(networkFirst(req));
});
