// Tier 0 reflexes: turns detections into haptic danger alerts. Pure on-device, never audio,
// never routed through any API. Debounced so a flickering box doesn't cause buzz spam.
import { CONFIG } from "../config";
import type { DangerLevel, Detection } from "../types";
import type { HapticOutput, HapticPattern } from "./haptics";

const RANK: Record<DangerLevel, number> = { none: 0, near: 1, very_near: 2 };

export class ReflexEngine {
  private level: DangerLevel = "none";
  private candidate: DangerLevel = "none";
  private candidateFrames = 0;
  private lastSeenAtLevel = 0;
  private lastPulse = 0;
  /** Latest reading from the future ultrasonic cane sensor (metres), if any. */
  private ultrasonicM: number | null = null;
  private ultrasonicAt = 0;
  private frameW = 0;

  constructor(
    private outputs: HapticOutput[],
    private onLevelChange?: (level: DangerLevel) => void,
  ) {}

  get current(): DangerLevel {
    return this.level;
  }

  /** Hook for the cane's ultrasonic sensor. Not wired yet. */
  updateUltrasonic(distanceM: number, now = performance.now()): void {
    this.ultrasonicM = distanceM;
    this.ultrasonicAt = now;
  }

  /** Call once per detection frame. */
  update(detections: Detection[], now = performance.now(), frameW?: number): DangerLevel {
    if (frameW) this.frameW = frameW;
    const observed = this.observedLevel(detections, now);

    // Escalation needs N consecutive frames; holding a level refreshes its timer.
    if (observed === this.candidate) this.candidateFrames++;
    else {
      this.candidate = observed;
      this.candidateFrames = 1;
    }
    if (RANK[observed] >= RANK[this.level] && observed !== "none") this.lastSeenAtLevel = now;

    let next = this.level;
    if (RANK[observed] > RANK[this.level] && this.candidateFrames >= CONFIG.reflex.escalateFrames) {
      next = observed;
    } else if (RANK[observed] < RANK[this.level] && now - this.lastSeenAtLevel > CONFIG.reflex.releaseMs) {
      next = observed;
    }

    if (next !== this.level) {
      const escalated = RANK[next] > RANK[this.level];
      this.level = next;
      if (next === "none") this.outputs.forEach((o) => o.stop());
      if (escalated) this.lastPulse = 0; // pulse immediately on escalation
      this.onLevelChange?.(next);
    }

    if (this.level !== "none" && now - this.lastPulse >= CONFIG.reflex.repeatMs[this.level]) {
      this.outputs.forEach((o) => o.pulse(this.directionalPattern(detections)));
      this.lastPulse = now;
    }
    return this.level;
  }

  stop(): void {
    this.level = "none";
    this.outputs.forEach((o) => o.stop());
  }

  private observedLevel(detections: Detection[], now: number): DangerLevel {
    let lvl: DangerLevel = "none";
    for (const d of detections) {
      if (!d.inPath) continue;
      if (d.proximity === "very_near") return "very_near";
      if (d.proximity === "near") lvl = "near";
    }
    if (this.ultrasonicM !== null && now - this.ultrasonicAt < 500) {
      if (this.ultrasonicM < CONFIG.distance.veryNearM) return "very_near";
      if (this.ultrasonicM < CONFIG.distance.nearM) lvl = "near";
    }
    return lvl;
  }

  /** Encode left/right locally; a two-motor cane can turn these into physical direction. */
  private directionalPattern(detections: Detection[]): HapticPattern {
    if (this.level === "very_near") return "very_near";
    const closest = detections
      .filter((d) => d.inPath && d.proximity === "near")
      .sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99))[0];
    if (!closest) return "near";
    if (!this.frameW) return "near";
    const centreX = closest.bbox[0] + closest.bbox[2] / 2;
    if (centreX < this.frameW * 0.42) return "near_left";
    if (centreX > this.frameW * 0.58) return "near_right";
    return "near";
  }
}
