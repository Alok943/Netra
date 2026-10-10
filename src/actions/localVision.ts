// Deterministic "Ask Netra" actions. No Gemini request is made here.
import { describeScene, sideOf } from "../router/ruleReply";
import type { Detection, Lang } from "../types";

export type LocalVisionAction = "scene" | "bus" | "read" | "currency" | "medicine" | "doorway";

export function parseLocalVisionAction(text: string): LocalVisionAction {
  const q = text.toLowerCase();
  if (/bus|बस/.test(q)) return "bus";
  if (/money|currency|note|rupee|paisa|paise|rupaye|पैसे|रुपये|नोट/.test(q)) return "currency";
  if (/medicine|tablet|expiry|drug|दवा|एक्सपायरी/.test(q)) return "medicine";
  if (/door|doorway|entrance|दरवाज/.test(q)) return "doorway";
  if (/read|sign|board|label|text|पढ़|लिख|साइन|बोर्ड/.test(q)) return "read";
  return "scene";
}

export function actionNeedsText(action: LocalVisionAction): boolean {
  return action === "read" || action === "bus" || action === "currency" || action === "medicine";
}

export function localVisionReply(
  action: LocalVisionAction,
  detections: Detection[],
  frameW: number,
  frameH: number,
  lang: Lang,
  text: string | null,
): string {
  const hi = lang === "hi";
  if (action === "scene") return describeScene(detections, frameW, frameH, lang);
  if (action === "doorway") {
    // Doors are not a COCO class. Do not invent a doorway from visual geometry.
    return hi ? "ऑफलाइन डोरवे मॉडल अभी इंस्टॉल नहीं है।" : "The offline doorway model is not installed yet.";
  }
  if (action === "bus") {
    const bus = detections.filter((d) => d.label === "bus").sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99))[0];
    if (!bus) return hi ? "मुझे अभी कोई बस नहीं दिख रही।" : "I do not see a bus right now.";
    const where = hi ? "सामने" : sideOf(bus, frameW);
    if (text) return hi ? `बस ${where} है। पढ़ा गया टेक्स्ट: ${text}` : `A bus is ${where}. Read text: ${text}.`;
    return hi ? `बस ${where} है, लेकिन उसका नंबर पढ़ नहीं सका।` : `A bus is ${where}, but I could not read its number.`;
  }
  if (action === "currency") {
    const amount = text?.match(/\b(?:10|20|50|100|200|500|2000)\b/)?.[0];
    if (amount) return hi ? `नोट पर ${amount} रुपये लिखा दिख रहा है।` : `The note appears to say ${amount} rupees.`;
    return hi ? "नोट का मूल्य साफ़ पढ़ नहीं सका।" : "I could not read the note value clearly.";
  }
  if (action === "medicine") {
    if (text) return hi ? `लेबल पर लिखा है: ${text}` : `The label reads: ${text}.`;
    return hi ? "दवा का लेबल साफ़ पढ़ नहीं सका।" : "I could not read the medicine label clearly.";
  }
  if (text) return hi ? `पढ़ा गया टेक्स्ट: ${text}` : `Read text: ${text}.`;
  return hi ? "टेक्स्ट साफ़ पढ़ नहीं सका।" : "I could not read text clearly.";
}

interface NativeTextBlock { rawValue: string }
interface NativeTextDetector { detect(source: CanvasImageSource): Promise<NativeTextBlock[]> }

/** Uses Chrome's device-provided TextDetector when it exists. No image leaves the phone. */
export async function readTextOnDevice(video: HTMLVideoElement): Promise<string | null> {
  const Ctor = (globalThis as unknown as { TextDetector?: new () => NativeTextDetector }).TextDetector;
  if (!Ctor || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  const maxW = 1280;
  const scale = Math.min(1, maxW / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    const blocks = await new Ctor().detect(canvas);
    const value = blocks.map((b) => b.rawValue.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
    return value ? value.slice(0, 140) : null;
  } catch {
    return null;
  }
}
