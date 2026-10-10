// Decides WHAT to say out loud about the surroundings, and when. Rules:
//  - The TRACK (the lane drawn on screen) decides: an object is announced when it comes into the track.
//    Anything outside the track stays silent, except a vehicle or large animal that is already close.
//  - It must be seen for a few frames in a row first (no flicker chatter).
//  - It is announced again only if it leaves the track and comes back, or if it gets closer ("far" -> "near").
//  - Very-near objects are never announced: they get vibration only, and are named afterwards (see App).
//  - At most one thing is said per gap; the most important candidate wins.
//  - In a crowd, individual people are replaced by one short summary every so often; vehicles still speak up.
import { CONFIG } from "../config";
import type { Detection, Lang, Proximity } from "../types";
import { describeCrowd, describeObject, isConfident, sideOf } from "./ruleReply";

export interface Spoken {
  text: string;
  det: Detection;
  crowd: boolean;
}

/** How dangerous this kind of thing usually is to a walker, 0 to 3. */
const RISK: Record<string, number> = {
  car: 3,
  bus: 3,
  truck: 3,
  motorcycle: 3,
  bicycle: 2.5,
  train: 3,
  cow: 2,
  horse: 2,
  dog: 1.5,
  person: 1.2,
  "traffic light": 0.5,
};
const risk = (label: string) => RISK[label] ?? 0.5;

function priority(d: Detection): number {
  const nearBoost = d.distanceM !== null ? Math.max(0, 4 - d.distanceM) / 2 : 0;
  return (d.inPath ? 3 : 0) + (d.proximity === "near" ? 3 : 0) + risk(d.label) + nearBoost + (isConfident(d) ? 0 : -1);
}

/** Worth speaking about unprompted? In the track, or a vehicle/large animal that is close but off to the side. */
const relevant = (d: Detection) => d.inPath || (risk(d.label) >= 2 && d.proximity !== "far");

const PROX_RANK: Record<Proximity, number> = { far: 0, near: 1, very_near: 2 };

interface Seen {
  /** Consecutive frames this object has been visible */
  count: number;
  lastFrame: number;
  lastSpoken: number;
  /** Closeness when last announced; -1 = not announced since it last entered the track */
  announcedProx: number;
  /** Consecutive frames it has been outside the track (resets "already announced") */
  outFrames: number;
}

/** Frames outside the track before a returning object counts as a new arrival. */
const LEFT_TRACK_FRAMES = 6;
/** Even if still in the track and unchanged, don't repeat sooner than this. */
const MIN_REPEAT_MS = 6000;

export class Announcer {
  private seen = new Map<string, Seen>();
  private frame = 0;
  private lastSpokenAt = 0;
  private lastCrowdAt = 0;

  reset(): void {
    this.seen.clear();
    this.frame = 0;
  }

  update(dets: Detection[], frameW: number, frameH: number, lang: Lang, now: number): Spoken | null {
    const A = CONFIG.announce;
    this.frame++;

    const present = new Set<string>();
    const keyed = dets.map((d) => {
      const key = `${d.label}|${sideOf(d, frameW)}`;
      present.add(key);
      const e = this.seen.get(key) ?? { count: 0, lastFrame: -10, lastSpoken: -Infinity, announcedProx: -1, outFrames: 0 };
      e.count = e.lastFrame === this.frame - 1 || e.lastFrame === this.frame ? e.count + 1 : 1;
      e.lastFrame = this.frame;
      e.outFrames = d.inPath ? 0 : e.outFrames + 1;
      if (e.outFrames >= LEFT_TRACK_FRAMES) e.announcedProx = -1; // it left the track: its next entry is new
      this.seen.set(key, e);
      return { d, e };
    });
    for (const [k, e] of this.seen) {
      if (present.has(k)) continue;
      e.outFrames++;
      if (e.outFrames >= LEFT_TRACK_FRAMES) e.announcedProx = -1; // gone from view entirely
      if (this.frame - e.lastFrame > 60) this.seen.delete(k);
    }

    const confident = dets.filter(isConfident);
    const people = confident.filter((d) => d.label === "person").length;
    const crowd = people >= A.crowdPeople || confident.length >= A.crowdObjects;

    if (now - this.lastSpokenAt < (crowd ? A.crowdGapMs : A.gapMs)) return null;

    const candidates = keyed.filter(({ d, e }) => {
      if (d.proximity === "very_near" || e.count < A.persistFrames || !relevant(d)) return false;
      if (now - e.lastSpoken < (crowd ? A.crowdCooldownMs : MIN_REPEAT_MS)) return false;
      // New arrival, or it has come closer since it was announced.
      return e.announcedProx < 0 || PROX_RANK[d.proximity] > e.announcedProx;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => priority(b.d) - priority(a.d));
    const top = candidates[0];

    if (crowd && risk(top.d.label) < 2) {
      if (now - this.lastCrowdAt < A.crowdSummaryEveryMs) return null;
      this.lastCrowdAt = now;
      this.lastSpokenAt = now;
      for (const c of candidates) {
        c.e.lastSpoken = now;
        c.e.announcedProx = PROX_RANK[c.d.proximity];
      }
      return { text: describeCrowd(dets, frameW, frameH, lang), det: top.d, crowd: true };
    }

    top.e.lastSpoken = now;
    top.e.announcedProx = PROX_RANK[top.d.proximity];
    this.lastSpokenAt = now;
    return { text: describeObject(top.d, frameW, frameH, lang), det: top.d, crowd: false };
  }
}
