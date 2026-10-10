// Haptic output abstraction. Today: the phone's vibration motor simulates the cane.
// Later: CaneHaptics (see src/cane/caneBluetooth.ts) implements the same interface.
import type { DangerLevel } from "../types";

/**
 * Signals understood by the future two-motor cane. Phone vibration can only
 * approximate direction through rhythm; a connected cane must map left/right
 * to its physical left/right motors.
 */
export type HapticPattern = Exclude<DangerLevel, "none"> | "near_left" | "near_right" | "overhead" | "drop_off" | "camera_lost" | "listening";

export interface HapticOutput {
  readonly name: string;
  readonly supported: boolean;
  pulse(pattern: HapticPattern): void;
  stop(): void;
}

/** Danger levels, plus the camera-lost warning (not a danger level: it means detection has stopped). */
/** Distinct, learnable patterns. Direction rhythms are only a phone fallback; the cane maps them to left/right motors. */
export const PATTERNS: Record<HapticPattern, number[]> = {
  near: [90, 110, 90],
  very_near: [220, 60, 220, 60, 220],
  near_left: [70, 90, 70],
  near_right: [70, 90, 70, 90, 70],
  /** Three firm beats: a detected hazard is above cane reach. */
  overhead: [130, 80, 130, 80, 130],
  /** Long-short-long: stop and check the ground ahead. */
  drop_off: [260, 80, 90, 80, 260],
  camera_lost: [600, 250, 600, 250, 600],
  /** One short firm buzz: the voice session is open and Netra is listening. */
  listening: [140],
};

export class PhoneVibration implements HapticOutput {
  readonly name = "phone";
  readonly supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  pulse(pattern: HapticPattern): void {
    if (this.supported) navigator.vibrate(PATTERNS[pattern]);
  }

  stop(): void {
    if (this.supported) navigator.vibrate(0);
  }
}
