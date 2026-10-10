import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkRate, clientIp, createGeminiToken } from "../server/handlers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const limited = checkRate("gemini-token", clientIp(req.headers["x-forwarded-for"], req.socket?.remoteAddress));
  if (limited) return res.status(limited.status).json(limited.body);
  const r = await createGeminiToken();
  res.status(r.status).json(r.body);
}
