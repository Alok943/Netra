export type Proximity = "very_near" | "near" | "far";

/** Danger level driving haptics. "none" = nothing close in the walking path. */
export type DangerLevel = "none" | "near" | "very_near";

export interface Detection {
  label: string;
  score: number;
  /** [x, y, width, height] in video pixel coordinates */
  bbox: [number, number, number, number];
  /** Rough monocular estimate in metres; null when no size prior applies */
  distanceM: number | null;
  proximity: Proximity;
  /** Its base is inside the on-screen track (see vision/track.ts): in the user's way */
  inPath: boolean;
}

export type Lang = "en" | "hi";
