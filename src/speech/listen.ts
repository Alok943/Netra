// One-shot speech recognition (Chrome's built-in). Used for the first-run questions (language, automatic light).
interface Rec extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type Ctor = new () => Rec;

const LANGUAGE_WORDS = /hindi|english|हिंदी|हिन्दी|अंग्रेज़ी|अंग्रेजी|इंग्लिश/i;
const YES_NO_WORDS = /\b(yes|yeah|yep|okay|ok|no|nope|haan|han|ha|nahi|nahin|na)\b|हाँ|हां|नहीं|नही|ठीक|(^|\s)(हा|जी|ना)(\s|$)/i;

/** Listens for up to timeoutMs and resolves with what it heard ("" if nothing or unsupported). Stops early once `until` matches. */
export function listenOnce(lang: string, timeoutMs: number, until: RegExp = LANGUAGE_WORDS): Promise<string> {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C) return Promise.resolve("");
  return new Promise((resolve) => {
    const rec = new C();
    let heard = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      resolve(heard);
    };
    const timer = setTimeout(finish, timeoutMs);
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      heard = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ");
      if (until.test(heard)) finish();
    };
    rec.onend = finish;
    rec.onerror = finish;
    try {
      rec.start();
    } catch {
      finish();
    }
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
