# Jev calibration test

**Question:** when YOLO is unsure about an object, how confident is Jev, and does that decide whether Netra opens Gemini?

**Method:** 60 router states were sent to the real Jev API (`jev-latest`, reported as `jev-1.13.0`) exactly as the app sends them: the state as a JSON string plus the same questions (`src/router/router.ts`). Each answer was run through the app's own `parseJevResponse`, so "what the app would do" is computed by the real code.

- Script: `scripts/jev-calibration.ts` (`npx tsx --env-file=.env scripts/jev-calibration.ts`; add `--dry-run` to list the cases)
- Every input and output: `tests/jev-calibration/results.json` (state sent, raw Jev answer, tokens used, latency, and the app's decision)
- Run on 2026-10-10 from the laptop, calling TypeSafe directly (no Vercel hop). The phone path adds the phone-to-Vercel round trip.

## How to read Jev's numbers

Jev returns `probabilities` for the two options and a `confidence`. In all 60 cases `confidence` equals the **gap between the two probabilities** (for example 0.94 vs 0.06 gives 0.88). So the app's threshold `confidence > 0.8` really means "the winner has at least about 90 percent probability".

`speak_now` (`noul`) is a separate 0 to 1 number. The app speaks only if it is above 0.8.

## Results

| Group | Cases | Jev choice | Confidence (gap) | `speak_now` | Would open Gemini |
| --- | --- | --- | --- | --- | --- |
| A. One unsure object in the path (the real trigger) | 16 | `rule_reply` every time | 0.74 to 0.92 (14 of 16 above 0.8) | 0.35 to 0.67 | **0** |
| B. Same chair, YOLO confidence 0.30 to 0.49 | 5 | `rule_reply` | 0.88 to 0.90 | 0.47 to 0.52 | **0** |
| C. Odd objects (toothbrush, hair dryer, ...) | 8 | `rule_reply` | 0.88 to 0.92 | 0.38 to 0.61 | **0** |
| D. Busier scenes with one unsure object | 4 | `rule_reply` | 0.80 to 0.86 | 0.44 to 0.69 | **0** |
| E. Hindi, and previous route `rule_reply` / `gemini_live` | 4 | `rule_reply` | 0.60 to 0.94 | 0.46 to 0.49 | **0** |
| F. Scene change / text region triggers | 4 | mixed | 0.10 to 0.84 | 0.22 to 0.69 | 0 |
| G. Spoken questions (for contrast) | 13 | 6 `gemini_live` | 0.08 to 1.00 | 0.52 to 0.83 | 5 |
| H. Same input repeated | 6 | stable | within 0.02 | within 0.04 | 2 (the "read" question) |

- **Latency:** 305 to 614 ms, median 335, 90th percentile 360. All 60 were inside the app's 1.5 s budget. Each call used about 400 input and 55 output tokens.

## What this shows

1. **For an unsure object, Jev never chose Gemini.** Across all 37 unsure-object cases it picked `rule_reply`, with high confidence in 33. So the automatic Gemini sessions you worried about did **not** come from this path in these tests.
2. **Jev ignores the detector's confidence and the object type.** A chair at 0.30 and at 0.49 got the same answer (0.88 to 0.90). Toothbrush and bus got the same. The numbers in the state have almost no effect.
3. **The low-confidence cases are not the ones expected.** Confidence was below 0.8 for:
   - "is it safe to cross" (0.08) and "can I go to the right" (0.14), where the two options were nearly even;
   - "describe the scene" (0.36), which Jev routed to `rule_reply` with low confidence;
   - a scene change with nothing detected (0.10) and a text region (0.32), even when the state said a text region was detected;
   - "kitni door hai" (0.66) and a chair when the last route was `gemini_live` (0.60).
4. **`speak_now` blocks every unsure-object announcement.** For the unsure-object cases `speak_now` was at most 0.69, below the 0.8 gate, so `speakNow` came out false in all 37. In `describeUnsure` that means the function returns early and **says nothing**. When Jev answers, Netra stays silent about unsure objects; it only speaks the "possibly a chair" sentence if Jev is down or times out and the keyword fallback runs. I believe this is not what was intended.
5. **Clear Gemini cases are real questions**: "read this note" (0.94), "what does the sign say" (0.98), Hindi note and "padh ke batao" (0.94 to 0.96).
6. **Results are stable.** Identical inputs repeated three times differed by at most 0.02.

## Decisions for the owner (not changed in code)

| Option | Effect |
| --- | --- |
| **1. Drop Jev from the unsure-object path.** Always speak the on-device "possibly a ..." sentence. | Saves a network call per unsure object. Fixes the silent-drop problem. Same Gemini cost as today (zero from this path). |
| **2. Keep Jev but do not let `speak_now` silence the sentence.** Use Jev only to decide whether to open Gemini. | Jev stays in the design, announcements work, and the Gemini gate is still confidence above 0.8. |
| **3. Keep everything as is.** | Unsure objects are silent when Jev answers. |

Recommendation: option 2 if Jev must stay in the story, otherwise option 1. Either way, if cost is the goal, note that this path never opens Gemini in these tests: tap-to-talk with a "read/describe" word, and Hey Netra, are where Gemini sessions come from.

## Limits of this test

- The states are synthetic. Real walking will produce other combinations (several detections, more labels).
- Sixty calls is enough to see the pattern, not to give exact rates.
- The app, not this script, decides what Jev's answer leads to; the "would open Gemini" column uses the app's own parsing code, but not the full runtime conditions (Quiet mode, an open session, offline, Help me walk).
