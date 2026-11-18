"""Music-only soundtrack (no narration). Composed in code, locked to the on-screen heartbeat.
Reads build/timeline.json (scene times, heartbeat beats, SFX) and writes build/music_mix.wav."""
import json, os, wave
import numpy as np
import build_audio as ba

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, "build")
SR = ba.SR; put = ba.put; tone = ba.tone
TL = json.load(open(os.path.join(B, "timeline.json")))
SC = {s["id"]: s["start"] for s in TL["scenes"]}
TOTAL = TL["total"] + 3.0
N = int(TOTAL * SR)
BEAT, BAR = 0.5, 2.0                      # 120 bpm; heartbeat (1 s) = every 2nd beat
T0 = TL["beats"][0]                       # grid is anchored to the first heartbeat
END = TL["end_card"]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

CH = {  # name: (bass midi, triad midi)
    "D": (38, [62, 66, 69]), "Bm": (47, [62, 66, 71]), "G": (43, [62, 67, 71]),
    "A": (45, [61, 64, 69]), "F#m": (42, [61, 66, 69]),
}
PROG = {"intro": ["D", "Bm", "G", "A"], "groove": ["D", "Bm", "G", "A"], "tension": ["Bm", "G", "Bm", "A"],
        "lift": ["D", "A", "Bm", "G"], "full": ["D", "Bm", "G", "A"], "calm": ["G", "D", "G", "A"],
        "finale": ["D", "Bm", "G", "A"]}

def section(t):
    if t >= END: return "finale"
    if t >= SC[9]: return "calm"
    if t >= SC[6]: return "full"
    if t >= SC[5]: return "lift"
    if t >= SC[4]: return "tension"
    if t >= SC[3]: return "groove"
    return "intro"

# melody (beat offset in bar, midi, length in beats): hopeful rising phrase over D - Bm - G - A
MEL = [
    [(0, 78, 1.5), (1.5, 81, .5), (2, 83, 1), (3, 81, 1)],
    [(0, 81, 1.5), (1.5, 78, .5), (2, 76, 1), (3, 78, 1)],
    [(0, 79, 1.5), (1.5, 78, .5), (2, 76, 1), (3, 74, 1)],
    [(0, 76, 1), (1, 78, 1), (2, 81, 2)],
]

def pad_note(buf_l, buf_r, t0, m, dur, g):
    n = int((dur + 1.4) * SR); t = np.arange(n) / SR
    a = np.minimum(t / 0.9, 1) * np.exp(-np.maximum(t - dur, 0) * 2.4)
    for buf, det in ((buf_l, 1.0025), (buf_r, 0.9975)):
        f = hz(m) * det
        y = (np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) + .12 * np.sin(6 * np.pi * f * t)
             + .5 * np.sin(2 * np.pi * f * 1.004 * t + .7)) * a
        put(buf, t0, y, g)

def hat(t0, rng, g=.05, ln=.035):
    n = int(ln * SR); x = rng.normal(0, 1, n); x = x[1:] - x[:-1]
    return x * np.exp(-np.arange(len(x)) / SR * 110)

def build():
    rng = np.random.default_rng(21)
    padL, padR = np.zeros(N), np.zeros(N)
    arp, mel, bass, perc = np.zeros(N), np.zeros(N), np.zeros(N), np.zeros(N)
    k0 = -int(np.ceil(T0 / BAR))
    k = k0
    while T0 + k * BAR < TOTAL:
        t = T0 + k * BAR
        if t + BAR <= 0: k += 1; continue
        sec = section(max(t, 0)); final_bar = t >= END + 6.0
        name = "D" if final_bar else PROG[sec][k % 4]
        bass_m, tri = CH[name]
        # --- pad (always) ---
        padg = {"intro": .060, "groove": .050, "tension": .042, "lift": .052, "full": .056, "calm": .060, "finale": .070}[sec]
        for m in tri + [tri[0] - 12]:
            pad_note(padL, padR, max(t, 0), m, BAR + (0 if t >= 0 else t), padg)
        # --- sparse piano in the intro ---
        if sec == "intro":
            for j, (off, idx) in enumerate([(0, 2), (1.0, 1), (2.0, 2), (3.0, 0)]):
                tt = t + off * BEAT * 1.0
                if tt > 0.6 and j % 2 == 0 or (tt > 5 and j == 3):
                    put(arp, tt, tone(hz(tri[idx] + 12), 1.6, .004, 1.0, (1, .4, .15), 2.6), .075)
        # --- arpeggio (from the moment the pulse starts) ---
        if sec in ("groove", "tension", "lift", "full", "calm", "finale"):
            pat = {"groove": [0, 1, 2, 1, 2, 1, 0, 1], "tension": [0, 2, 1, 2, 0, 2, 1, 2],
                   "lift": [0, 1, 2, 1, 0, 2, 1, 2], "full": [0, 1, 2, 1, 0, 2, 1, 2], "calm": [0, 2, 1, 2, 0, 2, 1, 2],
                   "finale": [0, 1, 2, 1, 0, 2, 1, 2]}[sec]
            ag = {"groove": .060, "tension": .048, "lift": .066, "full": .074, "calm": .050, "finale": .080}[sec]
            for j in range(8):
                m = tri[pat[j]] + (12 if sec != "tension" else 0)
                put(arp, t + j * BEAT / 2, tone(hz(m), .8, .004, .5, (1, .32, .08), 5.0), ag * (1.15 if j % 4 == 0 else 1))
        # --- bass (groove onward; softer in calm) ---
        if sec != "intro":
            bg = {"groove": .08, "tension": .065, "lift": .095, "full": .11, "calm": .065, "finale": .12}[sec]
            put(bass, t, tone(hz(bass_m), BAR * .95, .02, BAR, (1, .28), 1.2), bg)
            if sec in ("lift", "full", "finale"):
                put(bass, t + 1.5 * BEAT * 2 - .0, tone(hz(bass_m), .5, .01, .35, (1, .25), 3), bg * .6)
        # --- melody (lift, full, finale; echo of it in calm) ---
        if sec in ("lift", "full", "finale", "calm"):
            phrase = MEL[k % 4]
            mg = {"lift": .07, "full": .085, "finale": .11, "calm": .055}[sec]
            for off, m, ln in phrase:
                tt = t + off * BEAT
                mm = m - (12 if sec == "calm" else 0)
                put(mel, tt, tone(hz(mm), ln * BEAT + .8, .004, 1.0, (1, 0, .3, 0, .1), 2.6), mg)
                if sec == "finale":
                    put(mel, tt, tone(hz(mm + 12), ln * BEAT + .6, .004, .7, (1, .0, .15), 3.2), mg * .45)
        # --- percussion: light hats / shaker, rim click ---
        if sec in ("lift", "full", "finale"):
            for j in range(8):
                put(perc, t + j * BEAT / 2 + BEAT / 2 * (1 if j % 2 == 0 else 0) * 0, hat(0, rng) * (1.0 if j % 2 else .5), .045 if sec == "lift" else .06)
            if sec != "lift":
                for j in (1, 3):
                    n = int(.03 * SR); x = rng.normal(0, 1, n); put(perc, t + j * BEAT * 2 / 2 * 1.0, np.convolve(x, np.ones(3) / 3, "same") * np.exp(-np.arange(n) / SR * 90), .07)
        k += 1
    # --- finale swell + riser into the end card ---
    n = int(2.2 * SR); tt = np.arange(n) / SR
    x = rng.normal(0, 1, n); x = np.convolve(x, np.ones(5) / 5, "same"); x = x[1:] - x[:-1] if False else x
    riser = x * (tt / 2.2) ** 3 * 0.9
    put(perc, END - 2.2, riser, .12)
    for m in (50, 62, 66, 69, 74, 78, 81):
        pad_note(padL, padR, END, m, 8.0, .06)
    put(bass, END, tone(hz(38), 6.0, .01, 6.0, (1, .35), 1.0), .14)
    # stereo reverb on tonal stems, dry on bass/perc
    wetL = ba.reverb(padL + arp + mel, 2.2, .33, 3)
    wetR = ba.reverb(padR + arp + mel, 2.2, .33, 9)
    t = np.arange(N) / SR
    g = np.interp(t, [0, SC[2], SC[3], SC[4], SC[5], SC[6], SC[9], SC[10], END, TL["total"], TOTAL],
                  [.95, .95, .95, .85, .95, 1.0, .9, .95, 1.0, .95, 0.0])
    L = (wetL + bass + perc * .9) * g
    R = (wetR + bass + perc * 1.0) * g
    return L, R

def main():
    L, R = build()
    sfx = ba.sfx_track(TL)
    # music-only film: SFX are part of the score now, a touch louder
    L = L * 1.0 + sfx * 1.0; R = R * 1.0 + sfx * 1.0
    mix = np.stack([L, R], 1)
    mix = np.tanh(mix * 1.0) / 1.0
    mix = mix / np.abs(mix).max() * 0.89
    out = os.path.join(B, "music_mix.wav")
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    print("wrote", out, round(len(mix) / SR, 1), "s")

if __name__ == "__main__":
    main()
