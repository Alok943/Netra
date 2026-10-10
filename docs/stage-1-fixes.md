# Stage 1 fixes: instructions

**Source:** the bug list in the Stage 1 review, https://claude.ai/code/artifact/fbd463e2-7ea8-4622-9d2a-10a39fb7fefd

**Goal:** fix the bugs found in code review before the Stage 1 phone test. Each fix lists the files, what to change, and how to prove it works.

**Order:** do Fix 1 → 6 in sequence. Run `npm run typecheck` after each. Don't commit; the first commit still comes after the full phone test (stage doc, section 9).

---

## Rules (same as the stage doc)

- **Don't change locked decisions.** That covers: YOLO26, Node on Vercel, `gemini-3.8-live`, Android Chrome, danger alerts haptic-only and offline.
- **Values marked OWNER DECIDES** are placeholders. Build them as config values, use the suggested default, and list them in `docs/stage-1-results.md` for the owner to confirm. Don't invent other thresholds.
- **Stay in scope.** Bug 4 (access gate) and the download-size strategy in Fix 6b are not part of this document; leave them.

---

## Fix 1: Gemini Live API version (high)

**Problem:** the browser connects with API version `v1alpha` (`src/handlers/geminiLive.ts`, line 87). Google's ephemeral-token docs (https://ai.google.dev/gemini-api/docs/ephemeral-tokens) say these tokens work only with the Live API on **`v1beta`**. The server (`server/handlers.ts`, line 88) creates the token with the SDK default and no explicit version. A mismatch can make every voice session fail to connect.

**Change:**

1. In `server/handlers.ts`, create the `GoogleGenAI` client with an explicit API version of `v1beta` (via `httpOptions`).
2. In `src/handlers/geminiLive.ts`, use the same `v1beta` when creating the client from the token.
3. Put the version in one shared constant, so the two can't drift:
   - add `liveApiVersion: "v1beta"` to `src/config.ts`
   - add a same-named constant in `server/handlers.ts` with a comment pointing at the other
4. Update the comment at the top of `geminiLive.ts` (line 6), which still says `v1alpha`.

**Verify:**

- On the laptop (`npm run dev`, desktop Chrome), start Netra, tap to talk, ask "what is in front of me?". A spoken answer must come back.
- If it fails on `v1beta` but works on `v1alpha`, keep whichever works on **both** sides. Record the exact error and the version used in `docs/stage-1-results.md`.

---

## Fix 2: camera recovery after screen lock or app switch (high, safety)

**Problem:** Android stops the camera when the screen locks or the user switches apps. Nothing in the app notices. When the user returns, the video can stay frozen, detection stops silently, and **no danger vibration fires** while the app looks like it's running.

**Files:**

- `src/camera/camera.ts`
- `src/App.tsx`
- `src/i18n/strings.ts` (new spoken lines)
- `src/reflex/haptics.ts` (one new pattern)

**Change:**

1. **Detect camera loss.** In `startCamera`, add an optional `onLost` callback parameter. Call it when the video track fires `ended` or `mute`. (Android may mute rather than end the track when the page is hidden.)
2. **Watchdog in the detection loop** (`App.tsx`, `loop`):
   - Track the time of the last *new* frame using the video's `currentTime` or `requestVideoFrameCallback` where available.
   - Add `camera.stallMs: 2000` to `CONFIG`.
   - If no new frame arrives for `stallMs` while running, treat the camera as lost.
3. **When lost:**
   - Vibrate a new, distinct pattern `camera_lost`, for example three long pulses. Add it to `PATTERNS` in `haptics.ts`. It must be clearly different from `near` and `very_near`.
   - Speak "Camera stopped. Restarting." (English and Hindi in `strings.ts`).
   - Stop the old stream, then call `startCamera` again with the same `untilGranted` wrapper used in `start()`.
   - On success, speak "Camera back." and continue the existing loop. Don't start a second loop: the `loopIdRef` logic must still allow only one.
4. **When the page becomes visible again** (`visibilitychange` to visible) while running: run the same check immediately instead of waiting 2 s.
5. **Danger state:** while the camera is lost, call `reflexRef.current.stop()` so an old danger buzz doesn't keep repeating from stale detections.

**Verify (phone):**

- Running → lock the screen 10 s → unlock. Within about 3 s Netra says "Camera back" and boxes move again. Walking at a chair still buzzes.
- Running → switch to another app 10 s → back. Same result.
- Cover the lens with a finger. That must **not** trigger "Camera stopped", because frames still arrive, just dark.

---

## Fix 3: fall back to the small model on slow GPUs (high, safety)

**Problem:** `loadDetector()` (`src/vision/detector.ts`) chooses YOLO26s-416 whenever `navigator.gpu` exists. A budget phone GPU can run it far slower than the laptop's 53 ms per frame. Low fps delays danger vibration.

**OWNER DECIDES:** the slowest acceptable frame time. Build it as `CONFIG.detector.maxFrameMs`, default **150** (about 6–7 fps), and flag it in the results file.

**Change:**

1. In `loadDetector()`, after the WebGPU YOLO26s session warms up, time **5 extra warm-up runs**. Use the median, not the mean.
2. If the median is above `maxFrameMs`:
   - Discard that session.
   - Create a YOLO26n session on **WebGPU first**, using `/models/yolo26n-416.onnx` at 416. YOLO26n on the GPU is likely the best middle option.
   - Time it the same way. If it is still above `maxFrameMs`, fall back to YOLO26n on WASM.
3. **Expose the result** as a string from `detectorBackend()`, e.g. `webgpu·s416`, `webgpu·n416`, `wasm·n416`. The debug bar already shows `detectorBackend()`.
4. **Cache the decision** in `localStorage` (key `netra.detector`, with the app version), so later starts load the right model directly without re-benchmarking. Wrap storage in try/catch.
5. **Don't download YOLO26s at all** when the cached decision says it was too slow.
6. Add `models.webgpuSmall: { url: "/models/yolo26n-416.onnx", inputSize: 416 }` to `CONFIG.detector.models`, and use it for step 2. Remember that `prepareBuffers` must be called with the input size of whichever model is finally kept.

**Verify:**

- Desktop: temporarily set `maxFrameMs: 1`. The debug bar must show `wasm·n416` and detection still works. Restore the value.
- Phone: record which model was chosen, and its median ms, in the results file.

---

## Fix 4: `.gitignore` hides `.env.example` (medium)

**Problem:** the last lines of `.gitignore` add `.env*` (and a second `.vercel`). The `.env*` line overrides the earlier `!.env.example`, so the example file would never be committed.

**Change:** delete the trailing `.env*` and the duplicate `.vercel` lines at the end of `.gitignore`. Keep the earlier block (`.env`, `.env.*`, `!.env.example`).

**Verify:**

- `git check-ignore -v .env.example` prints nothing.
- `git check-ignore -v .env` still shows it is ignored.

---

## Fix 5: Gemini Live error from an old session (medium)

**Problem:** in `src/handlers/geminiLive.ts`, the `onerror` callback stops whatever session is current. If an old session errors after a new one has started, it closes the new one. `onclose` already guards with the session generation; `onerror` doesn't.

**Change:**

- In `onerror`, only report and stop when the callback's generation equals `this.generation`, the same check `onclose` uses.
- Errors from an old session are logged with `console.warn` and otherwise ignored.

**Verify:** start a voice session, stop it, start another straight away. The second session must not close by itself.

---

## Fix 6: ONNX Runtime files deployed twice (medium)

**Problem:**

- `scripts/copy-ort.mjs` copies **all 8** ONNX Runtime `.mjs`/`.wasm` variants into `public/ort/`, and all of them are deployed.
- The Vite build also emits a 28 MB `ort-wasm-simd-threaded.jsep*.wasm` into `dist/assets/`.
- At runtime `wasmPaths = "/ort/"`, so the copy in `/assets/` is probably never used. This makes the deploy much bigger and confuses caching.

**6a. Change:**

1. On the laptop with `npm run preview`, and on the phone (Chrome remote debugging, Network tab), record **exactly which** ORT files load for WebGPU and for WASM.
2. Change `copy-ort.mjs` to copy **only those files**.
3. Stop Vite from emitting the unused bundled WASM. Either:
   - (a) import ONNX Runtime from the entry point that doesn't bundle its WASM URL (check the `exports` in `node_modules/onnxruntime-web/package.json` for this version), or
   - (b) drop `wasmPaths` and `/ort/` entirely and use the files Vite emits.

   Pick one: whichever keeps dev (`npm run dev`) and production both working. Then remove whatever becomes unused (`vite-ort-plugin.ts`, the copy script).
4. The service worker caching rules must match the path you keep (`/ort/` or `/assets/`).

**Verify:**

- After `npm run build`, there is exactly **one** copy of each ORT file the app uses: in `dist/ort/` **or** in `dist/assets/`, not both.
- Detection works in dev and in preview, on WebGPU and WASM.
- Airplane-mode start still works after one online launch.

**6b. Not in scope (OWNER DECIDES later):** reducing the roughly 66 MB first download. Fix 3 step 5 already avoids YOLO26s on slow phones. Further options, such as background precache after install or starting all phones on YOLO26n, wait for the owner.

---

## Not fixed here (known, accepted for now)

| Item | Status |
| --- | --- |
| Bug 4: no access gate on `/api/gemini-token` | Keep the deployed URL private. The owner decides on a gate or spending cap before sharing it. |
| Bug 8: welcome speech is silent until the first touch | Browser rule. A possible zero-tap Android wrapper is an open owner decision. |
| Bug 9: "Hey Netra" beeps and battery use | Off by default; note results in phone check 15. |

---

## Add to the phone test (stage doc, section 8)

| # | Check | Pass when |
| --- | --- | --- |
| 18 | Screen lock recovery | Lock 10 s, unlock: "Camera back" within about 3 s; detection and vibration work |
| 19 | App switch recovery | Another app for 10 s, return: same as check 18 |
| 20 | Model choice | The debug bar shows the chosen model, e.g. `webgpu·n416`; record it and its median ms |
| 21 | Voice connects | Tap to talk gets a spoken answer (proves Fix 1 on the phone) |

## Done when

- [ ] Fixes 1–6a are in and `npm run build` passes
- [ ] Each fix's verify steps pass on the laptop
- [ ] Phone checks 18–21 pass alongside checks 1–17
- [ ] `docs/stage-1-results.md` lists `maxFrameMs` and the chosen model for the owner to confirm
