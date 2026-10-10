"""Which held-out clips cause false triggers? Retrains the held-out model from cached features and scores each clip."""
import glob, os, sys

import numpy as np
import torch

import train as T

pos = sorted(glob.glob(os.path.join(T.DATA, "pos", "*.wav")))
neg = sorted(glob.glob(os.path.join(T.DATA, "neg", "*.wav")))
held_neg = [p for p in neg if T.is_held_out(p)]
d = np.load(os.path.join(T.OUT, "feat_train.npz"))
model = T.train_head(d["X"], d["y"])
torch.save(model.state_dict(), os.path.join(T.OUT, "heldout.pt"))

rnd = np.random.default_rng(5)
rows = []
for p in held_neg:
    clip = T.load(p)
    canvas = np.zeros(T.SR * 4, dtype=np.float32)
    seg = clip[: T.SR * 3]
    canvas[T.SR // 2 : T.SR // 2 + len(seg)] = seg
    canvas = T.mix(canvas, T.noise_like("pink", len(canvas), rnd), 15)
    e = T.embed(np.clip(canvas, -32768, 32767).astype(np.int16))
    X = np.array([e[j - 15 : j + 1] for j in range(15, len(e))], dtype=np.float32)
    with torch.no_grad():
        s = model(torch.tensor(X)).numpy().ravel()
    rows.append((float(s.max()), os.path.basename(p)))
rows.sort(reverse=True)
n_hi = sum(1 for r in rows if r[0] >= 0.7)
print(f"{n_hi} of {len(rows)} held-out negative clips reach 0.7")
for sc, name in rows[:25]:
    print(f"{sc:.2f}  {name}")
near = [r for r in rows if any(k in r[1] for k in ("hey_", "hi_", "okay", "netra", "hello", "ao_", "are_", "o_bh", "namaste", "sunie"))]
print("near-miss-like clips reaching 0.7:", sum(1 for r in near if r[0] >= 0.7), "of", len(near))
