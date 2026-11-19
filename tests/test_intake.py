"""Templates, the .xlsx reader and the wide/long intake logic (web/xlsx.js + web/detect.js)."""
import csv
import json
import pathlib
import shutil
import subprocess

import pytest
from openpyxl import Workbook, load_workbook

from pulse import detect, template

ROOT = pathlib.Path(__file__).resolve().parents[1]
TPL = ROOT / "web" / "templates"
node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

JS = """
const X=require('./web/xlsx.js'),P=require('./web/detect.js'),fs=require('fs');
(async()=>{
  const [kind,path]=process.argv.slice(1);
  try{
    const sheets=kind==='xlsx'?await X.read(fs.readFileSync(path)):[{name:path,table:P.parseCSVTable(fs.readFileSync(path,'utf8'))}];
    const out=P.normalizeSheets(sheets);
    console.log(JSON.stringify({ok:true,rows:out.rows,notes:out.notes}));
  }catch(e){console.log(JSON.stringify({ok:false,error:e.message}))}
})();
"""


def run(kind, path):
    return json.loads(subprocess.check_output(["node", "-e", JS, kind, str(path)], text=True, cwd=ROOT))


def test_templates_are_generated_and_structured(tmp_path, monkeypatch):
    monkeypatch.setattr(template, "OUT", tmp_path)
    template.main()
    wb = load_workbook(tmp_path / "psychometric-pulse-template.xlsx")
    assert wb.sheetnames == ["Read me", "Scores", "Attendance (optional)", "Late work (optional)", "Example"]
    sc = wb["Scores"]
    assert [c.value for c in sc[1]] == template.HEAD and sc.max_row == 1 + template.ROWS
    dv = sc.data_validations.dataValidation[0]
    assert (dv.formula1, dv.formula2) == ("1", "10")
    assert [c.value for c in wb["Example"][2]][:3] == ["S01", "5A", 7.5]
    with open(tmp_path / "psychometric-pulse-template.csv") as f:
        assert next(csv.reader(f)) == template.HEAD
    assert (tmp_path / "psychometric-pulse-advanced.xlsx").exists() and (tmp_path / "psychometric-pulse-advanced.csv").exists()


def test_shipped_templates_match_generator(tmp_path, monkeypatch):
    monkeypatch.setattr(template, "OUT", tmp_path)
    template.main()
    for name in ("psychometric-pulse-template.csv", "psychometric-pulse-advanced.csv"):
        assert (tmp_path / name).read_text() == (TPL / name).read_text()
    assert sorted(p.name for p in TPL.iterdir()) == sorted(p.name for p in tmp_path.iterdir())


def _fill(path, scores, att=None, late=None):
    wb = load_workbook(TPL / "psychometric-pulse-template.xlsx")
    for sh, data in ((wb["Scores"], scores), (wb["Attendance (optional)"], att), (wb["Late work (optional)"], late)):
        for r, (sid, cls, vals) in enumerate(data or [], start=2):
            sh.cell(r, 1, sid); sh.cell(r, 2, cls)
            for i, v in enumerate(vals):
                if v is not None:
                    sh.cell(r, 3 + i, v)
    wb.save(path)


@node
def test_filled_excel_template_round_trips_through_browser_reader(tmp_path):
    p = tmp_path / "filled.xlsx"
    _fill(p, [("S01", "5A", [7.5, 7.2, 6.8, 6.1, 5.4]), ("S02", "5A", [7.0, None, 7.0, 7.3, 7.1])],
          [("S01", "5A", [96, 95, 92, 88, 80]), ("S02", "5A", [98, 97, None, 99, 98])],
          [("S01", "5A", [0, 0, 1, 2, 4]), ("S02", "5A", [0, 0, 0, 0, 1])])
    out = run("xlsx", p)
    assert out["ok"]
    rows = {(r["student_id"], r["week"]): r for r in out["rows"]}
    assert len(rows) == 9                                   # the empty S02 week-2 cell is skipped
    assert rows[("S01", 5)] == {"student_id": "S01", "class": "5A", "week": 5, "score": 5.4, "attendance_pct": 80, "late_submissions": 4}
    assert ("S02", 2) not in rows
    assert any("2 attendance / late-work" in n for n in out["notes"])   # values without a matching score are reported


@node
def test_untouched_templates_give_friendly_errors():
    assert "No scores found" in run("xlsx", TPL / "psychometric-pulse-template.xlsx")["error"]
    assert "no data rows" in run("xlsx", TPL / "psychometric-pulse-advanced.xlsx")["error"]
    assert "No scores found" in run("csv", TPL / "psychometric-pulse-template.csv")["error"]


@node
def test_example_sheet_is_ignored_even_when_scores_sheet_is_empty(tmp_path):
    p = tmp_path / "x.xlsx"; wb = load_workbook(TPL / "psychometric-pulse-template.xlsx"); wb.save(p)   # Example sheet is filled
    assert not run("xlsx", p)["ok"]


@node
@pytest.mark.parametrize("name,text,expect", [
    ("semicolon_decimal_comma", "Student ID;Class;Week 1;Week 2;Week 3\nS1;5A;7,5;7,0;6,1\n", [7.5, 7.0, 6.1]),
    ("bom_and_odd_headers", "﻿id,class,Wk 5,W6,7\nS1,5A,7.5,7.0,6.1\n", [7.5, 7.0, 6.1]),
    ("tab_separated", "Student ID\tWeek 1\tWeek 2\tWeek 3\nS1\t7.5\t7.0\t6.1\n", [7.5, 7.0, 6.1]),
])
def test_wide_csv_variants(tmp_path, name, text, expect):
    p = tmp_path / f"{name}.csv"; p.write_text(text, encoding="utf-8")
    out = run("csv", p)
    assert out["ok"], out
    assert [r["score"] for r in out["rows"]] == expect
    if name == "bom_and_odd_headers":
        assert [r["week"] for r in out["rows"]] == [5, 6, 7]


@node
@pytest.mark.parametrize("text,fragment", [
    ("Student ID,Class,Week 1,Week 2\nS1,5A,11,7\n", "must be between 1 and 10"),
    ("Student ID,Class,Week 1,Week 2\nS1,5A,abc,7\n", "is not a number"),
    ("Student ID,Class,Week 1,Week 2\nS1,5A,7,7\ns1,5A,6,6\n", "appears twice"),
    ("Student ID,Class,Week 1,Week 2\nS 1,5A,7,7\n", "must not contain spaces"),
    ("Student ID,Class,Week 1,Week 2\n,5A,7,7\n", "no Student ID"),
    ("Name,Week 1,Week 2\nAmy,7,7\n", 'add a "Student ID" column'),
    ("Student ID,Week 1,Week 1\nS1,7,7\n", "appears twice in the header"),
])
def test_wide_input_errors_name_the_problem(tmp_path, text, fragment):
    p = tmp_path / "bad.csv"; p.write_text(text)
    out = run("csv", p)
    assert not out["ok"] and fragment in out["error"], out


@node
def test_long_format_passes_through_unchanged():
    out = run("csv", ROOT / "data" / "sample_school_upload.csv")
    assert out["ok"] and len(out["rows"]) == 1440
    assert {"student_id", "class", "week", "score", "attendance_pct", "late_submissions"} <= set(out["rows"][0])


@node
def test_template_data_flows_into_the_engine(tmp_path):
    p = tmp_path / "f.xlsx"
    _fill(p, [(f"S{i:02d}", "5A", s) for i, s in enumerate(
        [[7.5, 7.2, 6.8, 6.1, 5.4], [7.0, 7.1, 7.0, 7.3, 7.1], [6.8, 6.9, 6.6, 6.8, 6.7], [7.4, 7.2, 7.5, 7.3, 7.4],
         [7.9, 7.7, 7.8, 8.0, 7.7], [7.1, 7.0, 7.2, 6.9, 7.0], [6.9, 6.5, 6.0, 5.4, 4.9], [7.5, 7.4, 7.6, 7.5, 7.3]], start=1)])
    rows = run("xlsx", p)["rows"]
    import pandas as pd
    alerts, cfg, rep = detect.analyse(pd.DataFrame(rows))
    flagged = set(alerts[alerts.level_rank >= 2].student_id)
    assert {"S01", "S07"} <= flagged and rep["mode"] == "early"
    assert len(flagged) <= 3                                  # the five stable students are not flagged


@node
def test_tiers():
    js = "const P=require('./web/detect.js');console.log(JSON.stringify([2,3,4,5,7,8,12].map(m=>P.tierFor(m).tier)))"
    assert json.loads(subprocess.check_output(["node", "-e", js], text=True, cwd=ROOT)) == [
        "Not enough", "Early signals", "Early signals", "Usable", "Usable", "Reliable", "Reliable"]
