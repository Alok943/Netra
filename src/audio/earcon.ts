// Short confirmation sounds and ticks. Never used for danger (danger is haptic only).
let ctx: AudioContext | null = null;

/** Soft two-note chime: "Netra is listening". */
export function listeningChime(): void {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.18);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + i * 0.12);
      osc.stop(t0 + i * 0.12 + 0.2);
    });
    navigator.vibrate?.(30);
  } catch {
    /* audio not available: the spoken status still tells the user */
  }
}

/**
 * Two falling notes plus two short buzzes: "that did not work". Used instead of the phone's voice after "Hey Netra",
 * where the owner wants no spoken fallback (for example when the voice assistant cannot connect).
 */
export function failChime(): void {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    [660, 440].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.22);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + i * 0.16);
      osc.stop(t0 + i * 0.16 + 0.24);
    });
    navigator.vibrate?.([60, 80, 60]);
  } catch {
    /* audio not available: the status line still shows the failure */
  }
}
