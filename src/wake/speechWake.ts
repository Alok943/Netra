// Simple MVP "Hey Netra": the browser's own speech recognition listens continuously and we look for the phrase.
// Trade-offs vs a trained on-device wake word (planned later): Chrome sends the audio to Google for recognition,
// it needs internet, uses more battery, and some Android phones play a small system sound each time it restarts.
// It is a toggle (off by default) so it never gets in the way of the detection tests.

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechWakeSupported(): boolean {
  return getCtor() !== null;
}

/** Recognisers often hear "Netra" as nature / natra / netro / nethra, so match loosely. */
const WAKE = /\b(hey|hay|hi)\s+(netra|nethra|natra|netro|nature|nitra|nutra)\b/i;

export function matchesWake(transcript: string): boolean {
  return WAKE.test(transcript);
}

export interface SpeechWake {
  stop(): void;
}

/** Starts continuous listening. Calls onWake once per detection, then keeps listening. Returns null if unsupported. */
export function startSpeechWake(onWake: () => void, onFatal?: (reason: string) => void): SpeechWake | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  let stopped = false;
  let lastWake = 0;
  const rec = new Ctor();
  rec.lang = "en-IN";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0]?.transcript ?? "";
      if (matchesWake(text) && Date.now() - lastWake > 3000) {
        lastWake = Date.now();
        onWake();
        rec.abort(); // drop the rest of this utterance so the question isn't treated as another wake
        return;
      }
    }
  };
  rec.onerror = (e) => {
    // "no-speech" and "aborted" are routine; permission or service errors will not fix themselves.
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopped = true;
      onFatal?.(e.error);
    }
  };
  rec.onend = () => {
    if (!stopped) setTimeout(() => !stopped && safeStart(rec), 300);
  };
  safeStart(rec);

  return {
    stop() {
      stopped = true;
      rec.onresult = rec.onend = rec.onerror = null;
      rec.abort();
    },
  };
}

function safeStart(rec: SpeechRecognitionLike): void {
  try {
    rec.start();
  } catch {
    /* already started */
  }
}
