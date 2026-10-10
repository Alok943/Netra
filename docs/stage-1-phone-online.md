# Stage 1: Phone online, implementation instructions

**Goal:** Netra runs on a real Android phone from a public HTTPS URL. It uses YOLO26n for detection, the API is protected by a passcode, and the app installs to the home screen and keeps detecting offline.

**Done when:** every check in [section 8](#8-phone-test-protocol) passes on the test phone, the numbers are recorded, and the work is committed and pushed. Nothing is committed before that.

---

## 0. Rules for whoever implements this

1. **Do not change locked decisions.** Detector: YOLO26n. Backend: Node and TypeScript on Vercel. Live model: `gemini-3.8-live`. Target: Chrome on Android with earphones. If something forces a change, stop and ask the project owner.
2. **No secrets in frontend code or in git.** API keys stay in `.env` (gitignored) and in Vercel environment variables. The passcode is never put in a URL.
3. **Danger alerts never use audio or the network.** Do not route vibration through any API.
4. **Keep interfaces stable.** `loadDetector()` and `detect(video)` in `src/vision/detector.ts` keep their signatures and return shape, so `distance.ts`, `reflexEngine.ts` and `App.tsx` don't change for the detector swap.
5. **Commit only when the whole stage works on the phone** (step 9). Use Vercel CLI preview deploys until then.
6. **Out of scope for this stage:** Gemini Live client, wake word, router wiring, gestures, history and day summary storage, and the stick. Don't start them.

---

## 1. Prerequisites

| Need | Detail |
| --- | --- |
| Node | 22.x (the project was built on 22.18) |
| Python | 3.10+ with `pip`, used only to export the YOLO26 model |
| Vercel account | Hobby is fine for the private MVP. It must move to Pro before any commercial use. |
| Android phone | Chrome, wired or Bluetooth earphones, vibration enabled in system settings |
| `.env` | Already has `GEMINI_API_KEY`, `TYPESAFE_API_KEY` and `GEMINI_LIVE_MODEL=gemini-3.8-live` |
| Repo | `origin` = https://github.com/Alok943/Netra.git (empty; nothing pushed yet) |

Start of every work session:

```bash
cd C:\Users\aloks\Desktop\Netra
npm install
npm run dev
```

`npm run dev` starts the API on port 8787 and Vite on https://localhost:5173.

---

## 2. Task A: gate the API with a passcode and rate limit

**Why:** once deployed, anyone who finds the URL could mint Gemini tokens and call Jev on our bill.

### A1. New secret

- Add `NETRA_APP_PASSCODE=` to `.env.example` with a comment: "shared app passcode, at least 12 random characters".
- Add a real value to `.env`. Never commit it.

### A2. Server side (`server/handlers.ts`)

Add an access check used by the gated endpoints.

- **Input:** the value of the `x-netra-key` request header and the client IP.
- **Missing passcode env var:** respond 500 `{ error: "NETRA_APP_PASSCODE not configured" }`. Never fail open.
- **Wrong or missing header:** respond 401 `{ error: "unauthorized" }`.
- **Comparison:** constant-time, using Node's `crypto.timingSafeEqual` on equal-length buffers. If the lengths differ, it's a mismatch.
- **Rate limit:** an in-memory map from IP to recent request timestamps, with a sliding 60-second window.
  - `gemini-token`: max 10 per minute per IP
  - `jev`: max 60 per minute per IP
  - Over the limit: 429 `{ error: "rate_limited" }`
  - Note in a comment that on Vercel this map is per function instance. That's good enough for the MVP.
- **Client IP:** use the first entry of `x-forwarded-for` (Vercel sets it), falling back to the socket address. In Express use `req.ip`.

Endpoints after this task:

| Endpoint | Method | Gated | Behaviour |
| --- | --- | --- | --- |
| `/api/health` | GET | No | Unchanged. Shows whether the keys are configured, never the values. |
| `/api/verify` | POST | Yes | **New.** Returns `{ ok: true }` if the passcode is valid. Used by the setup screen. |
| `/api/gemini-token` | POST | Yes, 10/min | Unchanged otherwise |
| `/api/jev` | POST | Yes, 60/min | Unchanged otherwise |

Wire this in both places:

- `server/dev.ts`: the Express routes.
- `api/verify.ts` (new), `api/gemini-token.ts` and `api/jev.ts`: the Vercel functions. Read the header from `req.headers["x-netra-key"]`.

### A3. Client side

- **New file `src/device/passcode.ts`:** get, set and clear the passcode in `localStorage` under the key `netra.passcode`. Wrap every storage access in try/catch and treat failures as "no passcode".
- **New helper `apiFetch(path, init)`** in the same file or `src/api.ts`. It adds the `x-netra-key` header to every `/api/*` call.
- **Use `apiFetch` everywhere** `/api/` is called:
  - `route()` in `src/router/router.ts` (the call to `/api/jev`)
  - `fetchEphemeralToken()` in `src/handlers/geminiLive.ts`
- **Setup screen** in `App.tsx`, shown instead of the Start button when no passcode is stored:
  - Speak on show: "Netra needs a one-time setup. Please ask a sighted helper."
  - One large password-type input labelled "App passcode" and one large "Save" button, using the existing high-contrast styles.
  - On Save, call `/api/verify`. If it returns 200, store the passcode, announce "Setup complete", and show the Start button. If it returns 401, announce "Wrong passcode, try again" and keep the screen.
- **Losing access:** if any later API call returns 401, clear the stored passcode and return to the setup screen with a spoken message.

**Acceptance for Task A:**

- `curl -k -X POST https://localhost:5173/api/verify` returns 401.
- The same request with the correct `x-netra-key` header returns 200.
- 11 quick token requests: the 11th returns 429.
- The setup screen appears on first load, accepts the right passcode, and is not shown again after a reload.

---

## 3. Task B: export YOLO26n to ONNX (one-time, Python)

Do this outside `src/`. Create `ml/export/` and keep a `README.md` there recording the exact commands and versions used.

1. Create a Python virtual environment in `ml/.venv` and add `ml/.venv/` to `.gitignore`.
2. `pip install ultralytics onnx`
3. Export YOLO26n to ONNX at **imgsz 320**, batch 1, static shape. Follow the export section of the [YOLO26 docs](https://docs.ultralytics.com/models/yolo26/).
   - Prefer the **end-to-end, NMS-free** output if the export offers it.
   - Try FP16 for a smaller file. If WebGPU gives wrong results with FP16, use FP32.
4. Open the `.onnx` file in [Netron](https://netron.app) and record in `ml/export/README.md`:
   - the input name and shape (expected `[1, 3, 320, 320]`)
   - the output name and shape. It is one of:
     - **End-to-end:** `[1, N, 6]` (N is often 300). Each row is `x1, y1, x2, y2, score, class_id` in 320-px letterbox coordinates.
     - **Raw (needs NMS):** `[1, 84, 2100]`. That's 4 box values (`cx, cy, w, h`) plus 80 class scores for each of 2100 anchors.
5. Copy the model to `public/models/yolo26n-320.onnx`. Commit it with the stage; it is a few MB.
6. Record the Ultralytics and ONNX versions, the file size, and the output format in `ml/export/README.md`.

**Licence note:** YOLO26 is AGPL-3.0 until the Ultralytics licence is bought. Keep the deployment passcode-protected and private until then.

---

## 4. Task C: swap COCO-SSD for YOLO26n in the browser

### C1. Dependencies

- Remove `@tensorflow/tfjs` and `@tensorflow-models/coco-ssd`.
- Add `onnxruntime-web`. Use the WebGPU-capable bundle, imported as documented by ONNX Runtime Web for the installed version.
- **Offline WASM files:** ONNX Runtime Web loads `.wasm` (and `.mjs`) files at runtime, and they must be served from our own origin.
  - Add a small Node script `scripts/copy-ort.mjs` that copies those files from `node_modules/onnxruntime-web/dist/` to `public/ort/`.
  - Run it from `predev` and `prebuild` npm scripts.
  - Add `public/ort/` to `.gitignore`.
  - Set `ort.env.wasm.wasmPaths = "/ort/"` before creating the session.

### C2. Config (`src/config.ts`)

- Replace `detector.base` with:
  - `modelUrl: "/models/yolo26n-320.onnx"`
  - `inputSize: 320`
  - `nmsIou: 0.45`, used only for the raw output format
- Keep `minScore: 0.5` and `maxBoxes: 15`.

### C3. Labels

- **New file `src/vision/cocoLabels.ts`:** the 80 COCO class names in Ultralytics order, index 0 = `person`.
- These strings must match the keys in `HEIGHT_PRIOR_M` in `src/vision/distance.ts`: `tv`, `dining table`, `potted plant`, `fire hydrant`, `stop sign`, `parking meter`, and so on. Check every key in that map exists in the label list, and fix any mismatch in `distance.ts`.

### C4. `src/vision/detector.ts`

Rewrite the internals, keeping the exported signatures.

**`loadDetector()`:**
- Create an ONNX Runtime inference session from `CONFIG.detector.modelUrl`.
- Execution providers in order: `webgpu`, then `wasm`.
- Graph optimisation level: `all`.
- Record which provider actually loaded and expose it with a `detectorBackend()` getter, so the debug bar can show it.
- Run one warm-up inference on a blank 320 × 320 input so the first real frame isn't slow.
- Only load once (keep the current early-return guard).

**`detect(video)`:**

1. **Letterbox:**
   - `scale = min(320 / videoWidth, 320 / videoHeight)`
   - Draw the frame scaled into a reusable 320 × 320 canvas, centred, on a grey (114, 114, 114) background.
   - Remember `padX`, `padY` and `scale`.
   - Create the canvas and the `Float32Array(1*3*320*320)` input buffer once and reuse them every frame. No per-frame allocations.
2. **To tensor:** read pixels with `getImageData`, convert to planar NCHW RGB float32 in 0–1.
3. **Run** the session.
4. **Post-process**, depending on the output recorded in Task B:
   - **End-to-end `[1, N, 6]`:** keep rows with `score ≥ minScore`.
   - **Raw `[1, 84, 2100]`:**
     - For each anchor, take the highest class score.
     - Keep it if `≥ minScore`.
     - Convert `cx, cy, w, h` to corners.
     - Run per-class NMS with `nmsIou`.
5. **Back to video pixels:** `x = (x1 - padX) / scale`, `y = (y1 - padY) / scale`, `w = (x2 - x1) / scale`, `h = (y2 - y1) / scale`. Clamp to the frame.
6. **Return** at most `maxBoxes` results, highest score first, as `{ label, score, bbox: [x, y, w, h] }`.

If WebGPU fails at runtime, recreate the session on `wasm` once and carry on. Log the failure; don't retry in a loop.

### C5. Debug bar (`App.tsx`)

Show the detector backend (`webgpu` or `wasm`) next to the fps. Nothing else in `App.tsx` changes for this task.

### C6. Service worker (`public/sw.js`)

- Bump `VERSION` to `netra-v2` so old caches are dropped.
- Add cache-first handling for paths starting with `/models/` and `/ort/`.
- Pre-cache `/models/yolo26n-320.onnx` in the `install` step so the first offline launch works.
- `storage.googleapis.com` in `MODEL_HOSTS` is no longer needed. Remove it.

**Acceptance for Task C:**

- `npm run typecheck` and `npm run build` pass.
- In desktop Chrome at https://localhost:5173, boxes line up with objects and the labels are correct.
- The debug bar shows `webgpu` (or `wasm` on machines without WebGPU).
- Walking toward the laptop camera triggers the same near and very-near behaviour as before.

---

## 5. Task D: build check

- Set `buildCommand` in `vercel.json` to `npm run build`, so the `prebuild` ORT copy and the type checks run on Vercel.
- `npm run build` must pass locally with no type errors.
- `npm run preview` must serve the built app. Check that the service worker registers in production mode (DevTools → Application → Service workers).

---

## 6. Task E: deploy with the Vercel CLI (no git needed yet)

```bash
npx vercel login
```
```bash
npx vercel link
```
When `link` asks, create a new project named `netra` in your account. Framework: Vite.

Add each environment variable for **Production** and **Preview**. The CLI prompts for the value; paste it there, never on the command line:

```bash
npx vercel env add GEMINI_API_KEY
```
```bash
npx vercel env add TYPESAFE_API_KEY
```
```bash
npx vercel env add GEMINI_LIVE_MODEL
```
```bash
npx vercel env add NETRA_APP_PASSCODE
```

Deploy a preview and test it (sections 7–8):

```bash
npx vercel
```

When the preview passes, promote it to production:

```bash
npx vercel --prod
```

**Known risk:** the functions in `api/` import `../server/handlers.js`. If Vercel reports "module not found" for it:
- move `server/handlers.ts` to `api/_lib/handlers.ts` (Vercel doesn't turn underscore folders into routes)
- update imports in `api/*.ts` and `server/dev.ts`
- redeploy

Remove `.vercel/` from anything you commit; it's already in `.gitignore`.

---

## 7. Backend checks on the deployed URL

| Check | Expected |
| --- | --- |
| `GET /api/health` | `ok: true`, `geminiKey: true`, `typesafeKey: true`, `liveModel: "gemini-3.8-live"` |
| `POST /api/verify` with no header | 401 |
| `POST /api/verify` with the right header | 200 |
| `POST /api/gemini-token` with the right header | 200 with a `token` (don't paste it anywhere) |
| 11 token requests in a minute | The 11th returns 429 |

---

## 8. Phone test protocol

Use the production URL on the Android phone, in Chrome, with earphones in. Hold the phone at chest height, camera forward, as a stand-in for the stick camera.

| # | Check | Pass when |
| --- | --- | --- |
| 1 | First load | The setup screen speaks; the passcode is accepted; Start appears |
| 2 | Start | Camera permission prompt appears; on allow, speech says "Netra is ready" through the earphones |
| 3 | Detection | With debug on, boxes match real objects (person, chair, bottle) |
| 4 | Backend | The debug bar shows `webgpu` or `wasm`; note which |
| 5 | Near | Walking toward a chair gives a yellow border and two short taps, repeating |
| 6 | Very near | Closer still gives a red border, a rapid buzz, and any speech stops |
| 7 | No false buzz | Standing still with nothing in the path in front for 30 s: no vibration |
| 8 | Quiet mode | Toggle on: no proactive speech. Vibration still works. |
| 9 | Screen stays on | 3 minutes without touching: the screen doesn't sleep |
| 10 | Install | Chrome menu → Add to Home Screen; the icon launches full-screen |
| 11 | Offline | After one online launch, airplane mode → open from the icon → detection and vibration still work |
| 12 | Distance check | Chair at a measured 1 m, then 2 m: the debug distance is within ±0.5 m. If it's consistently off, adjust `camera.fovLongSideDeg` in `src/config.ts` and note the value. |

Any failure: fix it, redeploy a preview, and repeat the whole table.

---

## 9. Record results, then commit

Create `docs/stage-1-results.md` with:

- phone model, Android version, Chrome version
- detector backend (`webgpu` or `wasm`) and the fps range seen
- the distance check (actual vs shown at 1 m and 2 m) and the final `fovLongSideDeg`
- any check that needed a workaround

Then commit and push:

```bash
git status
```
Confirm `.env`, `.vercel/`, `public/ort/` and `ml/.venv/` are **not** listed.

```bash
git add -A
```
```bash
git commit -m "Stage 1: phone online with YOLO26n detection and gated API"
```
```bash
git push -u origin main
```

Finally, in the Vercel dashboard, connect the project to the GitHub repo `Alok943/Netra`, so later pushes to `main` deploy automatically.

---

## 10. After Stage 1 (not now)

These are recorded so nobody starts them early:

- **Stage 2, hands-free voice:** Gemini Live client, "Hey Netra" wake word, whole-screen gestures, earphone button, router wiring, currency, bus numbers and labels.
- **History and day summary:** comes after the MVP works. Storage will be SQLite or Supabase, and the owner decides which. A plain SQLite file can't persist on Vercel's serverless functions, so the SQLite option means a hosted service such as Turso.
- **Stages 3–6:** see the roadmap in the status doc.

## Related docs

- Status, decisions and roadmap: https://claude.ai/code/artifact/234bb5a3-169c-414b-8cf0-c688610c8674
- Smart stick, camera, detection, wake word: https://claude.ai/code/artifact/6f99e50e-c365-4625-a0ce-bd18476931c7
- Gemini Live model choice and hands-free design: https://claude.ai/code/artifact/1c886798-e683-4b58-9df0-94d445cb0f0b
