import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkRate, clientIp, proxyJev } from "../server/handlers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const limited = checkRate("jev", clientIp(req.headers["x-forwarded-for"], req.socket?.remoteAddress));
  if (limited) return res.status(limited.status).json(limited.body);
  const r = await proxyJev(req.body);
  res.status(r.status).json(r.body);
}
