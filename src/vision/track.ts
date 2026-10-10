// The "track": a lane drawn on the camera view, narrow at the horizon and wide at your feet.
// Anything whose base is inside it counts as "in your path": it is announced, and can trigger vibration.
import { CONFIG } from "../config";

/** Left and right edge of the track (in pixels) at the given row, or null above the horizon. */
export function trackEdgesAt(y: number, frameW: number, frameH: number): [number, number] | null {
  const t = CONFIG.path.track;
  const yFrac = y / frameH;
  if (yFrac < t.horizonY) return null;
  const k = Math.min(1, (yFrac - t.horizonY) / (1 - t.horizonY));
  const left = t.topLeft + (t.bottomLeft - t.topLeft) * k;
  const right = t.topRight + (t.bottomRight - t.topRight) * k;
  return [left * frameW, right * frameW];
}

/** True when the object's base (where it meets the ground) overlaps the track enough to be "in your way". */
export function isInTrack(bbox: [number, number, number, number], frameW: number, frameH: number): boolean {
  const [x, y, w, h] = bbox;
  const base = Math.min(y + h, frameH);
  const edges = trackEdgesAt(base, frameW, frameH);
  if (!edges) return false;
  const overlap = Math.max(0, Math.min(x + w, edges[1]) - Math.max(x, edges[0]));
  return overlap > 0.3 * Math.min(w, edges[1] - edges[0]);
}

/** The four corners of the track, for drawing. */
export function trackPolygon(frameW: number, frameH: number): [number, number][] {
  const t = CONFIG.path.track;
  const topY = t.horizonY * frameH;
  return [
    [t.topLeft * frameW, topY],
    [t.topRight * frameW, topY],
    [t.bottomRight * frameW, frameH],
    [t.bottomLeft * frameW, frameH],
  ];
}
