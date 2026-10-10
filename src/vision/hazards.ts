// Local, conservative hazard rules. These never call a network service.
// They are intentionally separate from ordinary path proximity: an overhead
// object needs a unique cue, and a future ground-hazard model can plug into the
// same contract without changing the haptic UX.
import { CONFIG } from "../config";
import type { Detection } from "../types";

export type LocalHazardKind = "overhead" | "drop_off";

export interface LocalHazard {
  kind: LocalHazardKind;
  detection: Detection;
}

// COCO does not contain branches, awnings or signboards. These are the only
// current labels that can plausibly represent an elevated obstacle.
const OVERHEAD_LABELS = new Set(["bus", "truck", "traffic light", "stop sign", "parking meter", "umbrella"]);
// These labels arrive only after a road-hazard fine-tune. Keeping the mapping
// here makes the safety behaviour deterministic as soon as that model is used.
const DROP_OFF_LABELS = new Set(["pothole", "open drain", "stairs down", "descending stairs", "platform edge"]);

export function localHazards(detections: Detection[], frameW: number, frameH: number): LocalHazard[] {
  const out: LocalHazard[] = [];
  for (const d of detections) {
    if (d.score < CONFIG.detector.minScore) continue;
    const [x, y, w, h] = d.bbox;
    const centreX = x + w / 2;
    const inForwardThird = centreX > frameW * 0.25 && centreX < frameW * 0.75;
    const isUpperScene = y < frameH * 0.52 && y + h < frameH * 0.82;
    const closeEnough = d.distanceM === null || d.distanceM <= CONFIG.hazards.overheadRangeM;
    if (OVERHEAD_LABELS.has(d.label) && inForwardThird && isUpperScene && closeEnough) out.push({ kind: "overhead", detection: d });
    if (DROP_OFF_LABELS.has(d.label) && d.inPath) out.push({ kind: "drop_off", detection: d });
  }
  return out;
}
