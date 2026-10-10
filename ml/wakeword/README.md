# "Hey Netra" wake word

A small on-device detector, trained from synthetic voices. No account or licence key is needed.

## How it works

openWakeWord's two frozen models turn audio into features, and we train only the last small classifier:

```
16 kHz audio -> melspectrogram.onnx -> embedding_model.onnx (96 numbers per 80 ms) -> hey_netra.onnx (last 16 embeddings -> score)
```

The browser runs the same chain with ONNX Runtime Web (`src/wake/owwWake.ts`).

## Data

| Source | What | Cost |
| --- | --- | --- |
| Sarvam `bulbul:v3` (`gen_sarvam.py`) | "Hey Netra" / "Hey Nethra" / "हे नेत्रा" in 37 voices; near-miss phrases ("Hey nature", "Hey Neha"...); about 115 hand-written sentences plus 140 composed sentences and short utterances, in English, Hindi and Hinglish | 12,110 characters in total, roughly Rs 36. A hard cap of 14,000 characters is built in. |
| Windows voices David and Zira (`gen_sapi.py`) | the same English phrases and sentences | free |

Clips go to `data/pos` and `data/neg` (git-ignored). `phrases.py` holds every phrase.

## Train

From `ml/wakeword`, with the venv at `../.venv`:

```bash
../.venv/Scripts/python gen_sarvam.py      # skips clips that already exist
../.venv/Scripts/python gen_sapi.py
../.venv/Scripts/python train.py --final   # features, training, held-out evaluation, export
```

`train.py` augments each clip (speed, level, reverb, noise, babble made from other clips), holds out several voices to
measure recall and false triggers per hour, then exports `out/hey_netra.onnx`. Copy the result to the app:

```bash
cp out/hey_netra.onnx ../../public/models/wake/
cp models/melspectrogram.onnx models/embedding_model.onnx ../../public/models/wake/
```

`public/models/wake/hey_netra.json` holds the threshold and cooldown; tune the threshold on the phone using the
"wake score" in the debug bar.

## Results (v2, 2026-10-10)

Trained on 161 positive and 515 negative clips; 36 positive and 183 negative clips from voices the model never saw were
held out for testing. Settings in the app: threshold 0.7, two consecutive 80 ms windows.

| Test | Result |
| --- | --- |
| "Hey Netra" from unseen voices (with noise, reverb) | triggers on 81% of clips at threshold 0.7 |
| Ordinary speech and noise (6.9 min, unseen voices) | 0 false triggers at 0.7 (8.7 per hour at 0.5) |
| Look-alike phrases ("Hey nature", "Hey Nitra", "Hey Neha") | still trigger often (about 25% of clips); expected, they sound alike |

The first version (fewer, less varied negatives) triggered about 200 times per hour on unseen speech, so more varied
negative data was the main fix. Both numbers come from a few minutes of synthetic voices, so treat them as rough.
Browser check: the same model, run through ONNX Runtime Web with a fake microphone playing "Hey Netra", scored 1.0 and
opened a voice session.

## Limits

- Trained on synthetic voices only. Record real "Hey Netra" clips from several people (phone mic, quiet and noisy) into
  `data/pos/real_<name>_<n>.wav` (16 kHz mono) and retrain: this is the biggest quality gain.
- The false-trigger estimate comes from a few minutes of held-out speech, so it is rough.
- Licences: openWakeWord code is Apache 2.0 and the two feature models come from its releases; check their terms for
  commercial use. Sarvam's terms prohibit using output to train competing models; a wake-word detector is not one, but
  check the current terms before shipping commercially.
