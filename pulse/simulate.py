"""Synthetic single-school generator. Produces an upload-template CSV plus a
separate ground-truth file (never uploaded) so detection can be evaluated."""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

EVENTS = {6: "Mid-term test", 7: "Mid-term test", 11: "Exam week", 12: "Exam week"}


def simulate(n_students=120, n_weeks=12, risk_rate=0.17, seed=7,
             teacher_change_week=6, affected_class="5B"):
    rng = np.random.default_rng(seed)
    classes = ["5A", "5B", "5C", "5D"]
    sid = [f"S{i + 1:03d}" for i in range(n_students)]
    cls = {s: classes[i % len(classes)] for i, s in enumerate(sid)}
    base = rng.normal(7.4, 0.8, n_students).clip(4.5, 9.5)
    at_risk = rng.random(n_students) < risk_rate
    onset = rng.integers(2, max(3, n_weeks // 2) + 1, n_students)
    slope = rng.uniform(0.25, 0.55, n_students)

    rows, truth = [], []
    for i, s in enumerate(sid):
        crisis_week = None
        for w in range(1, n_weeks + 1):
            latent = base[i]
            if at_risk[i] and w >= onset[i]:
                latent -= slope[i] * (w - onset[i] + 1)
            env = 0.0
            if w in EVENTS:
                env -= 0.4
            if cls[s] == affected_class and w >= teacher_change_week:
                env -= 1.2 * np.exp(-(w - teacher_change_week) / 6.0)
            score = float(np.clip(latent + env + rng.normal(0, 0.45), 1, 10))
            dist = max(0.0, base[i] - latent)
            att = float(np.clip(96 - 5 * dist + rng.normal(0, 2), 50, 100))
            late = int(np.clip(rng.poisson(0.6 + 0.9 * dist), 0, 10))
            if crisis_week is None and latent < 4.5:
                crisis_week = w
            rows.append(dict(
                student_id=s, **{"class": cls[s]}, week=w, score=round(score, 1),
                attendance_pct=round(att), late_submissions=late,
                teacher_change=int(cls[s] == affected_class and w == teacher_change_week),
                school_event=EVENTS.get(w, ""), counsellor_followup="No"))
        truth.append(dict(student_id=s, at_risk=bool(at_risk[i]),
                          onset_week=int(onset[i]) if at_risk[i] else None,
                          crisis_week=crisis_week))
    return pd.DataFrame(rows), pd.DataFrame(truth)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--students", type=int, default=120)
    ap.add_argument("--weeks", type=int, default=12)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="data/sample_school_upload.csv")
    ap.add_argument("--truth", default="data/sample_truth.csv")
    a = ap.parse_args()
    df, truth = simulate(a.students, a.weeks, seed=a.seed)
    df.to_csv(a.out, index=False)
    truth.to_csv(a.truth, index=False)
    print(f"wrote {a.out} ({len(df)} rows) and {a.truth} ({int(truth.at_risk.sum())} at-risk)")


if __name__ == "__main__":
    main()
