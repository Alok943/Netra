"""Generate wake-word training clips with Sarvam text-to-speech (bulbul:v3), under a hard character budget.

Pricing seen on Sarvam's page: about Rs 30 per 10,000 characters (bulbul:v3). The default cap is 14,000
characters, about Rs 42. Re-running skips files that already exist, and the ledger remembers every character spent.

  python gen_sarvam.py            # generate everything not yet generated
  python gen_sarvam.py --dry-run  # only print how many characters it would spend
"""
import base64, hashlib, json, os, random, re, sys, time, urllib.error, urllib.request

from phrases import NEAR_MISS_EN, NEAR_MISS_HI, POS_EN, POS_HI, SENT_EN, SENT_HI, SENT_HINGLISH, extra_sentences

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
LEDGER = os.path.join(DATA, "sarvam_ledger.json")
CAP_CHARS = 14_000

SPEAKERS = [
    "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya", "amit", "dev", "ishita",
    "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya",
    "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
]


def load_key() -> str:
    env = open(os.path.join(HERE, "..", "..", ".env"), encoding="utf-8").read()
    m = re.search(r"^\s*SARVAM_API_KEY\s*=\s*(.+?)\s*$", env, re.M)
    if not m:
        sys.exit("SARVAM_API_KEY not found in .env")
    return m.group(1).strip().strip('"').strip("'")


def slug(s: str) -> str:
    """File-name part for a phrase. Non-Latin text (Hindi) gets a hash so different phrases never share a name."""
    ascii_part = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40]
    return ascii_part or "h" + hashlib.md5(s.encode()).hexdigest()[:10]


def plan():
    """Every clip we want: (kind, relative path, text, language, speaker, pace)."""
    rnd = random.Random(7)
    jobs = []
    # Positives: all speakers; English phrases at two speeds, Hindi once.
    for sp in SPEAKERS:
        for text in POS_EN:
            for pace in ([0.9, 1.15] if text == "Hey Netra" else [1.0]):
                jobs.append(("pos", f"pos/sar_{sp}_{slug(text)}_{pace}.wav", text, "en-IN", sp, pace))
        for text in POS_HI:
            jobs.append(("pos", f"pos/sar_{sp}_{slug(text)}_1.0.wav", text, "hi-IN", sp, 1.0))
    # Near-misses: two random voices each.
    for lang, items in (("en-IN", NEAR_MISS_EN), ("hi-IN", NEAR_MISS_HI)):
        for text in items:
            for sp in rnd.sample(SPEAKERS, 2):
                jobs.append(("neg", f"neg/sar_{sp}_{slug(text)}.wav", text, lang, sp, rnd.choice([0.95, 1.05])))
    # Ordinary sentences: one random voice each. Hinglish is read by the Indian-English voice.
    for lang, items in (("en-IN", SENT_EN), ("hi-IN", SENT_HI), ("en-IN", SENT_HINGLISH)):
        for text in items:
            sp = rnd.choice(SPEAKERS)
            jobs.append(("neg", f"neg/sar_{sp}_{slug(text)}.wav", text, lang, sp, rnd.choice([0.9, 1.0, 1.1])))
    # Round 2: composed sentences and short utterances, two random voices each (more speakers per sentence).
    for lang, text in extra_sentences():
        n_voices = 2 if len(text) <= 14 else 1  # short utterances get two voices, composed sentences one
        for sp in rnd.sample(SPEAKERS, n_voices):
            jobs.append(("neg", f"neg/sar2_{sp}_{slug(text)}.wav", text, lang, sp, rnd.choice([0.9, 1.0, 1.1])))
    return jobs


def main() -> None:
    dry = "--dry-run" in sys.argv
    os.makedirs(os.path.join(DATA, "pos"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "neg"), exist_ok=True)
    ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {"chars": 0, "clips": 0}

    todo = [j for j in plan() if not os.path.exists(os.path.join(DATA, j[1]))]
    need = sum(len(j[2]) for j in todo)
    print(f"{len(todo)} clips to generate, {need} characters (spent so far: {ledger['chars']}, cap {CAP_CHARS}).")
    if dry:
        return
    if ledger["chars"] + need > CAP_CHARS:
        sys.exit("Over the character cap. Raise CAP_CHARS or trim the phrase lists.")

    key = load_key()
    for n, (kind, rel, text, lang, sp, pace) in enumerate(todo, 1):
        body = json.dumps({
            "text": text, "language_code": lang, "speaker": sp, "model": "bulbul:v3", "pace": pace,
            "speech_sample_rate": 16000, "output_audio_codec": "wav",
        }).encode()
        for attempt in range(5):
            req = urllib.request.Request("https://api.sarvam.ai/text-to-speech", data=body,
                                         headers={"api-subscription-key": key, "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    audio = base64.b64decode(json.load(r)["audios"][0])
                break
            except urllib.error.HTTPError as e:
                msg = e.read().decode()[:200]
                if e.code == 429:
                    time.sleep(3 * (attempt + 1))
                    continue
                if e.code == 422 and "speaker" in msg.lower():
                    print("skip (speaker rejected):", sp)
                    audio = None
                    break
                sys.exit(f"HTTP {e.code}: {msg}")
        else:
            sys.exit("Too many 429s; stopping. Re-run later.")
        if audio:
            with open(os.path.join(DATA, rel), "wb") as f:
                f.write(audio)
            ledger["chars"] += len(text)
            ledger["clips"] += 1
            json.dump(ledger, open(LEDGER, "w"))
        if n % 25 == 0:
            print(f"  {n}/{len(todo)}  chars spent: {ledger['chars']}")
    print("done:", ledger)


if __name__ == "__main__":
    main()
