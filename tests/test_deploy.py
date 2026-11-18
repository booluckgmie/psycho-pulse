import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_vercel_config_is_static_and_strict():
    cfg = json.loads((ROOT / "vercel.json").read_text())
    assert cfg["outputDirectory"] == "web" and cfg["buildCommand"] is None
    csp = next(h["value"] for h in cfg["headers"][0]["headers"] if h["key"] == "Content-Security-Policy")
    assert "script-src 'self'" in csp and "connect-src 'self'" in csp and "unsafe-inline'" not in csp.split("style-src")[0]
    assert (ROOT / "web/index.html").exists()


def test_deployed_sample_matches_data_sample():
    assert (ROOT / "web/sample_school_upload.csv").read_bytes() == (ROOT / "data/sample_school_upload.csv").read_bytes()


def test_no_inline_scripts_or_handlers():
    import re
    for f in (ROOT / "web").glob("*.html"):
        t = f.read_text()
        assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", t), f"inline script in {f.name}"
        assert not re.search(r"\son(click|change|input|load)=", t), f"inline handler in {f.name}"
