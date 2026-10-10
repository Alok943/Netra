// Spoken tutorial: pre-recorded clips (Sarvam text-to-speech, see scripts/gen-tutorial.mjs) played one after another.
// Clips are fetched whole and played from memory, so the service worker can cache them for offline use.
import type { Lang } from "../types";

export interface TutorialStep {
  id: string;
  text: string;
}

type Manifest = Record<Lang, TutorialStep[]>;

let manifest: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  manifest ??= fetch("/tutorial/manifest.json").then((r) => {
    if (!r.ok) throw new Error(`tutorial manifest: ${r.status}`);
    return r.json() as Promise<Manifest>;
  });
  manifest.catch(() => (manifest = null)); // allow a retry
  return manifest;
}

async function fetchClip(lang: Lang, id: string): Promise<string> {
  const res = await fetch(`/tutorial/${lang}/${id}.mp3`);
  if (!res.ok) throw new Error(`tutorial clip ${lang}/${id}: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

const GAP_MS = 500;

export class TutorialPlayer {
  playing = false;
  private run = 0;
  private audio: HTMLAudioElement | null = null;

  /** Plays every step in order. Resolves when finished or stopped; rejects if the clips cannot be loaded. */
  async play(lang: Lang, onStep: (step: TutorialStep) => void): Promise<void> {
    const mine = ++this.run;
    this.playing = true;
    try {
      const steps = (await loadManifest())[lang];
      let next = steps.length ? fetchClip(lang, steps[0].id) : null;
      for (let i = 0; i < steps.length && mine === this.run; i++) {
        const url = await next!;
        next = i + 1 < steps.length ? fetchClip(lang, steps[i + 1].id) : null; // fetch the next while this plays
        next?.catch(() => {});
        if (mine !== this.run) {
          URL.revokeObjectURL(url);
          break;
        }
        onStep(steps[i]);
        await this.playUrl(url, mine);
        URL.revokeObjectURL(url);
        if (mine === this.run) await new Promise((r) => setTimeout(r, GAP_MS));
      }
    } finally {
      if (mine === this.run) this.playing = false;
    }
  }

  stop(): void {
    this.run++;
    this.playing = false;
    this.audio?.pause();
    this.audio = null;
  }

  private playUrl(url: string, mine: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      this.audio = audio;
      const done = () => resolve();
      audio.onended = done;
      audio.onpause = () => mine !== this.run && done(); // stop() pauses the clip
      audio.onerror = () => reject(new Error("tutorial clip could not be played"));
      audio.play().catch(reject);
    });
  }
}
