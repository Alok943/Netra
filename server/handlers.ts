// Framework-agnostic backend logic, shared by the local Express dev server (server/dev.ts)
// and the Vercel serverless functions (api/*.ts). API keys live ONLY here, read from env.
import { EndSensitivity, GoogleGenAI, Modality } from "@google/genai";

export interface HandlerResult {
  status: number;
  body: unknown;
}

// Ephemeral tokens only work with the Live API on v1beta. Keep in step with CONFIG.liveApiVersion in src/config.ts.
const LIVE_API_VERSION = "v1beta";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
// Client gives up at 1.5 s; server gives up slightly later so the client always decides.
const JEV_SERVER_TIMEOUT_MS = 2000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

// --- Rate limiting --------------------------------------------------------------------------
// There is no login: these per-IP limits are the only protection against someone hammering the paid
// endpoints. NOTE: the map is in memory, so on Vercel it is per function instance. That is good enough
// for the MVP.
const RATE_WINDOW_MS = 60_000;
export const RATE_LIMITS = { "gemini-token": 10, jev: 60 } as const;
export type GatedEndpoint = keyof typeof RATE_LIMITS;

const hits = new Map<string, number[]>();

function rateLimited(endpoint: GatedEndpoint, ip: string): boolean {
  const key = `${endpoint}|${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMITS[endpoint]) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/** Returns null when the request may proceed, otherwise the 429 response to send. */
export function checkRate(endpoint: GatedEndpoint, ip: string): HandlerResult | null {
  return rateLimited(endpoint, ip) ? { status: 429, body: { error: "rate_limited" } } : null;
}

/** First entry of x-forwarded-for (set by Vercel), else the socket address. */
export function clientIp(forwardedFor: string | string[] | undefined, socketAddr: string | undefined): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = raw?.split(",")[0]?.trim();
  return first || socketAddr || "unknown";
}

const LIVE_SYSTEM_INSTRUCTION = `You are Netra, a voice assistant worn by a blind or low-vision person in India. You hear them through a microphone and see through a camera on their chest or walking stick.
Rules:
- Always answer the wearer when they speak to you. Reply in the language they used (Hindi, English or Hinglish).
- Keep answers short: one to three sentences, plain words, no lists or markdown. They are listening, not reading.
- Describe positions as left, right or ahead, and distances in steps or metres.
- Read text, currency notes, bus numbers and labels aloud when asked. Say how sure you are when the image is unclear.
- SAFETY: if the wearer asks whether they can go, walk, turn, step, move or cross in any direction ("can I go right?", "is it clear?", "is it safe?"), NEVER answer yes or no, and never say the way is clear or safe. Instead say what you can see in that direction and roughly how far, for example "I can see a chair about two steps to your right", or "I don't see anything in that direction in the picture". Then add that you only see what the camera sees and they should check with their cane.
- The camera looks straight ahead and sees only a narrow view. It cannot see far to the left or right, behind them, or the floor at their feet. When asked about those, say you cannot see there. A direction missing from the picture is unknown, not clear.
- If anything blocks the direction they ask about, say so first and clearly.
- If the camera shows nothing useful, say so briefly and suggest turning slightly.`;

export function health(): HandlerResult {
  return {
    status: 200,
    body: {
      ok: true,
      geminiKey: Boolean(env("GEMINI_API_KEY")),
      typesafeKey: Boolean(env("TYPESAFE_API_KEY")),
      liveModel: env("GEMINI_LIVE_MODEL") ?? null,
    },
  };
}

/**
 * Issues a short-lived, single-use ephemeral token for the Gemini Live API.
 * Docs: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 * The browser uses `token` in place of an API key; the real key never leaves the server.
 */
export async function createGeminiToken(): Promise<HandlerResult> {
  const apiKey = env("GEMINI_API_KEY");
  const model = env("GEMINI_LIVE_MODEL");
  if (!apiKey || !model) {
    return { status: 500, body: { error: "GEMINI_API_KEY or GEMINI_LIVE_MODEL not configured" } };
  }

  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString(); // session messages allowed for 30 min
  const newSessionExpireTime = new Date(now + 60 * 1000).toISOString(); // must start a session within 1 min

  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        // Lock the token to our model, audio output and system prompt so a leaked token can't be
        // repurposed. With constraints set, the API ignores any client-side change to these fields.
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: LIVE_SYSTEM_INSTRUCTION,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // Netra questions are intentionally short. A bounded VAD pause makes the
            // response predictable after the user stops talking, particularly where
            // background street noise would otherwise prolong turn detection.
            realtimeInputConfig: {
              automaticActivityDetection: {
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                silenceDurationMs: 500,
              },
            },
            // Video sessions otherwise end after 2 minutes; resumption survives connection resets.
            contextWindowCompression: { slidingWindow: {} },
            sessionResumption: {},
          },
        },
      },
    });
    return { status: 200, body: { token: token.name, model, expireTime } };
  } catch (err) {
    return { status: 502, body: { error: "token_create_failed", detail: String(err) } };
  }
}

/**
 * Proxies a routing request to TypeSafe Jev. The client sends only a small TEXT state
 * (never camera frames) plus the questions; we attach the model name and the key.
 */
export async function proxyJev(input: unknown): Promise<HandlerResult> {
  const apiKey = env("TYPESAFE_API_KEY");
  if (!apiKey) return { status: 500, body: { error: "TYPESAFE_API_KEY not configured" } };

  const req = input as { state?: unknown; questions?: unknown } | null;
  if (!req || req.state === undefined || typeof req.questions !== "object" || req.questions === null) {
    return { status: 400, body: { error: "expected { state, questions }" } };
  }
  const state = typeof req.state === "string" ? req.state : JSON.stringify(req.state);
  if (state.length > 8000) return { status: 413, body: { error: "state too large" } };

  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state, questions: req.questions }),
      signal: AbortSignal.timeout(JEV_SERVER_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { status: res.ok ? 200 : res.status, body };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { status: timedOut ? 504 : 502, body: { error: timedOut ? "jev_timeout" : "jev_failed" } };
  }
}
