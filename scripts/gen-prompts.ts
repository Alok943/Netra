// Pre-records Netra's fixed spoken messages (start, stop, permissions, quiet mode, ...) with Sarvam text-to-speech,
// so they play instantly, offline, in one clear voice that differs from the phone's own voice used for object announcements.
//
//   npx tsx --env-file=.env scripts/gen-prompts.ts            # records anything new or changed
//   npx tsx --env-file=.env scripts/gen-prompts.ts --dry-run  # just report what it would send
//
// Output: public/audio/<lang>/<key>.mp3 and public/audio/manifest.json (key -> { text, file }).
// The app only uses a recording when its text still matches the current string in src/i18n/strings.ts.
// Cost: about Rs 30 per 10,000 characters (bulbul:v3); the whole set is roughly 2,400 characters.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SYS } from "../src/i18n/strings.ts";

const SPEAKER = "shubh"; // change here (and re-run) to pick another Sarvam voice
const LANG_CODE = { en: "en-IN", hi: "hi-IN" } as const;
const SKIP = new Set(["liveHint"]); // sent to Gemini as text, never spoken

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "audio");
const manifestPath = join(outDir, "manifest.json");
const dry = process.argv.includes("--dry-run");

const key = (process.env.SARVAM_API_KEY ?? process.env["SARVAM_API_KEY "] ?? "").trim().replace(/^["']|["']$/g, "");
if (!dry && !key) {
  console.error("SARVAM_API_KEY not found in .env");
  process.exit(1);
}

type Manifest = Record<string, Record<string, { text: string; file: string; speaker: string }>>;
const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf-8")) : { en: {}, hi: {} };

let chars = 0;
let made = 0;
for (const lang of ["en", "hi"] as const) {
  mkdirSync(join(outDir, lang), { recursive: true });
  manifest[lang] ??= {};
  for (const [k, v] of Object.entries(SYS[lang])) {
    if (typeof v !== "string" || SKIP.has(k)) continue;
    const have = manifest[lang][k];
    const file = `${lang}/${k}.mp3`;
    if (have && have.text === v && have.speaker === SPEAKER && existsSync(join(outDir, file))) continue;
    chars += v.length;
    if (dry) {
      console.log(`would record ${lang}/${k} (${v.length} chars)`);
      continue;
    }
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: v,
        language_code: LANG_CODE[lang],
        speaker: SPEAKER,
        model: "bulbul:v3",
        pace: 1.0,
        speech_sample_rate: 24000,
        output_audio_codec: "mp3",
      }),
    });
    if (!res.ok) {
      console.error(`${lang}/${k}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const body = (await res.json()) as { audios: string[] };
    writeFileSync(join(outDir, file), Buffer.from(body.audios[0], "base64"));
    manifest[lang][k] = { text: v, file: `/audio/${file}`, speaker: SPEAKER };
    made++;
    console.log(`recorded ${lang}/${k}`);
  }
}
if (!dry) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(dry ? `dry run: ${chars} characters to send` : `done: ${made} recordings, ${chars} characters sent`);
