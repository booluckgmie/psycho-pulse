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
