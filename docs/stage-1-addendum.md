# Stage 1 addendum: scope changes (2026-10-10)

The owner moved these items into Stage 1, so they are built and shipped before the first deploy:

| Change | What was built |
| --- | --- |
| Load time announcement | First start says it can take up to a minute; later starts say the measured time from the last load. |
| Better detector | Adaptive: YOLO26s 416 on WebGPU, YOLO26n 416 on WASM. Numbers in `ml/export/BENCH.md`. |
| Gemini Live | `src/handlers/geminiLive.ts`: ephemeral token, mic to 16 kHz PCM, 24 kHz playback, 1 fps frames, 8 s follow-up window, danger interrupt. System prompt is locked in the token on the server. |
| Router wiring | New in-path objects go through `route()` (Jev, 1.5 s budget, keyword fallback). Only a confident Jev answer may open a Live session; otherwise the on-device rule reply speaks. Quiet mode and a very-near danger always win. |
| Wake word (MVP) | Picovoice ended its free plan (June 2026), so no trained wake word yet. `src/wake/speechWake.ts` is a simple "Hey Netra" using Chrome's speech recognition: a toggle in the debug bar, off by default, needs internet. Double-tap anywhere also starts a voice session. A trained on-device model (openWakeWord, voices generated with Sarvam TTS) is future scope. |
| Tap to talk | The big button now opens or closes a Live session; offline it falls back to the rule reply. |

New phone checks to add to section 8 of the stage doc:

| # | Check | Pass when |
| --- | --- | --- |
| 13 | Voice | Tap to talk, ask "what is in front of me?": a spoken answer through the earphones, then the session closes after about 8 s of silence |
| 14 | Danger over voice | While Netra is speaking, walk at a chair: the red border and buzz start and speech cuts off |
| 15 | Hey Netra | Turn on "hey netra" in the debug bar, say it: chime and tick, then ask a question without touching the phone. Note any phone sounds, battery drain or false triggers |
| 16 | Double tap | Double-tap an empty part of the screen: the chime, then a voice session |
| 17 | Offline voice | Airplane mode, tap to talk: the on-device description is spoken instead |

## Passcode removed (2026-10-10)

The owner removed the passcode gate (Task A of the stage doc), including the setup screen, `/api/verify` and `NETRA_APP_PASSCODE`.
Per-IP rate limits stay (`gemini-token` 10/min, `jev` 60/min). Without a login, anyone who finds a public URL can use the
Gemini and Jev keys up to those limits, so keep the deployed URL private (do not share it) until a gate is added back.

## Announcements, language and permissions (2026-10-10)

- **Language:** first start asks (by voice, or tap top half for English, bottom half for Hindi). Stored on the phone; a language button in the controls switches later. All spoken text, object names and the Live prompt follow it (`src/i18n/strings.ts`).
- **What gets announced** (`src/router/announcer.ts`): the TRACK decides. The yellow dashed lane on screen (`CONFIG.path.track`, `src/vision/track.ts`) is the walking path: an object whose base is inside it is announced when it enters (after 3 frames), again if it leaves and re-enters, or if it gets closer. Outside the track only a vehicle or large animal that is already close is announced. One thing per 4 s. The same track decides which objects can trigger vibration.
- **Unsure objects** (score 0.3 to 0.5): "possibly a chair, a medium-sized object on your left". They never trigger vibration. Jev may hand them to Gemini Live to look at the camera.
- **Very-near objects:** vibration only (locked rule). When the alert eases, Netra says "Just now: chair ahead, very close, less than a metre."
- **Crowds** (4+ people or 6+ objects): individual people are replaced by one summary ("Crowded around you. 5 people. Nearest: ...") at most every 15 s and a gap of 8 s; vehicles still speak up on their own.
- **Start:** tap anywhere on the screen. Browsers need one touch before they allow speech or vibration, and the first camera and microphone permission needs the standard Allow dialog.
- Functions run in Mumbai (`bom1`) to cut latency for India.

## What goes to Gemini, and when

| Trigger | Goes to | Notes |
| --- | --- | --- |
| Tap to talk, double-tap anywhere, "Hey Netra" | **Gemini Live, always** (online) | Opens a voice session: mic audio plus one camera frame per second while it is open; closes about 8 s after the answer. Offline: on-device description instead. The router is not asked. |
| Object enters the track, detector 50% or more sure | On-device sentence | Never Gemini. |
| Object enters the track, detector only 30 to 50% sure (online, no crowd) | **Jev decides** | Text-only state sent to Jev (about 0.5 s). If Jev answers "gemini_live" with over 80% confidence, a Gemini Live session opens about that object and looks at the camera. Otherwise, or if Jev is unsure, slow or down, the on-device sentence "possibly a bottle, a small object on your left". |
| Crowd summary | On-device sentence | Never Gemini. |
| Danger vibration, "Just now: ..." follow-up | On-device | Never Gemini; danger never uses the network. |
| Quiet mode on | Nothing proactive | Tap to talk still works. |

Jev only ever gets a small text state (labels, distances, flags), never images or audio. Gemini only gets audio and frames while a Live session is open.

## On-device "Hey Netra" (2026-10-10)

Picovoice ended its free plan, so the wake word is now our own model: openWakeWord's frozen feature models plus a small
classifier trained on Sarvam and Windows voices (`ml/wakeword`, results in its README). Files in `public/models/wake/`;
`src/wake/owwWake.ts` runs it on the shared microphone. The "hey netra" checkbox in the debug bar turns it on (off by
default); if the model files are missing the app falls back to the speech-recognition version. Tune
`public/models/wake/hey_netra.json` (threshold, consecutive windows, cooldown) using the "wake score" in the debug bar.
ONNX Runtime allows one model call at a time per page, so the detector and wake word share a queue (`src/vision/ortLock.ts`).

Phone checks to add: say "Hey Netra" from 0.5 m, 1 m and 2 m in a quiet room and in noise (note how many of 10 work);
speak normally for 5 minutes and count false triggers; try "Hey Nitra" and "Hey nature".

## Recorded system voice (2026-10-10)

Fixed messages ("Starting Netra", "Netra is ready", permissions, quiet mode, light, camera) are pre-recorded with Sarvam
(`bulbul:v3`, voice `shubh`) by `scripts/gen-prompts.ts` into `public/audio/` (about 2.4 MB, 52 files). They play through Web
Audio, queue so none is cut off, work offline once cached, and sound different from the phone's own voice, which is
used for object announcements. A recording is used only when its text matches `src/i18n/strings.ts`; after editing a
string, re-run `npx tsx --env-file=.env scripts/gen-prompts.ts` (it records only what changed, about Rs 3 per 1,000 characters).
To change the voice, edit `SPEAKER` in that script and delete `public/audio/manifest.json`.

Jev never produces speech: it returns only a routing choice and a speak/stay-quiet score from a small text summary.
Spoken output comes from (1) recordings for fixed messages, (2) the phone's voice for object descriptions, crowd
summaries and "Just now" follow-ups, and (3) Gemini Live's own voice in conversations.
