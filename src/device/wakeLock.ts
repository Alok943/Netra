// Keeps the screen (and therefore camera + detection loop) alive while worn on the chest.
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<boolean> {
  if (!("wakeLock" in navigator)) return false;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => (sentinel = null));
    return true;
  } catch {
    return false;
  }
}

function onVisibility() {
  // The browser drops the lock when the tab is hidden; take it back when we return.
  if (wanted && document.visibilityState === "visible" && !sentinel) void acquire();
}

export async function enableWakeLock(): Promise<boolean> {
  wanted = true;
  document.addEventListener("visibilitychange", onVisibility);
  return acquire();
}

export async function disableWakeLock(): Promise<void> {
  wanted = false;
  document.removeEventListener("visibilitychange", onVisibility);
  await sentinel?.release();
  sentinel = null;
}
