// Tier 0 detector: YOLO26n (ONNX) running fully on-device via ONNX Runtime Web.
// Execution providers: WebGPU first, WASM as the fallback. Loaded lazily so the start screen renders instantly.
import { withOrt } from "./ortLock";
import type * as OrtNs from "onnxruntime-web";
import { CONFIG } from "../config";
import { COCO_LABELS } from "./cocoLabels";

export interface RawDetection {
  label: string;
  score: number;
  bbox: [number, number, number, number];
}

type Ort = typeof OrtNs;
type Backend = "webgpu" | "wasm";

let ort: Ort | null = null;
let session: OrtNs.InferenceSession | null = null;
let backend: Backend | null = null;
let label: string | null = null;
let medianMs: number | null = null;
let loading: Promise<void> | null = null;
let webgpuFailed = false;

// Input size follows the loaded model (set by prepareBuffers). Buffers are reused every frame.
let SIZE = 0;
let PLANE = 0;
let ctx: CanvasRenderingContext2D | null = null;
let input: Float32Array | null = null;

function prepareBuffers(size: number): void {
  SIZE = size;
  PLANE = size * size;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d canvas unavailable");
  input = new Float32Array(3 * PLANE);
}

/** Which execution provider is actually running ("webgpu" | "wasm"). Used internally. */
type Choice = "s416" | "n416-gpu" | "n416-wasm";

/** What the debug bar shows: provider and model, e.g. "webgpu·s416", "webgpu·n416", "wasm·n416". Null before load. */
export function detectorBackend(): string | null {
  return label;
}

/** Median ms per frame measured when the model was chosen (from the saved decision on later starts). */
export function detectorMedianMs(): number | null {
  return medianMs;
}

const CHOICES: Record<Choice, { provider: Backend; model: { url: string; inputSize: number }; label: string }> = {
  s416: { provider: "webgpu", model: CONFIG.detector.models.webgpu, label: "webgpu·s416" },
  "n416-gpu": { provider: "webgpu", model: CONFIG.detector.models.webgpuSmall, label: "webgpu·n416" },
  "n416-wasm": { provider: "wasm", model: CONFIG.detector.models.wasm, label: "wasm·n416" },
};

function createSession(choice: Choice): Promise<OrtNs.InferenceSession> {
  const { provider, model } = CHOICES[choice];
  return withOrt(() =>
    ort!.InferenceSession.create(model.url, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
    }),
  );
}

async function warmUp(s: OrtNs.InferenceSession): Promise<void> {
  const blank = new ort!.Tensor("float32", new Float32Array(3 * PLANE), [1, 3, SIZE, SIZE]);
  await withOrt(() => s.run({ [s.inputNames[0]]: blank }));
}

const BENCH_RUNS = 5;

/** Median time of BENCH_RUNS runs after the first warm-up run. Median, not mean, so one slow outlier doesn't decide. */
async function benchmark(s: OrtNs.InferenceSession): Promise<number> {
  const blank = new ort!.Tensor("float32", new Float32Array(3 * PLANE), [1, 3, SIZE, SIZE]);
  const times: number[] = [];
  for (let i = 0; i < BENCH_RUNS; i++) {
    const t0 = performance.now();
    await withOrt(() => s.run({ [s.inputNames[0]]: blank }));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** Creates a session for `choice`, warms it up and times it. The input buffers are sized for that model. */
async function tryChoice(choice: Choice): Promise<{ s: OrtNs.InferenceSession; ms: number }> {
  prepareBuffers(CHOICES[choice].model.inputSize);
  const s = await createSession(choice);
  try {
    await warmUp(s);
    return { s, ms: await benchmark(s) };
  } catch (err) {
    void s.release().catch(() => {});
    throw err;
  }
}

function keep(choice: Choice, s: OrtNs.InferenceSession, ms: number): void {
  session = s;
  backend = CHOICES[choice].provider;
  label = CHOICES[choice].label;
  medianMs = ms;
}

// --- Saved decision --------------------------------------------------------------------------
// The first start on a phone benchmarks the models. The result is saved so later starts load the right model directly
// (and never download YOLO26s on a phone that was too slow for it). It is dropped when the app version or the
// maxFrameMs setting changes.
const DECISION_KEY = "netra.detector";

interface Decision {
  version: string;
  maxFrameMs: number;
  choice: Choice;
  ms: number;
}

function readDecision(): Decision | null {
  try {
    const d = JSON.parse(localStorage.getItem(DECISION_KEY) ?? "null") as Decision | null;
    if (d && d.version === CONFIG.appVersion && d.maxFrameMs === CONFIG.detector.maxFrameMs && d.choice in CHOICES) return d;
  } catch {
    /* unreadable or unavailable: benchmark again */
  }
  return null;
}

function saveDecision(choice: Choice, ms: number): void {
  try {
    const d: Decision = { version: CONFIG.appVersion, maxFrameMs: CONFIG.detector.maxFrameMs, choice, ms };
    localStorage.setItem(DECISION_KEY, JSON.stringify(d));
  } catch {
    /* storage is optional */
  }
}

function clearDecision(): void {
  try {
    localStorage.removeItem(DECISION_KEY);
  } catch {
    /* storage is optional */
  }
}

export function loadDetector(): Promise<void> {
  if (session) return Promise.resolve();
  loading ??= (async () => {
    ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/";

    // 1. A saved decision from an earlier start: load that model directly, no benchmark, no download of the others.
    const saved = readDecision();
    if (saved && (saved.choice === "n416-wasm" || "gpu" in navigator)) {
      try {
        prepareBuffers(CHOICES[saved.choice].model.inputSize);
        const s = await createSession(saved.choice);
        await warmUp(s);
        keep(saved.choice, s, saved.ms);
        return;
      } catch (err) {
        console.warn(`[detector] saved choice ${saved.choice} failed, benchmarking again`, err);
        clearDecision();
      }
    }

    // 2. First start: WebGPU YOLO26s; if its median frame time is too slow, WebGPU YOLO26n; if still too slow, WASM YOLO26n.
    if ("gpu" in navigator) {
      for (const choice of ["s416", "n416-gpu"] as const) {
        try {
          const { s, ms } = await tryChoice(choice);
          console.info(`[detector] ${CHOICES[choice].label}: median ${ms.toFixed(0)} ms (limit ${CONFIG.detector.maxFrameMs})`);
          if (ms <= CONFIG.detector.maxFrameMs) {
            keep(choice, s, ms);
            saveDecision(choice, ms);
            return;
          }
          await s.release().catch(() => {}); // too slow: discard this session
        } catch (err) {
          console.warn(`[detector] ${CHOICES[choice].label} failed, trying the next option`, err);
          webgpuFailed = true;
          break; // a broken WebGPU will not work for the smaller model either
        }
      }
    }
    const { s, ms } = await tryChoice("n416-wasm");
    keep("n416-wasm", s, ms);
    saveDecision("n416-wasm", ms);
  })().catch((err) => {
    loading = null; // allow a retry from the Start button
    throw err;
  });
  return loading;
}

/** Recreate the session on WASM after a WebGPU runtime failure. Happens at most once. */
async function fallBackToWasm(): Promise<void> {
  webgpuFailed = true;
  prepareBuffers(CHOICES["n416-wasm"].model.inputSize);
  const s = await createSession("n416-wasm");
  await warmUp(s);
  keep("n416-wasm", s, medianMs ?? 0);
}

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

function letterbox(video: HTMLVideoElement): Letterbox {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(SIZE / vw, SIZE / vh);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const padX = (SIZE - w) / 2;
  const padY = (SIZE - h) / 2;
  ctx!.fillStyle = "rgb(114,114,114)";
  ctx!.fillRect(0, 0, SIZE, SIZE);
  ctx!.drawImage(video, padX, padY, w, h);

  // RGBA bytes -> planar NCHW RGB float32 in 0..1
  const px = ctx!.getImageData(0, 0, SIZE, SIZE).data;
  const buf = input!;
  for (let i = 0, j = 0; i < PLANE; i++, j += 4) {
    buf[i] = px[j] / 255;
    buf[PLANE + i] = px[j + 1] / 255;
    buf[2 * PLANE + i] = px[j + 2] / 255;
  }
  return { scale, padX, padY };
}

/** Candidate box in 320-px letterbox coordinates, corners x1,y1,x2,y2. */
interface Candidate {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  cls: number;
}

/** End-to-end, NMS-free output: [1, N, 6], rows of x1, y1, x2, y2, score, class_id. */
function parseEndToEnd(data: Float32Array, n: number, minScore: number): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const score = data[o + 4];
    if (score < minScore) continue;
    out.push({ x1: data[o], y1: data[o + 1], x2: data[o + 2], y2: data[o + 3], score, cls: Math.round(data[o + 5]) });
  }
  return out;
}

function iou(a: Candidate, b: Candidate): number {
  const iw = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const ih = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter);
}

/** Raw output: [1, 4 + nc, anchors], rows cx, cy, w, h then class scores. Needs per-class NMS. */
function parseRaw(data: Float32Array, channels: number, anchors: number, minScore: number): Candidate[] {
  const nc = channels - 4;
  const cands: Candidate[] = [];
  for (let a = 0; a < anchors; a++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < nc; c++) {
      const sc = data[(4 + c) * anchors + a];
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    if (best < 0 || bestScore < minScore) continue;
    const cx = data[a];
    const cy = data[anchors + a];
    const w = data[2 * anchors + a];
    const h = data[3 * anchors + a];
    cands.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, score: bestScore, cls: best });
  }
  cands.sort((p, q) => q.score - p.score);
  const kept: Candidate[] = [];
  for (const c of cands) {
    if (kept.every((k) => k.cls !== c.cls || iou(k, c) < CONFIG.detector.nmsIou)) kept.push(c);
  }
  return kept;
}

function parseOutput(t: OrtNs.Tensor, minScore: number): Candidate[] {
  const data = t.data as Float32Array;
  const dims = t.dims;
  if (dims.length === 3 && dims[2] === 6) return parseEndToEnd(data, dims[1], minScore);
  if (dims.length === 3 && dims[1] === COCO_LABELS.length + 4) return parseRaw(data, dims[1], dims[2], minScore);
  throw new Error(`unexpected detector output shape [${dims.join(",")}]`);
}

export async function detect(video: HTMLVideoElement): Promise<RawDetection[]> {
  if (!session || !ort || !video.videoWidth) throw new Error("detector not loaded");
  const { scale, padX, padY } = letterbox(video);
  const tensor = new ort.Tensor("float32", input!, [1, 3, SIZE, SIZE]);

  let active = session;
  let results: OrtNs.InferenceSession.OnnxValueMapType;
  try {
    results = await withOrt(() => active.run({ [active.inputNames[0]]: tensor }));
  } catch (err) {
    if (backend !== "webgpu" || webgpuFailed) throw err;
    console.warn("[detector] WebGPU run failed, recreating session on WASM", err);
    await fallBackToWasm();
    active = session!;
    const retry = active;
    results = await withOrt(() => retry.run({ [retry.inputNames[0]]: tensor }));
  }

  const cands = parseOutput(results[active.outputNames[0]] as OrtNs.Tensor, CONFIG.detector.maybeScore);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const out: RawDetection[] = [];
  for (const c of cands) {
    const label = COCO_LABELS[c.cls];
    if (!label) continue;
    const x = Math.max(0, (c.x1 - padX) / scale);
    const y = Math.max(0, (c.y1 - padY) / scale);
    const x2 = Math.min(vw, (c.x2 - padX) / scale);
    const y2 = Math.min(vh, (c.y2 - padY) / scale);
    if (x2 <= x || y2 <= y) continue;
    out.push({ label, score: c.score, bbox: [x, y, x2 - x, y2 - y] });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, CONFIG.detector.maxBoxes);
}
