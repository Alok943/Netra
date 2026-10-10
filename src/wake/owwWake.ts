// On-device "Hey Netra" wake word. Runs openWakeWord's frozen feature models plus our own small classifier
// (trained in ml/wakeword) with ONNX Runtime Web. No audio leaves the phone and no account or key is involved.
//
// Per 80 ms of audio:  melspectrogram -> embedding (96 numbers) -> classifier over the last 16 embeddings -> score.
// Model files live in public/models/wake/. If they are missing, startOwwWake returns null and the app uses the simple
// speech-recognition wake word instead.
import type * as OrtNs from "onnxruntime-web";
import { micHub } from "../audio/micHub";
import { withOrt } from "../vision/ortLock";

const BASE = "/models/wake/";
const CHUNK = 1280; // 80 ms at 16 kHz
const OVERLAP = 480; // extra samples before each chunk that the melspectrogram needs
const WINDOW = 16; // embeddings per classifier input
const MEL_BINS = 32;

export interface OwwHandle {
  setPaused(paused: boolean): void;
  stop(): void;
}

export interface OwwConfig {
  /** Score (0 to 1) the classifier must reach */
  threshold: number;
  /** Consecutive 80 ms windows that must all reach the threshold (filters one-off spikes) */
  consecutive: number;
  cooldownMs: number;
}

const DEFAULTS: OwwConfig = { threshold: 0.7, consecutive: 2, cooldownMs: 2500 };

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/** The streaming scorer: feed it 16 kHz audio (int16 values as floats), get a score per 80 ms. */
export class OwwModel {
  private tail = new Float32Array(OVERLAP);
  // The mel buffer starts as ones and the embedding buffer empty, like openWakeWord does.
  private melRows: Float32Array[] = Array.from({ length: 76 }, () => new Float32Array(MEL_BINS).fill(1));
  private feats: Float32Array[] = [];
  private pending = new Float32Array(0);

  private constructor(
    private ort: typeof OrtNs,
    private mel: OrtNs.InferenceSession,
    private emb: OrtNs.InferenceSession,
    private head: OrtNs.InferenceSession,
    readonly config: OwwConfig,
  ) {}

  /** Loads the three models, or returns null if their files are not installed. */
  static async load(): Promise<OwwModel | null> {
    if (!(await exists(`${BASE}hey_netra.onnx`)) || !(await exists(`${BASE}melspectrogram.onnx`))) return null;
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/";
    const opts: OrtNs.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    const [mel, emb, head] = await Promise.all([
      withOrt(() => ort.InferenceSession.create(`${BASE}melspectrogram.onnx`, opts)),
      withOrt(() => ort.InferenceSession.create(`${BASE}embedding_model.onnx`, opts)),
      withOrt(() => ort.InferenceSession.create(`${BASE}hey_netra.onnx`, opts)),
    ]);
    let config = DEFAULTS;
    try {
      config = { ...DEFAULTS, ...(await (await fetch(`${BASE}hey_netra.json`)).json()) };
    } catch {
      /* defaults */
    }
    return new OwwModel(ort, mel, emb, head, config);
  }

  /** Feed any amount of audio. Returns one score for every full 80 ms chunk completed by this call. */
  async feed(samples: Float32Array): Promise<number[]> {
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);
    const scores: number[] = [];
    let offset = 0;
    while (merged.length - offset >= CHUNK) {
      const s = await this.step(merged.subarray(offset, offset + CHUNK));
      if (s !== null) scores.push(s);
      offset += CHUNK;
    }
    this.pending = merged.slice(offset);
    return scores;
  }

  /** Forget all buffered audio and features (after pausing, or after falling too far behind). */
  reset(): void {
    this.pending = new Float32Array(0);
    this.tail = new Float32Array(OVERLAP);
    this.melRows = Array.from({ length: 76 }, () => new Float32Array(MEL_BINS).fill(1));
    this.feats = [];
  }

  release(): void {
    void Promise.all([this.mel.release(), this.emb.release(), this.head.release()]);
  }

  private async step(chunk: Float32Array): Promise<number | null> {
    const { ort, mel, emb, head } = this;
    const input = new Float32Array(OVERLAP + CHUNK);
    input.set(this.tail, 0);
    input.set(chunk, OVERLAP);
    this.tail = chunk.slice(CHUNK - OVERLAP);

    const melOut = await withOrt(() => mel.run({ [mel.inputNames[0]]: new ort.Tensor("float32", input, [1, input.length]) }), "high");
    const m = melOut[mel.outputNames[0]].data as Float32Array;
    for (let r = 0; r < m.length / MEL_BINS; r++) {
      const row = new Float32Array(MEL_BINS);
      for (let c = 0; c < MEL_BINS; c++) row[c] = m[r * MEL_BINS + c] / 10 + 2;
      this.melRows.push(row);
    }
    if (this.melRows.length > 970) this.melRows.splice(0, this.melRows.length - 970);

    const flat = new Float32Array(76 * MEL_BINS);
    this.melRows.slice(-76).forEach((row, i) => flat.set(row, i * MEL_BINS));
    const embOut = await withOrt(() => emb.run({ [emb.inputNames[0]]: new ort.Tensor("float32", flat, [1, 76, MEL_BINS, 1]) }), "high");
    this.feats.push(Float32Array.from(embOut[emb.outputNames[0]].data as Float32Array));
    if (this.feats.length > 60) this.feats.splice(0, this.feats.length - 60);
    if (this.feats.length < WINDOW) return null;

    const win = new Float32Array(WINDOW * 96);
    this.feats.slice(-WINDOW).forEach((f, i) => win.set(f, i * 96));
    const out = await withOrt(() => head.run({ [head.inputNames[0]]: new ort.Tensor("float32", win, [1, WINDOW, 96]) }), "high");
    return (out[head.outputNames[0]].data as Float32Array)[0];
  }
}

/** Audio older than this when its turn comes is dropped: a wake word heard seconds late is worse than a missed one. */
const MAX_LAG_MS = 1000;

/**
 * Starts listening on the shared microphone. Returns null when the model files are not installed.
 * `onLag` reports how far behind real time the scorer is (ms), for the debug bar.
 */
export async function startOwwWake(
  onWake: () => void,
  onScore?: (score: number) => void,
  onLag?: (ms: number) => void,
): Promise<OwwHandle | null> {
  const model = await OwwModel.load();
  if (!model) return null;
  const { threshold, consecutive, cooldownMs } = model.config;

  let queue: Promise<void> = Promise.resolve();
  let paused = false;
  let stopped = false;
  let lastWake = 0;
  let streak = 0;

  const unsubscribe = await micHub.subscribe((pcm) => {
    if (paused || stopped) return;
    const f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i]; // int16 values as floats, as the model expects
    const heardAt = performance.now();
    queue = queue
      .then(async () => {
        if (paused || stopped) return;
        const lag = performance.now() - heardAt;
        onLag?.(Math.round(lag));
        if (lag > MAX_LAG_MS) {
          // Fell behind (a long detector run, or a slow phone): start fresh instead of scoring stale audio.
          model.reset();
          streak = 0;
          return;
        }
        for (const score of await model.feed(f)) {
          onScore?.(score);
          streak = score >= threshold ? streak + 1 : 0;
          const now = performance.now();
          if (streak >= consecutive && now - lastWake > cooldownMs) {
            lastWake = now;
            streak = 0;
            onWake();
          }
        }
      })
      .catch((e) => console.warn("[wake]", e));
  });

  return {
    setPaused(p) {
      paused = p;
      if (p) {
        model.reset();
        streak = 0;
      }
    },
    stop() {
      stopped = true;
      unsubscribe();
      model.release();
    },
  };
}
