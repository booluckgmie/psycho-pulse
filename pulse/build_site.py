"""Embeds the evaluation CSVs into web/evaluation.js so the methodology page works from file://."""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    out = {"frequency": pd.read_csv(ROOT / "data/evaluation.csv").to_dict("records"),
           "rebuild": pd.read_csv(ROOT / "data/evaluation_rebuild.csv").to_dict("records")}
    (ROOT / "web/evaluation.js").write_text("window.EVAL = " + json.dumps(out, indent=1) + ";\n")
    print("wrote web/evaluation.js")


if __name__ == "__main__":
    main()
