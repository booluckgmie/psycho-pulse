"""Embeds the evaluation CSVs into web/evaluation.js so the methodology page works from file://."""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    out = {"frequency": pd.read_csv(ROOT / "data/evaluation.csv").to_dict("records"),
           "rebuild": pd.read_csv(ROOT / "data/evaluation_rebuild.csv").to_dict("records"),
           "minimum": pd.read_csv(ROOT / "data/minimum_data.csv").where(lambda d: d.notna(), None).to_dict("records")}
    (ROOT / "web/evaluation.js").write_text("window.EVAL = " + json.dumps(out, indent=1) + ";\n")
    (ROOT / "web/sample_school_upload.csv").write_bytes((ROOT / "data/sample_school_upload.csv").read_bytes())
    print("wrote web/evaluation.js and web/sample_school_upload.csv")


if __name__ == "__main__":
    main()
