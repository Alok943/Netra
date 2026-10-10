// Monocular distance estimate from bounding-box size.
// Pinhole model: distance ≈ realHeight * focalPx / boxHeightPx, using a per-class height prior.
// Falls back to box-area heuristics when the box is clipped by the frame edge (object is very close).
import { CONFIG } from "../config";
import type { Detection, Proximity } from "../types";
import type { RawDetection } from "./detector";
import { isInTrack } from "./track";

/** Typical real-world heights (metres) for COCO classes likely to be obstacles. */
const HEIGHT_PRIOR_M: Record<string, number> = {
  person: 1.65,
  bicycle: 1.0,
  car: 1.5,
  motorcycle: 1.1,
  bus: 3.0,
  truck: 3.0,
  "traffic light": 0.9,
  "fire hydrant": 0.8,
  "stop sign": 0.75,
  "parking meter": 1.2,
  bench: 0.85,
  dog: 0.55,
  cat: 0.3,
  cow: 1.4,
  horse: 1.6,
  chair: 0.9,
  couch: 0.85,
  "potted plant": 0.6,
  bed: 0.6,
  "dining table": 0.75,
  toilet: 0.75,
  tv: 0.6,
  refrigerator: 1.75,
  suitcase: 0.65,
  backpack: 0.5,
  umbrella: 1.0,
};

const EDGE_PX = 4;

function focalPx(frameW: number, frameH: number): number {
  const longSide = Math.max(frameW, frameH);
  const halfFov = (CONFIG.camera.fovLongSideDeg * Math.PI) / 180 / 2;
  return longSide / 2 / Math.tan(halfFov);
}

function proximityFor(distanceM: number | null, _areaFrac: number): Proximity {
  const d = CONFIG.distance;
  // A bounding box can be large because the object itself is large (a bus or
  // truck), not because it is close. Do not use image area as a safety trigger.
  // Camera-only range remains an estimate; the future depth/ultrasonic sensor
  // is the authority for an immediate physical warning.
  if (distanceM !== null && distanceM < d.visualVeryNearM) return "very_near";
  if (distanceM !== null && distanceM < d.visualNearM) return "near";
  return "far";
}

export function enrich(raw: RawDetection[], frameW: number, frameH: number): Detection[] {
  const f = focalPx(frameW, frameH);

  return raw.map((r) => {
    const [, y, w, h] = r.bbox;
    const areaFrac = (w * h) / (frameW * frameH);
    const clippedVertically = y <= EDGE_PX || y + h >= frameH - EDGE_PX;

    let distanceM: number | null = null;
    const prior = HEIGHT_PRIOR_M[r.label];
    if (prior && h > 0) {
      distanceM = (prior * f) / h;
      // Clipping makes a monocular size estimate unreliable. Never promote a
      // clipped detection to an emergency range from image geometry alone.
      if (clippedVertically) distanceM = null;
      else distanceM = Math.round(distanceM * 10) / 10;
    }

    const inPath = isInTrack(r.bbox, frameW, frameH);

    return { ...r, distanceM, proximity: proximityFor(distanceM, areaFrac), inPath };
  });
}
