import type { Detection, Lang } from "../types";

export type Handler = "rule_reply" | "gemini_live";

export type RouterTrigger =
  | { kind: "user_speech"; transcript: string }
  | { kind: "new_object"; label: string }
  | { kind: "scene_change" }
  | { kind: "text_region" };

/** Small TEXT-only state sent to Jev. Never contains image data. */
export interface RouterState {
  user_query: string | null;
  language: Lang;
  detections: { label: string; distance: string; distance_m: number | null; conf: number; in_path: boolean }[];
  text_region_detected: boolean;
  last_route: Handler | null;
  network: "online" | "offline";
  trigger: RouterTrigger["kind"];
}

export interface RouteDecision {
  speakNow: boolean;
  handler: Handler;
  /** Where the decision came from, for the debug panel */
  source: "jev" | "keyword_fallback" | "default";
  confidence?: number;
}

export function toRouterState(
  trigger: RouterTrigger,
  detections: Detection[],
  language: Lang,
  lastRoute: Handler | null,
): RouterState {
  return {
    user_query: trigger.kind === "user_speech" ? trigger.transcript : null,
    language,
    detections: detections.slice(0, 8).map((d) => ({
      label: d.label,
      distance: d.proximity,
      distance_m: d.distanceM,
      conf: Math.round(d.score * 100) / 100,
      in_path: d.inPath,
    })),
    text_region_detected: trigger.kind === "text_region",
    last_route: lastRoute,
    network: navigator.onLine ? "online" : "offline",
    trigger: trigger.kind,
  };
}
