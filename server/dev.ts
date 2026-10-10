// Local dev API server. In production the same handlers run as Vercel functions (api/*.ts).
// Start with `npm run dev` (reads .env automatically).
import express from "express";
import {
  checkRate,
  clientIp,
  createGeminiToken,
  health,
  proxyJev,
  type GatedEndpoint,
  type HandlerResult,
} from "./handlers.js";

const app = express();
// Vite proxies /api to us; trust it so req.ip reflects the real client via x-forwarded-for.
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));

const send = (res: express.Response, r: HandlerResult) => res.status(r.status).json(r.body);

/** Runs the rate limit; returns true (and has already responded) when the request was rejected. */
function denied(endpoint: GatedEndpoint, req: express.Request, res: express.Response): boolean {
  const r = checkRate(endpoint, clientIp(undefined, req.ip));
  if (r) send(res, r);
  return r !== null;
}

app.get("/api/health", (_req, res) => send(res, health()));
app.post("/api/gemini-token", async (req, res) => {
  if (!denied("gemini-token", req, res)) send(res, await createGeminiToken());
});
app.post("/api/jev", async (req, res) => {
  if (!denied("jev", req, res)) send(res, await proxyJev(req.body));
});

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, () => {
  const h = health().body as Record<string, unknown>;
  console.log(`[api] http://localhost:${port}  keys: gemini=${h.geminiKey} typesafe=${h.typesafeKey}`);
});
