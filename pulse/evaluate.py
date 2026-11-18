"""Does screening more often detect earlier? Does environment adjustment cut false alarms?

Simulates many schools (different seeds), subsamples the weekly data to
simulate weekly / fortnightly / monthly / termly screening, and measures
lead time before crisis and false-alarm rate against ground truth.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from . import detect
from .simulate import simulate

FREQ = {"weekly": 1, "fortnightly": 2, "monthly": 4, "termly": 12}


def run_one(seed, weeks, step, adjust=True):
    df, truth = simulate(n_students=120, n_weeks=weeks, seed=seed)
    sub = df[(df["week"] - 1) % step == 0].copy()
    if not adjust:  # ablation: no environment adjustment
        orig = detect.environment_effect
        detect.environment_effect = lambda d, c=detect.Config(): d["score"] * 0
    try:
        tl = detect.timeline(sub)
    finally:
        if not adjust:
            detect.environment_effect = orig
    alerted = tl[tl["level_rank"] >= 2].groupby("student_id")["week"].min()
    t = truth.set_index("student_id")
    t["first_alert"] = alerted
    risk = t[t.at_risk]
    healthy = t[~t.at_risk]
    found = risk[risk.first_alert.notna()]
    lead = (found.crisis_week - found.first_alert).dropna()
    return dict(
        detected=len(found) / max(len(risk), 1),
        before_crisis=float(((risk.first_alert <= risk.crisis_week) & risk.crisis_week.notna()).sum()
                            / max(risk.crisis_week.notna().sum(), 1)),
        lead_weeks=lead.mean() if len(lead) else np.nan,
        false_alarm=float(healthy.first_alert.notna().mean()),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schools", type=int, default=30)
    ap.add_argument("--weeks", type=int, default=24)
    ap.add_argument("--out", default="data/evaluation.csv")
    a = ap.parse_args()
    rows = []
    for name, step in FREQ.items():
        for adjust in (True, False):
            if not adjust and name != "weekly":
                continue
            res = pd.DataFrame([run_one(s, a.weeks, step, adjust) for s in range(a.schools)])
            rows.append(dict(frequency=name if adjust else "weekly (no env. adjustment)",
                             **res.mean().round(3).to_dict()))
    out = pd.DataFrame(rows)
    out.to_csv(a.out, index=False)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
