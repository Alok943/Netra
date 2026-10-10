// Pre-recorded system messages ("Netra is ready", permissions, quiet mode, ...), made with scripts/gen-prompts.ts.
// They play instantly and offline in one clear voice, unlike the phone's own text-to-speech (used for object
// announcements), so the user can tell system messages from detections by the voice alone.
// A recording is used only when its text matches the current string in src/i18n/strings.ts; otherwise the phone speaks it.
//
// Played with Web Audio from a full fetch() (not an <audio> element), so the service worker can cache every file for
// offline use and playback starts without delay once a file has been decoded.
import type { Lang } from "../types";

interface Entry {
  text: string;
  file: string;
}
type Manifest = Record<string, Record<string, Entry>>;

let manifest: Manifest | null = null;
let loading: Promise<void> | null = null;
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let playing: AudioBufferSourceNode | null = null;
let playingDone: ((ok: boolean) => void) | null = null;
/** Bumped by stopPrompt(): queued messages from before it are dropped (danger, a new answer, Stop). */
let generation = 0;
let queueTail: Promise<unknown> = Promise.resolve();

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function buffer(url: string): Promise<AudioBuffer | null> {
  let b = buffers.get(url);
  if (!b) {
    b = (async () => {
      const c = context();
      if (!c) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await c.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(url, b);
  }
  return b;
}

/** Fetches the list of recordings, then starts loading this language's files in the background. */
export function loadPrompts(lang: Lang): Promise<void> {
  loading ??= fetch("/audio/manifest.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      manifest = m;
    })
    .catch(() => {
      manifest = null;
    });
  return loading.then(() => {
    for (const e of Object.values(manifest?.[lang] ?? {})) void buffer(e.file); // also fills the offline cache
  });
}

/** URL of the recording for exactly this text in this language, or null when there is none. */
export function promptFor(text: string, lang: Lang): string | null {
  const entries = manifest?.[lang];
  if (!entries) return null;
  for (const e of Object.values(entries)) if (e.text === text) return e.file;
  return null;
}

export function stopPrompt(): void {
  generation++;
  const src = playing;
  const done = playingDone;
  playing = null;
  playingDone = null;
  if (src) {
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  done?.(false);
}

/**
 * Plays a recording. Resolves true when it played to the end, false if it was cut off or could not play.
 * Default: replaces whatever is playing. With queue: true it waits for the current recording to finish instead, so a
 * run of status messages is heard in full and in order.
 */
export function playPrompt(url: string, opts: { queue?: boolean } = {}): Promise<boolean> {
  if (!opts.queue) {
    stopPrompt();
    return playNow(url);
  }
  const myGeneration = generation;
  const result = queueTail.then(() => (myGeneration === generation ? playNow(url) : false));
  queueTail = result.catch(() => false);
  return result;
}

/**
 * Adds a step to the same ordered queue as the recordings (for example a message spoken by the phone's own voice), so
 * messages of both kinds are heard one after another. Dropped if stopPrompt() is called before its turn.
 */
export function enqueueAfter(step: () => Promise<void> | void): void {
  const myGeneration = generation;
  queueTail = queueTail.then(() => (myGeneration === generation ? step() : undefined)).catch(() => undefined);
}

async function playNow(url: string): Promise<boolean> {
  const c = context();
  if (!c) return false;
  const buf = await buffer(url);
  if (!buf) return false;
  if (c.state !== "running") {
    try {
      await c.resume();
    } catch {
      /* blocked before the first touch */
    }
  }
  if (c.state !== "running") return false; // the caller falls back to the phone's voice
  return new Promise<boolean>((resolve) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    playing = src;
    playingDone = resolve;
    src.onended = () => {
      if (playing === src) {
        playing = null;
        playingDone = null;
      }
      resolve(true);
    };
    src.start();
  });
}
