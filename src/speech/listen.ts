// One-shot speech recognition (Chrome's built-in). Used for the first-run questions (language, automatic light).
interface Rec extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
type Ctor = new () => Rec;

const LANGUAGE_WORDS = /hindi|english|हिंदी|हिन्दी|अंग्रेज़ी|अंग्रेजी|इंग्लिश/i;
const YES_NO_WORDS = /\b(yes|yeah|yep|okay|ok|no|nope|haan|han|ha|nahi|nahin|na)\b|हाँ|हां|नहीं|नही|ठीक|(^|\s)(हा|जी|ना)(\s|$)/i;

/** Short pause before listening, so the cue buzz and the tail of "Hey Netra" are not heard as the question. */
const START_DELAY_MS = 350;
/** Errors that retrying cannot fix. Anything else (no speech yet, a busy microphone) is retried while time remains. */
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "language-not-supported"]);

let lastError = "";
/** Why the last listenOnce heard nothing, for the status line ("no-speech", "audio-capture", ...). Empty if no error. */
export function lastListenError(): string {
  return lastError;
}

/**
 * Listens for up to timeoutMs and resolves with what it heard ("" if nothing or unsupported). Stops early once `until` matches.
 * Chrome ends a recognition after a short silence, so if nothing has been heard yet it listens again until the time is up.
 */
export function listenOnce(lang: string, timeoutMs: number, until: RegExp = LANGUAGE_WORDS): Promise<string> {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  lastError = "";
  if (!C) {
    lastError = "unsupported";
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    let rec: Rec | null = null;
    let heard = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      resolve(heard);
    };
    const timer = setTimeout(finish, timeoutMs);
    const begin = () => {
      if (done) return;
      const r = new C();
      rec = r;
      r.lang = lang;
      r.continuous = false;
      r.interimResults = true;
      r.onresult = (e) => {
        heard = Array.from(e.results, (x) => x[0]?.transcript ?? "").join(" ");
        if (until.test(heard)) finish();
      };
      r.onerror = (e) => {
        lastError = e?.error ?? "error";
      };
      r.onend = () => {
        if (done) return;
        const timeLeft = timeoutMs - (performance.now() - t0);
        if (!heard && timeLeft > 1500 && !FATAL_ERRORS.has(lastError)) {
          setTimeout(begin, 300); // ended before the user spoke: listen again
          return;
        }
        finish();
      };
      try {
        r.start();
      } catch {
        finish();
      }
    };
    setTimeout(begin, START_DELAY_MS);
  });
}

export function parseLanguage(heard: string): "en" | "hi" | null {
  if (/hindi|हिंदी|हिन्दी/i.test(heard)) return "hi";
  if (/english|इंग्लिश|अंग्रेज़ी|अंग्रेजी/i.test(heard)) return "en";
  return null;
}

/** Used with listenOnce(..., YES_NO) to finish as soon as an answer is heard. */
export const YES_NO = YES_NO_WORDS;

/** true = yes, false = no, null = could not tell. */
export function parseYesNo(heard: string): boolean | null {
  if (/\b(no|nope|nahi|nahin|na)\b|नहीं|नही|(^|\s)ना(\s|$)/i.test(heard)) return false;
  if (/\b(yes|yeah|yep|okay|ok|haan|han|ha)\b|हाँ|हां|ठीक|(^|\s)(हा|जी)(\s|$)/i.test(heard)) return true;
  return null;
}
