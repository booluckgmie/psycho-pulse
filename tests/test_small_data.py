import json
import shutil
import subprocess

import numpy as np
import pandas as pd
import pytest

from pulse import detect
from pulse.simulate import simulate


def test_scores_only_upload_works():
    df, _ = simulate(n_students=12, n_weeks=5, seed=2, n_classes=1)
    bare = df[["student_id", "week", "score"]]
    alerts, cfg, rep = detect.analyse(bare)
    assert len(alerts) == 12 and rep["mode"] == "early"
    assert alerts["level"].isin(["Green", "Yellow", "Orange"]).all()  # no attendance data -> never Red


def test_tiny_group_is_not_adjusted():
    rows = [dict(student_id=f"S{i}", week=w, score=s) for i in range(3) for w, s in enumerate([7, 7, 6, 5, 4], 1)]
    df = detect.validate(pd.DataFrame(rows))
    assert (detect.environment_effect(df) == 0).all()


def test_forecast_needs_three_points():
    assert detect.forecast([1, 2], [7, 6.5]) is None
    assert detect.forecast([1, 2, 3], [7, 6.5, 6]) is not None


def test_forecast_decline_reaches_floor_and_band_widens():
    f = detect.forecast([1, 2, 3, 4, 5], [8, 7.5, 7.0, 6.5, 6.0])
    assert f["slope"] < 0 and 1 < f["weeks_to_floor"] < 3
    widths = [p["hi"] - p["lo"] for p in f["points"]]
    assert widths == sorted(widths)


def test_forecast_flat_has_no_floor_date():
    f = detect.forecast([1, 2, 3, 4], [7.0, 7.1, 6.9, 7.0])
    assert f["weeks_to_floor"] is None and abs(f["slope"]) < 0.1


def test_forecast_band_is_never_falsely_narrow():
    perfect = detect.forecast([1, 2, 3], [7.0, 6.0, 5.0], noise=0.45)  # zero residual
    assert perfect["points"][0]["hi"] - perfect["points"][0]["lo"] > 1.0


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_forecast_matches_python():
    weeks, adj = [3, 4, 5, 6, 7, 8, 9], [7.4, 7.0, 6.9, 6.2, 5.9, 5.1, 5.0]
    js = json.loads(subprocess.check_output(["node", "-e", """
const P=require('./web/detect.js');
console.log(JSON.stringify(P.forecast(%s,%s,{low:5.0},0.5)));""" % (weeks, adj)], text=True))
    py = detect.forecast(weeks, adj, detect.Config(), 0.5)
    assert abs(js["slope"] - py["slope"]) < 1e-9
    assert abs(js["weeksToFloor"] - py["weeks_to_floor"]) < 1e-9 if py["weeks_to_floor"] else js["weeksToFloor"] is None
    for a, b in zip(js["points"], py["points"]):
        assert abs(a["mean"] - b["mean"]) < 1e-9 and abs(a["lo"] - b["lo"]) < 1e-9 and abs(a["hi"] - b["hi"]) < 1e-9
