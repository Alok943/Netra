// Generates the spoken tutorial with Sarvam text-to-speech (bulbul:v3).
//
//   node scripts/gen-tutorial.mjs --dry-run   count the characters it would send, spend nothing
//   node scripts/gen-tutorial.mjs             generate missing or changed clips
//
// Reads SARVAM_API_KEY from .env (never printed). Writes public/tutorial/{en,hi}/<id>.mp3 and public/tutorial/manifest.json.
// Pricing seen on Sarvam's page: about Rs 30 per 10,000 characters. A hard cap stops a runaway re-run.
// Text is edited in scripts/tutorial-script.mjs; a clip is regenerated only when its text changed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./tutorial-script.mjs";

const SPEAKER = process.env.TUTORIAL_SPEAKER ?? "shubh"; // Sarvam's default bulbul:v3 voice; speaks English and Hindi
const PACE = 0.95; // slightly slower than normal: it is listened to while walking
const CAP_CHARS = 9000; // per run, about Rs 27
const LANGS = { en: "en-IN", hi: "hi-IN" };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tutorial");
const ledgerPath = join(root, "scripts", "tutorial-ledger.json");
const dry = process.argv.includes("--dry-run");

const hash = (s) => createHash("sha1").update(`${SPEAKER}|${PACE}|${s}`).digest("hex").slice(0, 12);
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { chars: 0, clips: {} };

const todo = [];
for (const lang of Object.keys(LANGS)) {
  for (const step of STEPS) {
    const rel = `${lang}/${step.id}.mp3`;
    if (existsSync(join(outDir, rel)) && ledger.clips[rel] === hash(step[lang])) continue;
    todo.push({ lang, rel, text: step[lang], id: step.id });
  }
}
const need = todo.reduce((n, j) => n + j.text.length, 0);
console.log(`${todo.length} clip(s) to generate, ${need} characters (spent on tutorial so far: ${ledger.chars}). Voice: ${SPEAKER}.`);

function writeManifest() {
  mkdirSync(outDir, { recursive: true });
  const manifest = Object.fromEntries(
    Object.keys(LANGS).map((lang) => [lang, STEPS.map((s) => ({ id: s.id, text: s[lang] }))]),
  );
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

if (dry) process.exit(0);
if (need > CAP_CHARS) {
  console.error(`Over the ${CAP_CHARS}-character cap for one run. Trim the text or raise CAP_CHARS.`);
  process.exit(1);
}

function loadKey() {
  const env = readFileSync(join(root, ".env"), "utf8");
  const m = env.match(/^\s*SARVAM_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) {
    console.error("SARVAM_API_KEY not found in .env");
    process.exit(1);
  }
  return m[1].replace(/^["']|["']$/g, "");
}

async function synth(key, text, languageCode) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        speaker: SPEAKER,
        model: "bulbul:v3",
        pace: PACE,
        speech_sample_rate: 22050,
        output_audio_codec: "mp3",
      }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Sarvam HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    return Buffer.from(body.audios[0], "base64");
  }
  throw new Error("Too many 429 responses; re-run later.");
}

if (todo.length > 0) {
  const key = loadKey();
  for (const [n, job] of todo.entries()) {
    const audio = await synth(key, job.text, LANGS[job.lang]);
    mkdirSync(dirname(join(outDir, job.rel)), { recursive: true });
    writeFileSync(join(outDir, job.rel), audio);
    ledger.chars += job.text.length;
    ledger.clips[job.rel] = hash(job.text);
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`  ${n + 1}/${todo.length} ${job.rel} (${(audio.length / 1024).toFixed(0)} KB)`);
  }
}
writeManifest();
console.log("done. Total characters spent on the tutorial:", ledger.chars);
