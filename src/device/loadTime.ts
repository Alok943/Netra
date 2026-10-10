// Remembers how long the vision model took to load last time, so the next start can announce a real estimate.
const KEY = "netra.modelLoadSeconds";

/** Seconds the last load took, or null if there is no measurement yet (first ever load). */
export function lastLoadSeconds(): number | null {
  try {
    const secs = Number(localStorage.getItem(KEY));
    return secs > 0 ? secs : null;
  } catch {
    return null;
  }
}

export function recordLoadTime(ms: number): void {
  try {
    localStorage.setItem(KEY, String(Math.max(2, Math.round(ms / 1000))));
  } catch {
    /* ignore */
  }
}
