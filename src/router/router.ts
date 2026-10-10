// Router: decides whether to speak and which handler answers. Not yet wired to the UI (phase 2).
// Contract: ask Jev (via our /api/jev proxy) with a 1.5 s budget; use its answer only when
// confidence > 0.8, otherwise default to gemini_live; on failure/timeout use keyword rules.
import { CONFIG } from "../config";
import type { Handler, RouteDecision, RouterState } from "./types";

/** Questions for Jev, in the schema that test-keys.mjs verified against the real API. */
export const JEV_QUESTIONS = {
  route: {
    type: "choice",
    instructions: "Which handler should answer this blind user's query?",
    criteria: {
      rule_reply: "Simple answer from object detections alone (what/how many objects, how near).",
      gemini_live: "Needs reading text, currency, scene understanding, judgement, or conversation.",
    },
  },
  speak_now: {
    type: "noul",
    instructions: "Should the assistant speak to the user right now?",
  },
} as const;

export async function route(state: RouterState): Promise<RouteDecision> {
  if (state.network === "offline") return keywordRoute(state);
  try {
    const res = await fetch("/api/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, questions: JEV_QUESTIONS }),
      signal: AbortSignal.timeout(CONFIG.router.jevTimeoutMs),
    });
    if (!res.ok) return keywordRoute(state);
    const decision = parseJevResponse(await res.json(), state);
    return decision ?? keywordRoute(state);
  } catch {
    return keywordRoute(state);
  }
}

/**
 * Real response shape (verified with test-keys.mjs, model jev-1.13.0):
 *   { model, answers: {
 *       route:     { type: "choice", choice: "gemini_live", confidence: 0.98,
 *                    probabilities: { rule_reply: 0.01, gemini_live: 0.99 } },
 *       speak_now: { type: "noul", noul: 0.7 } },
 *     usage: { input_tokens, output_tokens } }
 * Returns null when the shape is unrecognised, so the caller uses the keyword fallback.
 */
export function parseJevResponse(body: unknown, state: RouterState): RouteDecision | null {
  const answers = (body as { answers?: Record<string, unknown> } | null)?.answers;
  const routeAns = answers?.route as
    | { choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> }
    | undefined;
  const speakAns = answers?.speak_now as { noul?: unknown } | undefined;
  if (!routeAns || (routeAns.choice !== "rule_reply" && routeAns.choice !== "gemini_live")) return null;

  const choice: Handler = routeAns.choice;
  const confidence =
    typeof routeAns.confidence === "number"
      ? routeAns.confidence
      : Number(routeAns.probabilities?.[choice] ?? 0);
  const threshold = CONFIG.router.confidenceThreshold;
  const confident = confidence > threshold;

  // The user asked a question, so always answer it. For proactive triggers, speak only when
  // Jev is confident, so the user isn't flooded with chatter.
  const speakScore = typeof speakAns?.noul === "number" ? speakAns.noul : null;
  const speakNow = state.user_query ? true : speakScore !== null && speakScore > threshold;

  return {
    speakNow,
    handler: confident ? choice : "gemini_live",
    source: confident ? "jev" : "default",
    confidence,
  };
}

const GEMINI_KEYWORDS = [
  // English
  "read", "text", "written", "sign", "board", "note", "money", "rupee", "currency", "price",
  "describe", "colour", "color", "who", "where am i", "help", "what does",
  // Hindi (romanised + Devanagari)
  "padh", "likha", "paisa", "paise", "rupaye", "kaun", "kahan", "batao",
  "पढ़", "लिखा", "पैसे", "रुपये", "नोट", "कौन", "कहाँ", "बताओ",
];

/** Offline / fallback routing with simple keyword rules. */
export function keywordRoute(state: RouterState): RouteDecision {
  const q = state.user_query?.toLowerCase() ?? "";
  if (!q) {
    // Proactive triggers: only speak about things in the path, and only via rules.
    const speakNow = state.detections.some((d) => d.in_path && d.distance !== "far");
    return { speakNow, handler: "rule_reply", source: "keyword_fallback" };
  }
  let handler: Handler = GEMINI_KEYWORDS.some((k) => q.includes(k)) ? "gemini_live" : "rule_reply";
  if (state.network === "offline") handler = "rule_reply";
  return { speakNow: true, handler, source: "keyword_fallback" };
}
