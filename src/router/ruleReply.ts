// "rule_reply" handler: describes detections in words. Works fully offline, in English or Hindi.
import { CONFIG } from "../config";
import { crowdSummary, distWord, labelName, maybePhrase, nothingSeen, proxWord, sideWord, type Side, type SizeClass } from "../i18n/strings";
import type { Detection, Lang } from "../types";

export const isConfident = (d: Detection) => d.score >= CONFIG.detector.minScore;

export function sideOf(d: Detection, frameW: number): Side {
  const cx = d.bbox[0] + d.bbox[2] / 2;
  if (cx < frameW * 0.33) return "left";
  if (cx > frameW * 0.67) return "right";
  return "ahead";
}

/** Apparent size from how much of the frame the box covers. */
export function sizeOf(d: Detection, frameW: number, frameH: number): SizeClass {
  const frac = (d.bbox[2] * d.bbox[3]) / (frameW * frameH);
  return frac > 0.25 ? "large" : frac > 0.08 ? "medium" : "small";
}

/** "chair ahead, close, about 2 metres", or for an unsure detection "possibly a chair, a medium-sized object ahead, close". */
export function describeObject(d: Detection, frameW: number, frameH: number, lang: Lang): string {
  const side = sideWord(sideOf(d, frameW), lang);
  const prox = proxWord(d.proximity, lang);
  if (!isConfident(d)) return `${maybePhrase(d.label, sizeOf(d, frameW, frameH), lang)} ${side}, ${prox}`;
  const dist = d.distanceM !== null ? `, ${distWord(d.distanceM, lang)}` : "";
  return `${labelName(d.label, lang)} ${side}, ${prox}${dist}`;
}

const byDistance = (a: Detection, b: Detection) => (a.distanceM ?? 99) - (b.distanceM ?? 99);

export function describeScene(detections: Detection[], frameW: number, frameH: number, lang: Lang): string {
  if (detections.length === 0) return nothingSeen(lang);
  return (
    [...detections]
      .sort(byDistance)
      .slice(0, 4)
      .map((d) => describeObject(d, frameW, frameH, lang))
      .join(". ") + "."
  );
}

/** Short summary for a crowded scene: counts by kind plus the nearest object. */
export function describeCrowd(detections: Detection[], frameW: number, frameH: number, lang: Lang): string {
  const confident = detections.filter(isConfident);
  const tally = new Map<string, number>();
  for (const d of confident) tally.set(d.label, (tally.get(d.label) ?? 0) + 1);
  const counts = [...tally]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => ({ label, n }));
  const nearest = [...detections].sort(byDistance)[0];
  return crowdSummary(counts, nearest ? describeObject(nearest, frameW, frameH, lang) : "", lang);
}
