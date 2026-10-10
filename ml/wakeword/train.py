"""Train a small "Hey Netra" detector on top of openWakeWord's frozen feature models.

Pipeline (same as openWakeWord): 16 kHz audio -> melspectrogram.onnx -> embedding_model.onnx (one 96-d vector per 80 ms)
-> a small classifier over the last 16 embeddings (1.28 s). Only the classifier is trained here.

  python train.py            # build features (cached), train, evaluate on held-out speakers, export ONNX
"""
import os

for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")
import glob, json, random, sys, time
from multiprocessing import Pool

import numpy as np
import onnxruntime as ort
import scipy.signal as sig
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "out")
MODELS = os.path.join(HERE, "models")
SR = 16000
CANVAS = 3 * SR
HELD_OUT = ("kabir", "ritu", "ishita", "varun", "kavitha", "soham", "zira")
AUG_POS, AUG_NEG = 20, 8  # augmented copies per clip

# ---------------------------------------------------------------- audio helpers


def load(path):
    sr, x = wavfile.read(path)
    assert sr == SR, (path, sr)
    x = x.astype(np.float32)
    return x[:, 0] if x.ndim > 1 else x


def speech_bounds(x, floor_db=-42):
    """Start and end sample of the speech (energy above floor_db relative to the loudest 10 ms frame)."""
    hop = 160
    n = len(x) // hop
    if n == 0:
        return 0, len(x)
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-6
    thr = e.max() * 10 ** (floor_db / 20)
    idx = np.where(e > thr)[0]
    return int(idx[0] * hop), int((idx[-1] + 1) * hop)


def noise_like(kind, n, rnd):
    w = rnd.standard_normal(n).astype(np.float32)
    if kind == "white":
        return w
    spec = np.fft.rfft(w)
    f = np.maximum(np.arange(len(spec)), 1).astype(np.float32)
    spec = spec / (f ** (0.5 if kind == "pink" else 1.0))  # pink 1/f power, brown 1/f^2 power
    out = np.fft.irfft(spec, n).astype(np.float32)
    return out / (np.std(out) + 1e-6)


def reverb(x, rnd):
    t = np.arange(int(0.35 * SR)) / SR
    tau = rnd.uniform(0.03, 0.14)
    ir = (rnd.standard_normal(len(t)) * np.exp(-t / tau)).astype(np.float32)
    ir[0] = 1.0
    y = sig.fftconvolve(x, ir)[: len(x)]
    return y * (np.max(np.abs(x)) / (np.max(np.abs(y)) + 1e-6))


def mix(x, noise, snr_db):
    px = np.mean(x ** 2) + 1e-6
    pn = np.mean(noise ** 2) + 1e-6
    return x + noise * np.sqrt(px / (pn * 10 ** (snr_db / 10)))


def babble(pool, n, rnd):
    out = np.zeros(n, dtype=np.float32)
    for _ in range(rnd.integers(3, 6)):
        c = pool[rnd.integers(len(pool))]
        start = rnd.integers(0, max(1, len(c) - 1))
        seg = np.resize(np.roll(c, -start), n)
        out += seg * rnd.uniform(0.5, 1.0)
    return out


def make_canvas(clip, rnd, babble_pool, positive):
    """Place a clip in a 3 s canvas with random timing, level, speed, reverb and noise.
    Returns (audio int16, word_end_sample or None)."""
    s, e = speech_bounds(clip)
    clip = clip[s:e]
    f = rnd.uniform(0.9, 1.1)  # speed/pitch
    clip = np.interp(np.arange(0, len(clip), f), np.arange(len(clip)), clip).astype(np.float32)
    if rnd.random() < 0.4:
        clip = reverb(clip, rnd)
    clip = clip / (np.max(np.abs(clip)) + 1e-6) * rnd.uniform(0.15, 0.7) * 32767
    canvas = np.zeros(CANVAS, dtype=np.float32)
    clip = clip[: int(2.4 * SR)]
    if positive:
        end = int(rnd.uniform(1.6, 2.5) * SR)
    else:
        end = int(rnd.uniform(len(clip) / SR + 0.1, 2.9) * SR) if len(clip) / SR < 2.8 else CANVAS
    start = max(0, end - len(clip))
    canvas[start:end] = clip[len(clip) - (end - start):]
    if rnd.random() < 0.9:
        kind = rnd.choice(["white", "pink", "brown", "babble", "babble"])
        n = babble(babble_pool, CANVAS, rnd) if kind == "babble" else noise_like(kind, CANVAS, rnd)
        canvas = mix(canvas, n, rnd.uniform(3, 25))
    canvas = np.clip(canvas, -32768, 32767).astype(np.int16)
    return canvas, (end if positive else None)


# ---------------------------------------------------------------- features

_sess = {}


def sessions():
    if not _sess:
        o = ort.SessionOptions()
        o.intra_op_num_threads = 1
        _sess["mel"] = ort.InferenceSession(os.path.join(MODELS, "melspectrogram.onnx"), o, providers=["CPUExecutionProvider"])
        _sess["emb"] = ort.InferenceSession(os.path.join(MODELS, "embedding_model.onnx"), o, providers=["CPUExecutionProvider"])
    return _sess["mel"], _sess["emb"]


def embed(audio_i16):
    """int16 audio -> (n_windows, 96) embeddings, exactly as openWakeWord does it for whole clips."""
    mel, emb = sessions()
    spec = np.squeeze(mel.run(None, {"input": audio_i16.astype(np.float32)[None]})[0]) / 10 + 2
    wins = [spec[i : i + 76] for i in range(0, spec.shape[0], 8) if spec[i : i + 76].shape[0] == 76]
    batch = np.expand_dims(np.array(wins), -1).astype(np.float32)
    return np.squeeze(emb.run(None, {"input_1": batch})[0]).astype(np.float32)


WIN = 16
EMB_END_OFFSET = 0.775  # seconds from an embedding index j: audio end of window j is about 0.08*j + 0.775


def windows_from(canvas, word_end):
    """Cut the 16-embedding windows out of a canvas and label them. Label 1 only for windows that end just after the word."""
    e = embed(canvas)
    X, y = [], []
    for j in range(WIN - 1, len(e)):
        t_end = 0.08 * j + EMB_END_OFFSET  # audio time at the end of the window's last embedding
        if word_end is None:
            label = 0
        else:
            d = t_end - word_end / SR
            if -0.05 <= d <= 0.30:
                label = 1
            elif d < -0.25 or d > 0.50:
                label = 0
            else:
                continue  # ambiguous
        X.append(e[j - WIN + 1 : j + 1])
        y.append(label)
    return X, y


def job(args):
    path, positive, n_aug, seed, pool_paths = args
    rnd = np.random.default_rng(seed)
    pool = [load(p) for p in pool_paths]
    clip = load(path)
    X, y = [], []
    for _ in range(n_aug):
        canvas, end = make_canvas(clip, rnd, pool, positive)
        xs, ys = windows_from(canvas, end)
        X += xs
        y += ys
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int8)


def noise_job(args):
    seed, pool_paths, n = args
    rnd = np.random.default_rng(seed)
    pool = [load(p) for p in pool_paths]
    X = []
    for _ in range(n):
        kind = rnd.choice(["white", "pink", "brown", "babble", "silence"])
        if kind == "silence":
            a = rnd.standard_normal(CANVAS) * rnd.uniform(0, 30)
        else:
            a = babble(pool, CANVAS, rnd) if kind == "babble" else noise_like(kind, CANVAS, rnd)
            a = a / (np.std(a) + 1e-6) * rnd.uniform(200, 6000)
        xs, _ = windows_from(np.clip(a, -32768, 32767).astype(np.int16), None)
        X += xs
    return np.array(X, dtype=np.float32), np.zeros(len(X), dtype=np.int8)


def is_held_out(path):
    name = os.path.basename(path).split("_")
    return name[1] in HELD_OUT


def build(paths_pos, paths_neg, neg_pool, tag):
    cache = os.path.join(OUT, f"feat_{tag}.npz")
    if os.path.exists(cache):
        d = np.load(cache)
        return d["X"], d["y"]
    jobs = [(p, True, AUG_POS, i, neg_pool) for i, p in enumerate(paths_pos)]
    jobs += [(p, False, AUG_NEG, 10_000 + i, neg_pool) for i, p in enumerate(paths_neg)]
    t0 = time.time()
    with Pool(min(5, max(1, os.cpu_count() - 2))) as pool:
        res = pool.map(job, jobs, chunksize=4)
        noise = pool.map(noise_job, [(50_000 + i, neg_pool, 6) for i in range(40)])
    X = np.concatenate([r[0] for r in res + noise if len(r[0])])
    y = np.concatenate([r[1] for r in res + noise if len(r[1])])
    np.savez_compressed(cache, X=X, y=y)
    print(f"[{tag}] {len(X)} windows ({int(y.sum())} positive) in {time.time() - t0:.0f}s")
    return X, y


# ---------------------------------------------------------------- model


def train_head(X, y, epochs=30):
    import torch
    import torch.nn as nn
    from head import Head

    torch.manual_seed(0)
    m = Head()
    opt = torch.optim.AdamW(m.parameters(), lr=1.5e-3, weight_decay=2e-2)
    Xt, yt = torch.tensor(X), torch.tensor(y, dtype=torch.float32)[:, None]
    w_pos = float((y == 0).sum()) / max(1, float((y == 1).sum()))
    base = torch.where(yt > 0.5, torch.tensor(min(w_pos, 4.0)), torch.tensor(1.0))
    weights = base.clone()
    n = len(Xt)
    for ep in range(epochs):
        m.train()
        perm = torch.randperm(n)
        tot = 0.0
        for i in range(0, n, 512):
            b = perm[i : i + 512]
            opt.zero_grad()
            xb = Xt[b] + 0.02 * torch.randn_like(Xt[b])  # feature noise: stops memorising exact clips
            loss = (nn.functional.binary_cross_entropy(m(xb), yt[b], reduction="none") * weights[b]).mean()
            loss.backward()
            opt.step()
            tot += float(loss.detach()) * len(b)
        if ep in (9, 19):
            # Hard-negative mining: negatives the model still scores high get five times the weight.
            m.eval()
            with torch.no_grad():
                sc = torch.cat([m(Xt[i : i + 4096]) for i in range(0, n, 4096)])
            hard = (yt < 0.5) & (sc > 0.2)
            weights = base.clone()
            weights[hard] = 5.0
            print(f"  epoch {ep + 1}: loss {tot / n:.4f}, hard negatives: {int(hard.sum())}")
    return m.eval()


def evaluate(m, held_pos, held_neg, neg_pool):
    import torch

    """Recall on held-out voices, and false triggers per hour on held-out speech + noise."""
    rnd = np.random.default_rng(99)
    pool = [load(p) for p in neg_pool]
    hits = {t: 0 for t in (0.5, 0.7, 0.9)}
    total = 0
    for p in held_pos:
        clip = load(p)
        for _ in range(4):
            canvas, end = make_canvas(clip, rnd, pool, True)
            X, y = windows_from(canvas, end)
            if not X:
                continue
            with torch.no_grad():
                s = m(torch.tensor(np.array(X, dtype=np.float32))).numpy().ravel()
            pos = s[np.array(y) == 1]
            total += 1
            for t in hits:
                hits[t] += int(len(pos) and pos.max() >= t)
    print("recall on held-out voices:", {t: round(h / max(1, total), 3) for t, h in hits.items()}, f"({total} clips)")

    def stream_triggers(paths, label):
        if not paths:
            return
        stream = np.concatenate([np.pad(load(p), (SR // 3, SR // 3)) for p in paths])
        stream = mix(stream, noise_like("pink", len(stream), rnd), 15)
        e = embed(np.clip(stream, -32768, 32767).astype(np.int16))
        X = np.array([e[j - WIN + 1 : j + 1] for j in range(WIN - 1, len(e))], dtype=np.float32)
        with torch.no_grad():
            s = m(torch.tensor(X)).numpy().ravel()
        hours = len(stream) / SR / 3600
        out = {}
        for t in (0.5, 0.7, 0.9):
            trig, last = 0, -99
            for k in range(1, len(s)):
                if s[k] >= t and s[k - 1] >= t and k - last > 25:  # two windows in a row, 2 s cooldown
                    trig += 1
                    last = k
            out[t] = round(trig / hours, 1)
        print(f"false triggers/hour, {label} ({hours * 60:.1f} min):", out)

    def is_near(p):
        return any(k in os.path.basename(p) for k in NEAR_KEYS)

    stream_triggers([p for p in held_neg if not is_near(p)], "ordinary speech")
    stream_triggers([p for p in held_neg if is_near(p)], "look-alike phrases")
    return None


NEAR_KEYS = tuple(f"_{slug}.wav" for slug in __import__("phrases").NEAR_SLUGS)


def export(m, name="hey_netra"):
    import torch

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.onnx")
    torch.onnx.export(m, torch.zeros(1, WIN, 96), path, input_names=["features"], output_names=["score"], opset_version=17,
                      dynamo=False)
    chk = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    print("exported", path, chk.get_inputs()[0].shape, os.path.getsize(path) // 1024, "KB")
    return path


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    pos = sorted(glob.glob(os.path.join(DATA, "pos", "*.wav")))
    neg = sorted(glob.glob(os.path.join(DATA, "neg", "*.wav")))
    print(len(pos), "positive clips,", len(neg), "negative clips")
    random.Random(1).shuffle(neg)
    pool = neg[:60]  # clips used as babble noise
    tp, vp = [p for p in pos if not is_held_out(p)], [p for p in pos if is_held_out(p)]
    tn, vn = [p for p in neg if not is_held_out(p)], [p for p in neg if is_held_out(p)]
    print(f"train: {len(tp)} pos / {len(tn)} neg   held-out voices: {len(vp)} pos / {len(vn)} neg")
    X, y = build(tp, tn, [p for p in pool if not is_held_out(p)], "train")
    print("train windows:", X.shape, "positives:", int(y.sum()))
    model = train_head(X, y)
    evaluate(model, vp, vn, [p for p in pool if not is_held_out(p)])
    if "--final" in sys.argv:
        # Final model also learns the held-out voices.
        X2, y2 = build(pos, neg, pool, "all")
        model = train_head(X2, y2)
    export(model)
