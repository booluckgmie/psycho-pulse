"""Step 1: narration (piper TTS) -> timeline.json/js -> synthesized music + SFX -> mixed wav.
Everything is generated locally; no audio is downloaded except the open-source TTS voice."""
import json, os, wave, subprocess, sys
import numpy as np
from piper import PiperVoice, SynthesisConfig

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, "build"); os.makedirs(B, exist_ok=True)
VOICE = os.environ.get("PIPER_VOICE", "/tmp/claude-0/voices/amy.onnx")
SR = 44100

# (caption text, spoken text, minimum scene length in seconds)
SCENES = [
 ("In Malaysian schools, psychometric tests usually happen once a year.", None, 7),
 ("But a child's wellbeing can change in weeks, not months.", None, 8),
 ("What if a quick five-question check-in happened every week?", None, 11),
 ("But scores don't only move because of a student. When a teacher leaves, or exams arrive, the whole class can dip together.", None, 11),
 ("Psychometric-Pulse removes what the whole class shares, so it can notice what is different about one student.", "Psychometric Pulse removes what the whole class shares, so it can notice what is different about one student.", 11),
 ("It looks for real patterns, not one bad day, and grades the signal.", None, 10),
 ("Counsellors see who may need a conversation, and where the trend could lead if nothing changes.", None, 10),
 ("Even a few weeks of scores are enough to start. Five screenings per student is the recommended minimum.", None, 10),
 ("Your data stays in your browser. The model rebuilds itself from each upload, and nothing is saved.", None, 9),
 ("Notice early. Support early. Psychometric-Pulse: a prototype, built to support students, never to label them.", "Notice early. Support early. Psychometric Pulse. A prototype, built to support students, never to label them.", 14),
]
LEAD, TAIL = 0.6, 1.1

def synth():
    voice = PiperVoice.load(VOICE)
    cfg = SynthesisConfig(length_scale=1.07)
    durs = []
    for i, (cap, spoken, _) in enumerate(SCENES):
        p = os.path.join(B, f"vo_{i}.wav")
        with wave.open(p, "wb") as w:
            voice.synthesize_wav(spoken or cap, w, syn_config=cfg)
        with wave.open(p) as w:
            durs.append(w.getnframes() / w.getframerate())
    return durs

def timeline(durs):
    t, scenes = 0.0, []
    for i, ((cap, _, mn), d) in enumerate(zip(SCENES, durs)):
        dur = max(mn, LEAD + d + TAIL)
        scenes.append(dict(id=i + 1, start=round(t, 3), dur=round(dur, 3), vo_start=round(t + LEAD, 3),
                           vo_dur=round(d, 3), text=cap))
        t += dur
    total = round(t, 3)
    s = {x["id"]: x for x in scenes}
    # heartbeat: flat line in scenes 1-2, then a steady pulse
    beats, b = [], s[3]["start"] + 2.2
    while b < total - 0.5:
        beats.append(round(b, 3)); b += 1.0
    sfx = []
    for x in scenes:
        sfx.append(dict(t=round(x["start"] - 0.05, 3), kind="whoosh"))
    st = lambda i, dt: round(s[i]["start"] + dt, 3)
    sfx += [dict(t=st(1, 3.2), kind="pop"), dict(t=st(2, 4.0), kind="pop")]
    sfx += [dict(t=st(3, 0.3 + k * 0.045), kind="tick") for k in range(0, 40, 4)]
    sfx += [dict(t=st(3, 2.2 + k * 0.5), kind="pop") for k in range(5)]
    sfx += [dict(t=st(4, 3.0), kind="drop"), dict(t=st(4, 5.0), kind="drop")]
    sfx += [dict(t=st(6, dt), kind="pop") for dt in (1.8, 3.0, 4.2, 5.4, 5.9)]
    sfx += [dict(t=st(6, dt), kind="blip") for dt in (6.2, 6.5, 6.8, 7.1)]
    sfx += [dict(t=st(8, 1.6 + k * 0.11), kind="click") for k in range(0, 120)]
    sfx += [dict(t=st(8, 5.4), kind="pop")]
    sfx += [dict(t=st(9, dt), kind="pop") for dt in (4.5, 5.0, 5.5)]
    chime = round(s[10]["vo_start"] + 3.4, 3)
    sfx += [dict(t=chime, kind="chime")]
    return dict(total=total, scenes=scenes, beats=beats, sfx=sfx, end_card=chime)

# ----------------------------------------------------------------- synthesis
def env(n, a, d, curve=3.0):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t * curve / d)

def put(buf, t0, x, g=1.0):
    i = int(t0 * SR)
    if i < 0 or i >= len(buf): return
    x = x[: len(buf) - i]
    buf[i:i + len(x)] += x * g

def tone(f, dur, a=0.01, d=0.5, harm=(1, .35, .12), curve=4.0):
    n = int(dur * SR); t = np.arange(n) / SR
    y = sum(h * np.sin(2 * np.pi * f * (k + 1) * t) for k, h in enumerate(harm))
    return y * env(n, a, d, curve)

def reverb(x, secs=1.8, mix=0.28, seed=3):
    rng = np.random.default_rng(seed); n = int(secs * SR)
    ir = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 3.2)
    ir[0] = 0; ir /= np.abs(ir).sum() ** 0.5 * 6
    N = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[: len(x)]
    return x * (1 - mix) + wet * mix * 3.0

def music(tl):
    total = tl["total"] + 3.0
    N = int(total * SR); pad = np.zeros(N); arp = np.zeros(N); bass = np.zeros(N)
    bpm = 90; beat = 60 / bpm; bar = 4 * beat
    # D major hopeful loop: D - Bm - G - A  (MIDI-ish frequencies)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    prog = [(50, [62, 66, 69]), (47, [62, 66, 71]), (43, [62, 67, 71]), (45, [64, 69, 73])]
    sc = {s["id"]: s for s in tl["scenes"]}
    t_arp = sc[3]["start"]; t_full = sc[5]["start"]; t_end = sc[10]["start"]
    for k in range(int(total / bar) + 1):
        t0 = k * bar; root, ch = prog[k % 4]
        if t0 >= t_end + 6.0:   # final bar: resolve to D and ring out
            root, ch = 50, [62, 66, 69]
        # pad: slow attack, soft
        for m in ch:
            n = int((bar + 1.2) * SR); t = np.arange(n) / SR
            y = (np.sin(2 * np.pi * hz(m) * t) + .5 * np.sin(2 * np.pi * hz(m) * 1.003 * t)) * np.minimum(t / 1.1, 1) * np.exp(-np.maximum(t - bar, 0) * 2.2)
            put(pad, t0, y, 0.05)
        if t0 >= t_arp - 0.01:
            put(bass, t0, tone(hz(root), bar, 0.02, bar, (1, .25), 1.4), 0.10)
            steps = 8
            pattern = [0, 1, 2, 1, 2, 1, 0, 1] if t0 < t_full else [0, 1, 2, 1, 0, 2, 1, 2]
            for j in range(steps):
                m = ch[pattern[j]] + 12
                put(arp, t0 + j * beat / 2, tone(hz(m), 0.9, 0.004, 0.55, (1, .3, .08), 5.0), 0.05 if t0 < t_full else 0.065)
    music = reverb(pad * 1.0 + arp * 1.0, 1.9, 0.30) + bass
    # dynamics: sparse early, warmer later, fade out at end
    t = np.arange(N) / SR
    g = np.interp(t, [0, sc[2]["start"], sc[3]["start"], sc[5]["start"], t_end, tl["total"], total],
                  [0.55, 0.5, 0.85, 1.0, 1.0, 1.0, 0.0])
    return music * g

def sfx_track(tl):
    N = int((tl["total"] + 3.0) * SR); buf = np.zeros(N); rng = np.random.default_rng(7)
    for b in tl["beats"]:                      # lub-dub heartbeat
        put(buf, b, tone(52, 0.34, 0.004, 0.2, (1, .5), 3.2), 0.55)
        put(buf, b + 0.27, tone(46, 0.30, 0.004, 0.17, (1, .5), 3.4), 0.34)
    for e in tl["sfx"]:
        k, t0 = e["kind"], e["t"]
        if k == "pop":
            n = int(.16 * SR); tt = np.arange(n) / SR
            f = 620 + 520 * np.minimum(tt / .06, 1)
            put(buf, t0, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22), 0.22)
        elif k == "blip":
            put(buf, t0, tone(880, .25, .004, .2, (1, .3), 5), 0.16)
            put(buf, t0 + .06, tone(1320, .22, .004, .18, (1,), 5), 0.10)
        elif k == "tick":
            put(buf, t0, tone(1800, .05, .001, .03, (1,), 6), 0.12)
        elif k == "click":
            n = int(.012 * SR); put(buf, t0, rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 400), 0.05)
        elif k == "drop":
            n = int(.5 * SR); tt = np.arange(n) / SR
            put(buf, t0, np.sin(2 * np.pi * np.cumsum(260 * np.exp(-tt * 3.5)) / SR) * np.exp(-tt * 5), 0.22)
        elif k == "whoosh":
            n = int(.9 * SR); tt = np.arange(n) / SR
            x = rng.normal(0, 1, n); k_ = 1 + int(tt[-1] * 0)  # simple smoothed noise
            for w in (6, 6): x = np.convolve(x, np.ones(w) / w, mode="same")
            put(buf, t0, x * np.sin(np.pi * tt / .9) ** 2 * 1.4, 0.10)
        elif k == "chime":
            for j, m in enumerate((74, 78, 81, 86)):
                put(buf, t0 + j * .09, tone(440 * 2 ** ((m - 69) / 12), 2.2, .004, 1.6, (1, .35, .1), 2.2), 0.09)
    return reverb(buf, 1.2, 0.18, 5)

def load_vo(i):
    src, dst = os.path.join(B, f"vo_{i}.wav"), os.path.join(B, f"vo44_{i}.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "1",
                    "-af", "highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=1.6", dst], check=True)
    with wave.open(dst) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768

def main():
    durs = synth(); tl = timeline(durs)
    json.dump(tl, open(os.path.join(B, "timeline.json"), "w"), indent=1)
    open(os.path.join(HERE, "timeline.js"), "w").write("window.TL = " + json.dumps(tl) + ";\n")
    N = int((tl["total"] + 3.0) * SR)
    vo = np.zeros(N)
    for s in tl["scenes"]:
        put(vo, s["vo_start"], load_vo(s["id"] - 1), 1.0)
    m, f = music(tl), sfx_track(tl)
    vo_wet = reverb(vo, 0.9, 0.06, 11)
    # sidechain: duck music under narration
    k = int(0.12 * SR); e = np.convolve(np.abs(vo), np.ones(k) / k, mode="same")
    duck = 1 - 0.55 * np.clip(e / 0.05, 0, 1)
    duck = np.convolve(duck, np.ones(int(.25 * SR)) / int(.25 * SR), mode="same")
    mix = vo_wet * 1.0 + m * duck * 0.75 + f * 0.85
    mix = np.tanh(mix * 0.9) / 0.9
    pk = np.abs(mix).max(); mix = mix / pk * 0.89
    st = np.stack([mix, mix], 1)
    st[:, 1] = np.roll(mix, int(0.0007 * SR)) * 0.99   # tiny interaural offset for width
    out = os.path.join(B, "mix.wav")
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())
    print("total", tl["total"], "s;", [(s["id"], s["start"], s["dur"]) for s in tl["scenes"]])

if __name__ == "__main__":
    main()
