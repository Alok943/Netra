// Calibration test for the Jev router: sends a fixed set of realistic router states to the real Jev API and stores every
// input and output, so we can see how confident Jev is in the situations Netra meets, and how long it takes.
//
//   npx tsx --env-file=.env scripts/jev-calibration.ts            # run, write tests/jev-calibration/results.json
//   npx tsx --env-file=.env scripts/jev-calibration.ts --dry-run  # only list the cases
//
// Each case is sent exactly like the app sends it (see src/router/router.ts and server/handlers.ts): the state as a JSON
// string plus the same questions. Nothing here touches the app or Gemini.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/config.ts";
import { JEV_QUESTIONS, parseJevResponse } from "../src/router/router.ts";
import type { Handler, RouterState } from "../src/router/types.ts";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const CLIENT_BUDGET_MS = CONFIG.router.jevTimeoutMs; // the app gives up after this long
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tests", "jev-calibration");
const dry = process.argv.includes("--dry-run");

type Prox = "very_near" | "near" | "far";
type Det = RouterState["detections"][number];

const d = (label: string, conf: number, distance: Prox = "near", distance_m: number | null = 1.5, in_path = true): Det => ({
  label,
  distance,
  distance_m,
  conf,
  in_path,
});

interface Case {
  id: string;
  group: string;
  note: string;
  state: RouterState;
}

function state(over: Partial<RouterState> & Pick<RouterState, "detections">): RouterState {
  return {
    user_query: null,
    language: "en",
    text_region_detected: false,
    last_route: null,
    network: "online",
    trigger: "new_object",
    ...over,
  };
}

const cases: Case[] = [];
const add = (id: string, group: string, note: string, s: RouterState) => cases.push({ id, group, note, state: s });

// A. The case that actually triggers Jev in the app: one unsure object (30-50%) newly in the path.
const UNSURE_OBJECTS: [string, number, Prox, number][] = [
  ["chair", 0.45, "near", 1.6], ["chair", 0.38, "far", 3.2], ["bottle", 0.41, "near", 1.2], ["backpack", 0.44, "near", 1.4],
  ["bench", 0.36, "far", 3.5], ["potted plant", 0.47, "near", 1.8], ["suitcase", 0.4, "near", 1.5], ["dog", 0.42, "near", 2.0],
  ["person", 0.39, "far", 3.0], ["bicycle", 0.43, "near", 1.9], ["motorcycle", 0.46, "near", 1.7], ["car", 0.37, "far", 4.0],
  ["handbag", 0.35, "near", 1.0], ["umbrella", 0.48, "near", 1.3], ["cell phone", 0.33, "near", 0.9], ["book", 0.31, "near", 0.8],
];
for (const [label, conf, prox, m] of UNSURE_OBJECTS) {
  add(`A-${label.replace(/ /g, "_")}-${conf}`, "A single unsure object (the real trigger)", `${label} ${conf} ${prox}`, state({ detections: [d(label, conf, prox, m)] }));
}

// B. Confidence sweep for one object: does Jev's answer depend on the detector's confidence at all?
for (const conf of [0.3, 0.35, 0.4, 0.45, 0.49]) {
  add(`B-chair-conf-${conf}`, "B confidence sweep (chair, near)", `chair ${conf}`, state({ detections: [d("chair", conf)] }));
}

// C. Likely false positives: odd objects on the street.
for (const [label, conf] of [["toothbrush", 0.34], ["hair drier", 0.32], ["teddy bear", 0.4], ["kite", 0.37], ["sports ball", 0.45], ["tie", 0.36], ["vase", 0.41], ["scissors", 0.33]] as const) {
  add(`C-${label.replace(/ /g, "_")}`, "C odd objects (probable false positives)", `${label} ${conf}`, state({ detections: [d(label, conf)] }));
}

// D. Busier scenes with one unsure object.
add("D-person-motorcycle-dog", "D busier scenes", "person 0.9 + motorcycle 0.8 + unsure dog", state({ detections: [d("person", 0.9, "far", 4), d("motorcycle", 0.8, "near", 2.2, false), d("dog", 0.42, "near", 1.6)] }));
add("D-crowd-one-unsure", "D busier scenes", "5 people + unsure bag", state({ detections: [d("person", 0.85, "near", 2), d("person", 0.82, "near", 2.4), d("person", 0.8, "far", 3.5), d("person", 0.78, "far", 4), d("person", 0.74, "far", 4.5), d("handbag", 0.41, "near", 1.2)] }));
add("D-car-truck-unsure", "D busier scenes", "car + truck + unsure bus", state({ detections: [d("car", 0.9, "far", 6, false), d("truck", 0.7, "far", 7, false), d("bus", 0.42, "near", 3.5)] }));
add("D-two-unsure", "D busier scenes", "two unsure objects", state({ detections: [d("chair", 0.44), d("bench", 0.38, "far", 3.4)] }));

// E. Same object, other language and routing history.
add("E-chair-hindi", "E language and history", "chair 0.45, language hi", state({ language: "hi", detections: [d("chair", 0.45)] }));
add("E-chair-last-rule", "E language and history", "chair 0.45, last route rule_reply", state({ last_route: "rule_reply" as Handler, detections: [d("chair", 0.45)] }));
add("E-chair-last-gemini", "E language and history", "chair 0.45, last route gemini_live", state({ last_route: "gemini_live" as Handler, detections: [d("chair", 0.45)] }));
add("E-bottle-hindi", "E language and history", "bottle 0.41, language hi", state({ language: "hi", detections: [d("bottle", 0.41)] }));

// F. Other triggers.
add("F-scene-change-empty", "F other triggers", "scene change, nothing detected", state({ trigger: "scene_change", detections: [] }));
add("F-scene-change-chair", "F other triggers", "scene change, confident chair", state({ trigger: "scene_change", detections: [d("chair", 0.88)] }));
add("F-text-region", "F other triggers", "text region seen, bus", state({ trigger: "text_region", text_region_detected: true, detections: [d("bus", 0.85, "near", 3)] }));
add("F-text-region-none", "F other triggers", "text region seen, nothing else", state({ trigger: "text_region", text_region_detected: true, detections: [] }));

// G. Contrast: real questions. These should be confident; they show what "confident" looks like.
const QUESTIONS: [string, string, Det[]][] = [
  ["what is in front of me", "en", [d("chair", 0.88)]],
  ["how far is the chair", "en", [d("chair", 0.88)]],
  ["read this note", "en", [d("book", 0.6)]],
  ["what does the sign say", "en", []],
  ["describe the scene", "en", [d("person", 0.9, "far", 4)]],
  ["can I go to the right", "en", [d("chair", 0.8, "near", 1.5, false)]],
  ["is it safe to cross", "en", [d("car", 0.9, "far", 8)]],
  ["who is there", "en", [d("person", 0.9)]],
  ["is this a hundred rupee note", "en", []],
  ["सामने क्या है", "hi", [d("chair", 0.88)]],
  ["यह नोट कितने का है", "hi", []],
  ["padh ke batao", "en", [d("book", 0.6)]],
  ["kitni door hai", "en", [d("chair", 0.88)]],
];
for (const [q, lang, dets] of QUESTIONS) {
  add(`G-${q.replace(/\s+/g, "_").slice(0, 28)}`, "G spoken questions (contrast)", q, state({ trigger: "user_speech", user_query: q, language: lang as "en" | "hi", detections: dets }));
}

// H. Repeat three cases to see whether the answer is stable between identical calls.
for (const rep of [2, 3]) {
  add(`H-chair-0.45-run${rep}`, "H repeat (same input)", "chair 0.45 again", state({ detections: [d("chair", 0.45)] }));
  add(`H-dog-0.42-run${rep}`, "H repeat (same input)", "dog 0.42 again", state({ detections: [d("dog", 0.42)] }));
  add(`H-read-note-run${rep}`, "H repeat (same input)", "read this note again", state({ trigger: "user_speech", user_query: "read this note", detections: [d("book", 0.6)] }));
}

console.log(`${cases.length} cases, model ${JEV_MODEL}. Client budget in the app: ${CLIENT_BUDGET_MS} ms.`);
if (dry) {
  for (const c of cases) console.log(`  ${c.id}  [${c.group}]  ${c.note}`);
  process.exit(0);
}

function loadKey(): string {
  const direct = (process.env.TYPESAFE_API_KEY ?? "").trim();
  if (direct) return direct.replace(/^["']|["']$/g, "");
  const m = readFileSync(join(root, ".env"), "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) {
    console.error("TYPESAFE_API_KEY not found in .env");
    process.exit(1);
  }
  return m[1].replace(/^["']|["']$/g, "");
}

interface Result {
  id: string;
  group: string;
  note: string;
  input: { state: RouterState };
  ms: number;
  http: number | null;
  withinBudget: boolean;
  raw: unknown;
  choice: string | null;
  routeConfidence: number | null;
  speakNoul: number | null;
  /** What the app would do with this answer (parseJevResponse + describeUnsure) */
  decision: { handler: string; source: string; speakNow: boolean; opensGemini: boolean } | null;
  error?: string;
}

const key = loadKey();
const results: Result[] = [];

for (const [i, c] of cases.entries()) {
  const t0 = performance.now();
  let http: number | null = null;
  let raw: unknown = null;
  let error: string | undefined;
  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state: JSON.stringify(c.state), questions: JEV_QUESTIONS }),
      signal: AbortSignal.timeout(15_000),
    });
    http = res.status;
    const text = await res.text();
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { raw: text.slice(0, 500) };
    }
  } catch (e) {
    error = String(e);
  }
  const ms = Math.round(performance.now() - t0);
  const answers = (raw as { answers?: Record<string, { choice?: string; confidence?: number; noul?: number }> } | null)?.answers;
  const decision = raw ? parseJevResponse(raw, c.state) : null;
  const opensGemini = decision ? decision.handler === "gemini_live" && decision.source === "jev" && decision.speakNow : false;
  results.push({
    id: c.id,
    group: c.group,
    note: c.note,
    input: { state: c.state },
    ms,
    http,
    withinBudget: ms <= CLIENT_BUDGET_MS,
    raw,
    choice: answers?.route?.choice ?? null,
    routeConfidence: answers?.route?.confidence ?? null,
    speakNoul: answers?.speak_now?.noul ?? null,
    decision: decision ? { handler: decision.handler, source: decision.source, speakNow: decision.speakNow, opensGemini } : null,
    ...(error ? { error } : {}),
  });
  const r = results[results.length - 1];
  console.log(
    `${String(i + 1).padStart(2)}/${cases.length} ${c.id.padEnd(34)} ${String(r.choice).padEnd(11)} conf ${r.routeConfidence?.toFixed(2) ?? "-"}  speak ${r.speakNoul?.toFixed(2) ?? "-"}  ${ms} ms${error ? "  ERROR" : ""}`,
  );
  await new Promise((r2) => setTimeout(r2, 250));
}

mkdirSync(outDir, { recursive: true });
const out = {
  ranAt: new Date().toISOString(),
  jevModelRequested: JEV_MODEL,
  jevModelReported: (results.find((r) => r.raw && (r.raw as { model?: string }).model)?.raw as { model?: string } | undefined)?.model ?? null,
  appThresholds: { confidenceThreshold: CONFIG.router.confidenceThreshold, clientBudgetMs: CLIENT_BUDGET_MS },
  questions: JEV_QUESTIONS,
  results,
};
writeFileSync(join(outDir, "results.json"), JSON.stringify(out, null, 2));
console.log(`\nWrote tests/jev-calibration/results.json (${results.length} cases).`);
