"""How little data can a teacher get away with? Sweep class size x weeks observed.

Reports, at the *latest* week (what a teacher sees on the dashboard):
  sensitivity  = declining students (fell >=1.5 pts below their own baseline) currently Orange/Red
  false_alarm  = healthy students currently Orange/Red
  precision    = share of flagged students whose decline has genuinely begun (not healthy)
and forecast accuracy for the declining students.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from . import detect
from .simulate import simulate


def one(n_students, weeks, seed):
    df, truth = simulate(n_students=n_students, n_weeks=weeks, seed=seed, n_classes=1,
                         noise_sd=0.45, risk_rate=0.2, teacher_change_week=99)
    alerts, cfg, rep = detect.analyse(df)
    t = truth.set_index("student_id")
    onset = pd.to_numeric(t.onset_week, errors="coerce")
    decline = np.where(t.at_risk & (onset <= weeks), t.slope * (weeks - onset + 1), 0.0)
    t["declining"] = decline >= 1.5
    t["started"] = t.at_risk & (onset <= weeks)
    t["flag"] = alerts.set_index("student_id")["level_rank"].reindex(t.index) >= 2
    dec, healthy = t[t.declining], t[~t.at_risk]
    flagged = t[t.flag]
    return dict(
        sensitivity=dec.flag.mean() if len(dec) else np.nan,
        false_alarm=healthy.flag.mean() if len(healthy) else np.nan,
        precision=flagged.started.mean() if len(flagged) else np.nan,
        n_dec=len(dec),
    )


def forecast_check(n_students, weeks, seed, ahead=3):
    """Does the 80% band cover the observed adjusted score `ahead` weeks later?"""
    df, truth = simulate(n_students=n_students, n_weeks=weeks + ahead, seed=seed, n_classes=1,
                         noise_sd=0.45, risk_rate=0.2, teacher_change_week=99)
    seen, future = df[df.week <= weeks], df[df.week == weeks + ahead].set_index("student_id")
    cfg, rep = detect.rebuild(seen)
    tl = detect.timeline(seen, cfg)
    hit, err = [], []
    for sid, g in tl.groupby("student_id"):
        f = detect.forecast(g["week"].tolist(), g["adjusted"].tolist(), cfg, rep["noise_used"])
        if f is None:
            continue
        p = f["points"][ahead - 1]
        y = future.loc[sid, "score"]  # approximate: class effect ~0 for a single class
        hit.append(p["lo"] <= y <= p["hi"])
        err.append(abs(p["mean"] - y))
    return dict(coverage=np.mean(hit) if hit else np.nan, mae=np.mean(err) if err else np.nan)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=60)
    ap.add_argument("--out", default="data/minimum_data.csv")
    a = ap.parse_args()
    rows = []
    for n in (4, 6, 10, 15, 30):
        for w in (3, 4, 5, 6, 8, 12):
            r = pd.DataFrame([one(n, w, s) for s in range(a.seeds)])
            f = pd.DataFrame([forecast_check(n, w, 500 + s) for s in range(a.seeds)]) if w >= 3 else None
            rows.append(dict(students=n, weeks=w, points=n * w,
                             sensitivity=r.sensitivity.mean(), false_alarm=r.false_alarm.mean(),
                             precision=r.precision.mean(), declining_per_class=r.n_dec.mean(),
                             band_coverage=f.coverage.mean(), forecast_mae=f.mae.mean()))
    out = pd.DataFrame(rows).round(3)
    out.to_csv(a.out, index=False)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
