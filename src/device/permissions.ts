// Keeps asking for camera / microphone until the user allows them.
//  - If the user dismissed the prompt, Chrome will show it again, so we retry every few seconds.
//  - If the user chose Block, Chrome will not prompt again. We then say how to fix it in settings, and carry on
//    automatically as soon as the permission changes (no second tap needed).

export type PermissionKind = "camera" | "microphone";

interface Hooks {
  /** The prompt was dismissed or is about to be shown again: tell the user to tap Allow. */
  onPrompt: () => void;
  /** The permission is blocked in browser settings: tell the user how to unblock it. */
  onBlocked: () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function queryState(kind: PermissionKind): Promise<PermissionState | null> {
  try {
    return (await navigator.permissions.query({ name: kind as PermissionName })).state;
  } catch {
    return null; // Permissions API not available for this name: treat as "prompt"
  }
}

/** Resolves when the permission state changes, or after timeoutMs (so the spoken help repeats). */
async function waitForChange(kind: PermissionKind, timeoutMs: number): Promise<void> {
  try {
    const status = await navigator.permissions.query({ name: kind as PermissionName });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      function done() {
        clearTimeout(timer);
        status.removeEventListener("change", done);
        resolve();
      }
      status.addEventListener("change", done);
    });
  } catch {
    await sleep(timeoutMs);
  }
}

const isPermissionError = (err: unknown) =>
  err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");

/** Runs `attempt` (which should request the device) until it succeeds. Other errors, such as no camera, are thrown. */
export async function untilGranted<T>(kind: PermissionKind, attempt: () => Promise<T>, hooks: Hooks): Promise<T> {
  for (;;) {
    try {
      return await attempt();
    } catch (err) {
      if (!isPermissionError(err)) throw err;
      if ((await queryState(kind)) === "denied") {
        hooks.onBlocked();
        await waitForChange(kind, 20_000);
      } else {
        hooks.onPrompt();
        await sleep(3500);
      }
    }
  }
}
