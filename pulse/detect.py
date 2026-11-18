"""Detection engine. Rules are mirrored in web/detect.js - keep them in sync
(tests/test_parity.py checks the two produce identical alerts)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

REQUIRED = ["student_id", "class", "week", "score", "attendance_pct", "late_submissions"]
OPTIONAL = ["teacher_change", "school_event", "counsellor_followup"]
LEVELS = ["Green", "Yellow", "Orange", "Red"]


@dataclass(frozen=True)
class Config:
    low_score: float = 5.0        # adjusted score below this = "low"
    trend_drop: float = 1.6       # total fall over the last 3 screenings (smoothed)
    sharp_drop: float = 2.0       # fall vs. the student's own baseline
    baseline_n: int = 3           # first N screenings form the personal baseline
    low_attendance: float = 85.0  # mean attendance % over last 3 screenings
    late_limit: float = 3.0       # mean late submissions over last 3 screenings
    min_class_size: int = 5       # smaller classes fall back to whole-school effect


def validate(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    df = df.copy()
    for c in OPTIONAL:
        if c not in df.columns:
            df[c] = 0 if c == "teacher_change" else ""
    df["student_id"] = df["student_id"].astype(str)
    df["class"] = df["class"].astype(str)
    for c in ["week", "score", "attendance_pct", "late_submissions"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    bad = df[REQUIRED].isna().any(axis=1)
    if bad.any():
        raise ValueError(f"{int(bad.sum())} rows have blank/non-numeric required values")
    if not df["score"].between(1, 10).all():
        raise ValueError("score must be between 1 and 10")
    if df.duplicated(["student_id", "week"]).any():
        raise ValueError("Each student may have only one row per week")
    return df.sort_values(["student_id", "week"]).reset_index(drop=True)


def environment_effect(df: pd.DataFrame, cfg: Config = Config()) -> pd.Series:
    """Median class-week deviation from the class's own long-run median.

    Captures things that move a whole class together (teacher transfer, exam
    week). Median keeps a few struggling students from dragging the baseline.
    Small classes fall back to the whole-school effect.
    """
    school_wk = df.groupby("week")["score"].transform("median")
    school_eff = school_wk - df["score"].median()
    cls_n = df.groupby(["class", "week"])["score"].transform("size")
    cls_wk = df.groupby(["class", "week"])["score"].transform("median")
    cls_all = df.groupby("class")["score"].transform("median")
    cls_eff = cls_wk - cls_all
    return cls_eff.where(cls_n >= cfg.min_class_size, school_eff)


def timeline(df: pd.DataFrame, cfg: Config = Config()) -> pd.DataFrame:
    """Alert level for every student at every screening, using only data up to that point."""
    df = validate(df)
    df["env_effect"] = environment_effect(df, cfg)
    df["adjusted"] = df["score"] - df["env_effect"]
    out = []
    for sid, g in df.groupby("student_id", sort=False):
        g = g.sort_values("week").copy()
        adj = g["adjusted"].to_numpy()
        smooth = pd.Series(adj).rolling(2, min_periods=1).mean().to_numpy()
        n = len(g)
        low = adj < cfg.low_score
        trend = np.zeros(n, bool)
        sharp = np.zeros(n, bool)
        mild = np.zeros(n, bool)
        for i in range(n):
            if i >= 2:
                a, b, c = smooth[i - 2], smooth[i - 1], smooth[i]
                trend[i] = (a > b > c) and (a - c) >= cfg.trend_drop
            if i >= cfg.baseline_n:
                base = adj[: cfg.baseline_n].mean()
                sharp[i] = (base - smooth[i]) >= cfg.sharp_drop
            if i >= 1:
                mild[i] = (smooth[i - 1] - smooth[i]) >= 0.6
        att = g["attendance_pct"].rolling(3, min_periods=1).mean().to_numpy()
        late = g["late_submissions"].rolling(3, min_periods=1).mean().to_numpy()
        extra = (att < cfg.low_attendance) | (late >= cfg.late_limit)
        core = low | trend | sharp
        level = np.where(core & extra, 3, np.where(core, 2, np.where(mild, 1, 0)))
        g["low"], g["trend"], g["sharp"], g["extra"] = low, trend, sharp, extra
        g["level_rank"] = level
        g["level"] = [LEVELS[k] for k in level]
        out.append(g)
    res = pd.concat(out).sort_values(["student_id", "week"]).reset_index(drop=True)
    return res


def latest_alerts(df: pd.DataFrame, cfg: Config = Config()) -> pd.DataFrame:
    """One row per student: current status, worst first."""
    tl = timeline(df, cfg)
    last = tl.sort_values("week").groupby("student_id").tail(1)
    env_week = tl.groupby("week")["env_effect"].mean().abs()
    last = last.assign(
        env_explained=(last["score"] < cfg.low_score) & (last["adjusted"] >= cfg.low_score)
    )
    cols = ["student_id", "class", "week", "score", "adjusted", "level", "level_rank",
            "low", "trend", "sharp", "extra", "env_explained", "counsellor_followup"]
    return last[cols].sort_values(["level_rank", "adjusted"], ascending=[False, True]).reset_index(drop=True)


def school_shift_weeks(df: pd.DataFrame, z: float = 2.0) -> pd.DataFrame:
    """Control chart on weekly school median: weeks where the whole school moved."""
    df = validate(df)
    wk = df.groupby("week")["score"].median()
    mu, sd = wk.mean(), wk.std(ddof=0) or 1.0
    flagged = wk[(wk - mu).abs() > z * sd]
    return pd.DataFrame({"week": flagged.index, "school_median": flagged.values, "z": ((flagged - mu) / sd).values})
