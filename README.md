# Netra

**Real-time object detection for blind users, with a voice assistant.**

Netra is built for visually impaired users in India. It is a React app (a PWA) that runs in Chrome on an Android phone, held at chest height or worn on a lanyard with the camera facing forward. It watches the way ahead, warns about obstacles **by vibration**, names what is in the path **by voice**, and answers spoken questions.

The core idea is that **safety never depends on the internet or on an AI service**. Detecting an obstacle and buzzing the phone runs on the phone itself. Cloud AI (Gemini Live, Jev) is optional help layered on top.

> Status: working prototype. Section 2 says what has been seen working on a phone and what is built but not yet phone-tested.

---

## 1. What it does

| Area | Behaviour |
| --- | --- |
| **Obstacle detection** | YOLO26 (ONNX Runtime Web) runs on the phone for every camera frame, on WebGPU when the phone has it, otherwise WASM. On first start it measures itself and keeps the larger model only if it is fast enough (`CONFIG.detector.maxFrameMs`). |
| **Distance and path** | Distance is estimated from box size and typical object heights (rough, not a sensor). A yellow lane on screen (the "track") marks the walking path. Only objects whose base is inside the track count as "in your way". |
| **Vibration warnings** | Two soft taps = object close in the path. Rapid strong buzz = very close. Three long pulses = camera stopped. A short buzz confirms that Netra has begun listening. Separate patterns exist for overhead objects and (future) drop-offs. Danger is vibration only, never speech, and never uses the network. |
| **Spoken announcements** | A new object entering the path is named with side and distance ("chair, ahead, close, about 2 metres"). Unsure detections are worded "possibly a chair" and never trigger vibration. Crowds are summarised instead of listing everyone. One announcement per 4 s at most. |
| **Voice questions** | **Ask Netra** listens once (Chrome speech recognition). Common walking questions ("what is ahead", "how far is the chair") are answered **on the phone from the detector's list**. Requests such as reading text or describing a scene open a **Gemini Live** session. **Ask Netra offline** never uses Gemini. |
| **Hey Netra** | Hands-free start, on by default for new installs. Our own small on-device wake-word model (openWakeWord features plus a classifier trained on Sarvam voices), with a speech-recognition fallback. The user can turn it off. |
| **Help me walk mode** | Local-first walking assistance. It prevents automatic escalation of uncertain detections to cloud AI; an explicit Ask Netra request can still open Gemini when needed. |
| **Camera recovery** | If the screen locks or the user switches apps, Android stops the camera. Netra notices, vibrates, says "Camera stopped. Restarting.", reopens the camera and says "Camera back." |
| **Flashlight** | Asks permission once, by voice or by tapping the screen. In Auto mode it switches on in the dark. To decide when to switch off, it briefly turns the light off every 20 s and looks at the real brightness. Light button: Auto / On / Off. |
| **Languages** | English and Hindi: first-run question, labels, spoken text, object names and the Gemini prompt. |
| **Built for blind users** | Whole-screen Start target, large buttons with spoken labels, first-tap/second-tap activation, swipe-left/right control exploration and double-tap activation, system messages as recorded Sarvam voice clips (instant, offline), a spoken tutorial in English and Hindi, a first-run language choice, screen-reader friendly markup (live-region off so TalkBack does not read on top of Netra). |
| **Offline** | Installable PWA. After one online launch, detection, vibration and spoken object names work without internet. Voice conversation needs internet. |

---

## 2. What has been tested

| Seen working on a phone | Built, phone test still pending |
| --- | --- |
| Detection with vibration (about 7 fps on `webgpu·n416`, 131 ms) | Camera recovery after screen lock (fixed once, not re-verified) |
| Gemini Live voice conversation | Welcome-then-language first run |
| Jev routing (debug bar shows `route: gemini_live via jev`) | Local voice intents and Ask Netra offline |
| Hey Netra | Spoken tutorial, listening buzz |
| Flashlight switching on in the dark | Flashlight asking permission, and switching off after leaving the dark (20 s check just changed) |
| | Overhead-object cue, recorded system prompts, Help me walk |

---

## 3. How it works

```
 CAMERA ──► YOLO26 on the phone ──► distance + track ──► reflex engine ──► VIBRATION        (no network, ever)
                │                                  └─► announcer ──► SPOKEN OBJECT NAMES    (phone voice / recordings)
                │
                └─ unsure object ──► Jev (text only, via /api/jev) ──► speak on the phone, or open Gemini Live

 MIC ──► Ask Netra: Chrome speech recognition ──► voice intent
                                        ├─ walking question ──► answer from detections        (free, on the phone)
                                        └─ read / describe  ──► Gemini Live (online, paid)

 Hey Netra (on-device wake word) ───────────────────────────────► listen once ─► local answer or Gemini when needed
```

Priority is: **danger haptics > user question > proactive speech**. Camera-based danger haptics run alongside an active Gemini response; they do not interrupt it, because visual distance is only an estimate.

### What runs where

| Where | What |
| --- | --- |
| On the phone | Detection, distance, track, vibration, hazard cues, announcements, rule-based answers, wake word, camera recovery, flashlight, recorded prompts and tutorial playback |
| Vercel (Mumbai, `bom1`) | `/api/gemini-token` (issues a short-lived Gemini token; the real key never reaches the phone), `/api/jev` (adds the Jev key and forwards text), `/api/health`. Per-IP rate limits. |
| Google (Gemini Live, v1beta) | Voice conversation with camera frames, only while a session is open |
| TypeSafe (Jev) | Text-only routing decisions |
| Sarvam (build time only) | Text-to-speech used to generate the recorded prompts, tutorial and wake-word training clips. Nothing calls Sarvam while the app runs. |

---

## 4. How Jev is used in real time

Jev is a small, fast model from TypeSafe that answers a classification question about a short piece of **text**. In Netra it is a **router**: it decides whether something deserves the expensive Gemini Live session or can be said on the phone. It never sees camera frames or audio, and it is **not** involved in danger warnings.

**Where it is called.** There is exactly one place: when the detector finds an object in the walking path that it is only 30 to 50 percent sure about (`describeUnsure` in `src/App.tsx`).

Call conditions, all required: online, Help me walk off, not a crowd summary, the object has been stable for 3 frames, and Quiet mode is off.

**What happens, step by step**

1. The announcer picks an unsure object to talk about.
2. The app builds a small text state (`toRouterState`): object label, nearness, distance, detector confidence, whether it is in the path, language, whether online, and the last routing result. No images, no audio.
3. The phone posts it to `/api/jev`. The server adds the model name and the API key and forwards it to TypeSafe. The client gives up after **1.5 s**; the server after 2 s.
4. Jev answers two questions:
   - **route**: `rule_reply` (a simple answer from detections is enough) or `gemini_live` (needs real scene understanding), with a confidence.
   - **speak_now**: should Netra speak at all right now.
5. The app decides:
   - Confidence above **0.8** and the choice is `gemini_live`: open a Gemini Live session about that object. The prompt says the detector's guess may be wrong and to look at the picture itself. (Jev's "confidence" is the gap between its two probabilities, so above 0.8 means the winner has roughly 90 percent or more.)
   - Anything else (answered `rule_reply`, low confidence, timeout, error, offline): speak the on-device sentence ("possibly a bottle, a small object on your left"), or stay silent if Jev says not to speak.
6. If Jev is slow or down, a keyword fallback runs instead, so Jev never blocks the app.

**Measured behaviour** (60 test states sent to the real Jev API, full inputs and outputs in `tests/jev-calibration/results.json`, summary in `docs/jev-calibration.md`):
- Latency 305 to 614 ms, median 335 ms, always inside the 1.5 s budget.
- For an unsure object Jev chose `rule_reply` every time (37 of 37), so this path did not open Gemini in the tests. Jev ignored the detector's confidence and the object type.
- Jev chose `gemini_live` confidently only for real requests such as "read this note" or "what does the sign say".
- Its `speak_now` answer stayed below the 0.8 gate for every unsure-object case, which makes the app silent about unsure objects while Jev is answering. This is a known issue awaiting an owner decision.

Everything else (danger, confident objects, crowds, "just now" follow-ups, tap to talk, Hey Netra) never asks Jev. Jev is a narrow cost and quality gate, not the core of the system.

---

## 5. Gemini usage and cost

Gemini Live is the most expensive part, so Netra limits it to explicit complex questions and a narrow, confidence-gated Jev escalation for an uncertain path object:

- Tap-to-talk questions that the detector can answer are answered on the phone.
- Danger, confident objects, crowds and follow-ups never use Gemini.
- Ask Netra offline never uses Gemini. Help me walk disables only automatic uncertain-object escalation; the user can still explicitly Ask Netra for Gemini help.
- While a session is open: mic audio plus one camera frame per second. The first frame is sent before the question so the model never answers from text alone.
- The Gemini system prompt (set on the server, locked into the token) forbids answering "can I go right/forward" with yes or no. It must describe what is visible, say what the camera cannot see, and remind the user to check with the cane.

---

## 6. Limitations

**Safety**
- Distance is an estimate from box size, not a measurement. It is rough, and a wrong estimate can delay or advance a warning.
- The camera sees only a narrow view straight ahead. It cannot see far left or right, behind the user, or the floor at their feet.
- YOLO26 uses the 80 COCO classes. It does not know pot-holes, open drains, stairs, kerbs, glass doors, poles, branches or awnings. Drop-off cues exist in code but need a fine-tuned model that is not trained yet.
- About 7 fps on a mid-range phone. That is fast enough for walking pace, not for fast approaching vehicles.
- Netra is an aid. It does not replace the cane or the user's own judgement.

**AI answers**
- Gemini can still be wrong. Prompts reduce risky answers but do not eliminate them.
- Voice conversation needs internet and costs money per use. There is no per-user spending cap yet.
- Reading text on device uses Chrome's TextDetector, which is not available on every phone. The offline doorway model is not installed.

**Platform**
- Android Chrome only. iPhone Safari has no vibration API.
- A web page cannot listen with the screen off or in the background. If the screen locks the camera stops; recovery only starts when the user comes back.
- Speech before the first touch is blocked by Chrome unless the app is installed. A blind user may hear nothing until they touch the screen; screen-reader users can still reach the buttons.
- Always-on wake-word listening runs on the main CPU, unlike the phone assistant's dedicated low-power hardware, so it costs battery. Detection and the camera cost more.
- Chrome speech recognition sends audio to Google and needs internet.

**Product**
- No access gate on the API endpoints: anyone with the URL can use the keys, within rate limits. Keep the deployed URL private.
- Tested only on a small set of phones. Hindi voices and phrases need review by native speakers and blind users.
- No user accounts, no day history or summary.

---

## 7. Future scope

1. **Smart stick.** A stick at about 3.5 ft with a better camera, an ultrasonic sensor for measured distance, haptics in the handle and a button. The ESP32 ultrasonic design is in `docs/ultrasonic-esp32.md`; the phone connection path is still to be decided. Essential safety must work without the phone.
2. **Measured distance and depth** from the stick (ultrasonic or depth camera) instead of box-size estimates.
3. **A road-hazard model**: fine-tune the detector for pot-holes, open drains, stairs, kerbs, poles and doors, and enable the drop-off cue.
4. **Cheaper assistant tiers.** Basic (free, on device), Assistant (one picture plus one question to a small Gemini model), Full conversation (Live, with daily limits). Measure and show the cost per question.
5. **Spending controls**: daily caps per device, token usage logging and billing alerts.
6. **On-device speech and commands**: offline speech-to-text and voice commands for the buttons; later a small on-device language model on a stick NPU.
7. **Native Android app** (for example Capacitor): background and lock-screen operation, low-power wake word, hardware buttons, Bluetooth to the stick, zero-tap start.
8. **Hinglish and more Indian languages**, tested with native speakers.
9. **Access control** for the cloud endpoints, then optional user history.
10. **Testing with blind users** and partner organisations before any wider release.

---

## 8. Run it

```bash
npm install
cp .env.example .env     # fill in GEMINI_API_KEY, TYPESAFE_API_KEY, GEMINI_LIVE_MODEL (and SARVAM_API_KEY for recordings)
npm run dev              # API on :8787, app on https://localhost:5173
```

Open `https://localhost:5173/api/health`. It should show `geminiKey: true` and `typesafeKey: true`.

**On a phone (same Wi-Fi):** open the `Network:` URL that `npm run dev` prints in Chrome on Android and accept the certificate warning. Camera and microphone need HTTPS.

**Deploy:** the Vercel project is linked, so `npx vercel deploy --prod` publishes it. Environment variables are set in the Vercel project settings.

**Checks:** `npm run typecheck`, `npm run build`.

**Generated assets** (need `SARVAM_API_KEY`, cost a few rupees):
- `node scripts/gen-tutorial.mjs [--dry-run]` — spoken tutorial in `public/tutorial/`
- `npx tsx --env-file=.env scripts/gen-prompts.ts [--dry-run]` — recorded system messages in `public/audio/`
- `ml/wakeword` — wake-word training (see its README)

## 9. Where things are

```
api/                 Vercel serverless functions
server/              handlers.ts (keys, Gemini token, Jev proxy) + dev.ts (local Express)
src/App.tsx          the app: start flow, loop, controls
src/vision/          detector (YOLO26), distance, track, hazards
src/reflex/          vibration engine and patterns
src/router/          announcer, rule replies, voice intents, Jev router
src/handlers/        Gemini Live session
src/camera/          camera and flashlight
src/wake/            Hey Netra
src/audio/, speech/  recorded prompts, tutorial, speech helpers
src/i18n/            all spoken text, English and Hindi
public/              PWA files, models, recorded audio, service worker
scripts/             build helpers, audio generators, Jev calibration test
tests/               stored results of the Jev calibration test
docs/                stage notes, Jev calibration, and the stick/ESP32 plan (see docs/README.md)
prompts.md           the prompts used to build Netra (edited for clarity)
ml/                  detector export benchmarks and wake-word training
```

All tunables (distance, track shape, vibration timing, flashlight thresholds, detector speed limit) are in `src/config.ts`. Several are owner decisions to confirm after field tests: `detector.maxFrameMs`, `torch.*`, `path.track`.
