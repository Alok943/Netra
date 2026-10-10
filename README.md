# Netra

An always-on AI assistant for visually impaired users in India. It's a React PWA that runs in a phone browser, worn on the chest with the camera facing forward.

## Architecture

| Tier | What | Where | Status |
|---|---|---|---|
| 0 · Reflexes | YOLO26n (ONNX Runtime Web, WebGPU/WASM) detection → distance → vibration. Never audio, never an API. | `src/vision`, `src/reflex` | **Done (Phase 1)** |
| Router | Text-only state → TypeSafe Jev (`/api/jev`), keyword fallback | `src/router` | Stub + keyword fallback |
| Handler | Gemini Live voice + 1 fps frames during a query | `src/handlers/geminiLive.ts` | Stub + token endpoint |
| Cane | Web Bluetooth ultrasonic + motor | `src/cane/caneBluetooth.ts` | Stub |

Priority order: **danger (vibration) > user query > proactive info**. Quiet mode turns off proactive info.

```
api/            Vercel serverless functions (production)
server/         handlers.ts (shared logic, holds the keys) + dev.ts (local Express)
src/            React app
public/         manifest, service worker, icon
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`, `TYPESAFE_API_KEY` and `GEMINI_LIVE_MODEL`. `.env` is gitignored.
3. `npm run dev`. This starts the API on :8787 and Vite on https://localhost:5173, which proxies `/api` to the API.
4. Open https://localhost:5173/api/health. It should show `geminiKey: true` and `typesafeKey: true`.

After editing `.env`, restart `npm run dev`.

## Testing on your phone (same Wi-Fi)

Camera access needs HTTPS, so the dev server uses a self-signed certificate.

1. `npm run dev` prints a `Network:` URL, for example `https://192.168.x.x:5173`.
2. Open that URL in **Chrome on Android**. Accept the certificate warning (Advanced → Proceed).
3. Tap **Start Netra** and allow the camera. Walk toward a chair or a person:
   - **near** (yellow border): two short taps, repeating
   - **very near** (red border): rapid strong buzz. Speech stops.
4. **Tap to talk** describes the scene (offline rule reply for now).

If the phone can't connect, allow Node through Windows Firewall on private networks.

iPhone: Safari does not support `navigator.vibrate` or Web Bluetooth. Use Android for haptics.

## Deploy (Vercel)

```bash
npx vercel
```

Then add `GEMINI_API_KEY`, `TYPESAFE_API_KEY` and `GEMINI_LIVE_MODEL` under Project → Settings → Environment Variables, and redeploy. After that, open the HTTPS URL on your phone and choose **Add to Home Screen**.

## Tuning

Everything lives in `src/config.ts`: distance thresholds, the walking corridor, vibration repeat rates, and the camera field of view. Distances are rough pinhole estimates from per-class height priors (`src/vision/distance.ts`). Calibrate them by walking toward known objects.
