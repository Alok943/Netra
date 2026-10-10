// Fast, deterministic voice routing. This runs before any cloud decision so
// common walking questions can be answered from the already-live detector cache.
import { describeObject, describeScene, isConfident } from "./ruleReply";
import type { Detection, Lang } from "../types";

export type VoiceIntent = "local_ahead" | "local_distance" | "gemini";

const GEMINI_WORDS = /\b(read|sign|board|text|bus number|destination|medicine|expiry|label|describe|scene|colour|color|who|currency|money|note)\b|पढ़|साइन|बोर्ड|दवा|एक्सपायरी|वर्णन|नोट|पैसे|रुपये/i;
const DISTANCE_WORDS = /\b(how far|distance|how close|near)\b|कितनी दूर|दूरी|पास/i;

export function voiceIntent(transcript: string): VoiceIntent {
  if (GEMINI_WORDS.test(transcript)) return "gemini";
  if (DISTANCE_WORDS.test(transcript)) return "local_distance";
  return "local_ahead";
}

function requestedDetection(transcript: string, detections: Detection[]): Detection | null {
  const q = transcript.toLowerCase();
  return (
    detections
      .filter(isConfident)
      .filter((d) => q.includes(d.label.toLowerCase()))
      .sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99))[0] ?? null
  );
}

/** Returns a short local answer. Null means the request should be sent to Gemini. */
export function localVoiceReply(
  intent: VoiceIntent,
  transcript: string,
  detections: Detection[],
  frameW: number,
  frameH: number,
  lang: Lang,
): string | null {
  if (intent === "gemini") return null;
  if (intent === "local_distance") {
    const target = requestedDetection(transcript, detections);
    if (target) return describeObject(target, frameW, frameH, lang);
    return lang === "hi" ? "जिस चीज़ के बारे में पूछा, वह अभी नहीं दिख रही।" : "I do not see that object right now.";
  }
  const ahead = detections.filter((d) => d.inPath && isConfident(d));
  return describeScene(ahead.length ? ahead : detections.filter(isConfident), frameW, frameH, lang);
}
