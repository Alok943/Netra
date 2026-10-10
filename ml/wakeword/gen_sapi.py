"""Free extra clips from the Windows built-in voices (David, Zira). English phrases only; no network, no cost."""
import json, os, re, subprocess

from phrases import NEAR_MISS_EN, POS_EN, SENT_EN, SENT_HINGLISH

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "h" + __import__("hashlib").md5(s.encode()).hexdigest()[:10]


jobs = []
voices = {"Microsoft David Desktop": "david", "Microsoft Zira Desktop": "zira"}
for voice, short in voices.items():
    for text in POS_EN:
        for rate in (-3, 0, 3):
            jobs.append({"voice": voice, "rate": rate, "text": text, "path": f"pos/sapi_{short}_{slug(text)}_{rate}.wav"})
    for text in NEAR_MISS_EN + SENT_EN + SENT_HINGLISH:
        jobs.append({"voice": voice, "rate": 0, "text": text, "path": f"neg/sapi_{short}_{slug(text)}.wav"})

jobs = [j for j in jobs if not os.path.exists(os.path.join(DATA, j["path"]))]
print(len(jobs), "clips to generate")
json.dump({"data": DATA, "jobs": jobs}, open(os.path.join(HERE, "sapi_jobs.json"), "w", encoding="utf-8"), ensure_ascii=False)

ps = r"""
Add-Type -AssemblyName System.Speech
$cfg = Get-Content -Raw -Encoding UTF8 '__JOBS__' | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($j in $cfg.jobs) {
  $s.SelectVoice($j.voice); $s.Rate = [int]$j.rate
  $s.SetOutputToWaveFile((Join-Path $cfg.data $j.path), $fmt)
  $s.Speak($j.text); $s.SetOutputToNull()
}
"""
script = os.path.join(HERE, "sapi_run.ps1")
open(script, "w", encoding="utf-8").write(ps.replace("__JOBS__", os.path.join(HERE, "sapi_jobs.json")))
subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], check=True)
os.remove(script)
os.remove(os.path.join(HERE, "sapi_jobs.json"))
print("done")
