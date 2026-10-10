// Voice announcements via the browser's speech synthesis. Used for UI feedback, answers and
// proactive info, NEVER for danger (danger is haptic only).
import { SPEECH_LANG } from "../i18n/strings";
import type { Lang } from "../types";
import { stopPrompt } from "./prompts";

export type SpeechPriority = "query" | "proactive" | "system";

let currentPriority: SpeechPriority | null = null;
let currentLang: Lang = "en";

/** Language used when speak() is called without an explicit one. */
export function setSpeechLang(lang: Lang): void {
  currentLang = lang;
}

/**
 * Android Chrome loads its speech engine and voice list lazily, which delays the first words by a second or more.
 * Asking for the voices early starts that work before anything needs to be said.
 */
export function warmUpSpeech(): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices(), { once: true });
}

/**
 * - "query" (an answer to the user) cuts off whatever is being said.
 * - "system" (status messages) cuts off older system and proactive speech, so a stale status never delays a new one.
 *   Pass queue: true to wait for the current speech instead (used when one message is spoken as several parts).
 * - "proactive" never interrupts anything.
 */
export function speak(
  text: string,
  priority: SpeechPriority = "system",
  lang: string = SPEECH_LANG[currentLang],
  opts: { queue?: boolean } = {},
): void {
  void speakAsync(text, priority, lang, opts);
}

/** Same as speak(), but the promise resolves when the phone has finished saying it (or could not). */
export function speakAsync(
  text: string,
  priority: SpeechPriority = "system",
  lang: string = SPEECH_LANG[currentLang],
  opts: { queue?: boolean } = {},
): Promise<void> {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  if (priority !== "proactive" && !opts.queue) stopPrompt(); // a new status or answer replaces a recording that is still playing
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    if (priority === "proactive") return Promise.resolve();
    if (priority === "query" || (priority === "system" && !opts.queue) || currentPriority === "proactive") synth.cancel();
  }
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.05;
    const finish = () => {
      if (currentPriority === priority) currentPriority = null;
      clearTimeout(guard);
      resolve();
    };
    // Some phones never fire onend; don't block a queue of messages forever.
    const guard = setTimeout(finish, 4000 + text.length * 120);
    u.onend = u.onerror = finish;
    currentPriority = priority;
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  stopPrompt();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentPriority = null;
}
