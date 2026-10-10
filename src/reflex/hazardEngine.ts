import { CONFIG } from "../config";
import type { HapticOutput } from "./haptics";
import type { LocalHazard, LocalHazardKind } from "../vision/hazards";

/** Debounces rare high-priority hazard cues independently of ordinary obstacle alerts. */
export class HazardEngine {
  private frames: Record<LocalHazardKind, number> = { overhead: 0, drop_off: 0 };
  private lastPulse: Record<LocalHazardKind, number> = { overhead: 0, drop_off: 0 };

  constructor(private outputs: HapticOutput[]) {}

  update(hazards: LocalHazard[], now = performance.now()): void {
    for (const kind of ["drop_off", "overhead"] as const) {
      const seen = hazards.some((h) => h.kind === kind);
      this.frames[kind] = seen ? this.frames[kind] + 1 : 0;
      if (this.frames[kind] < CONFIG.hazards.confirmFrames) continue;
      if (now - this.lastPulse[kind] < CONFIG.hazards.repeatMs[kind]) continue;
      this.outputs.forEach((o) => o.pulse(kind));
      this.lastPulse[kind] = now;
    }
  }
}
