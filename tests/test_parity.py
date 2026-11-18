"""The browser engine (web/detect.js) must give the same alerts as pulse/detect.py."""
import json
import shutil
import subprocess

import pytest

from pulse import detect
from pulse.simulate import simulate

JS = """
const P=require('./web/detect.js'),fs=require('fs');
const a=P.latestAlerts(P.parseCSV(fs.readFileSync(process.argv[1],'utf8')));
console.log(JSON.stringify(a.map(r=>[r.student_id,r.level,+r.adjusted.toFixed(6)])));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_js_matches_python(tmp_path, seed):
    df, _ = simulate(seed=seed)
    p = tmp_path / "u.csv"
    df.to_csv(p, index=False)
    js = json.loads(subprocess.check_output(["node", "-e", JS, str(p)], text=True))
    py = detect.latest_alerts(df)
    pyd = {r.student_id: (r.level, round(r.adjusted, 6)) for r in py.itertuples()}
    assert len(js) == len(pyd)
    for sid, lvl, adj in js:
        assert pyd[sid][0] == lvl
        assert abs(pyd[sid][1] - adj) < 1e-4


REBUILD_JS = """
const P=require('./web/detect.js'),fs=require('fs');
const rows=P.parseCSV(fs.readFileSync(process.argv[1],'utf8'));
const {cfg,report}=P.rebuild(rows);
const a=P.latestAlerts(rows,cfg);
console.log(JSON.stringify({cfg,report,alerts:a.map(r=>[r.student_id,r.level])}));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("kw", [dict(), dict(noise_sd=0.8), dict(noise_sd=0.3, base_mean=6.6)])
def test_rebuilt_model_matches(tmp_path, kw):
    df, _ = simulate(seed=5, **kw)
    p = tmp_path / "u.csv"
    df.to_csv(p, index=False)
    js = json.loads(subprocess.check_output(["node", "-e", REBUILD_JS, str(p)], text=True))
    alerts, cfg, rep = detect.analyse(df)
    assert abs(js["cfg"]["trendDrop"] - cfg.trend_drop) < 1e-3
    assert abs(js["cfg"]["sharpDrop"] - cfg.sharp_drop) < 1e-3
    assert abs(js["cfg"]["lowAtt"] - cfg.low_attendance) < 1e-3
    assert abs(js["report"]["confidence"] - rep["confidence"]) < 1e-3
    pyd = {r.student_id: r.level for r in alerts.itertuples()}
    assert {sid: lvl for sid, lvl in js["alerts"]} == pyd
