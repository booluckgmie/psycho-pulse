import pathlib

from pulse import detect
from pulse.simulate import simulate

ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_small_upload_stays_near_defaults():
    df, _ = simulate(n_students=6, n_weeks=4, seed=1)
    cfg, rep = detect.rebuild(df)
    assert rep["confidence"] < 0.15
    assert abs(cfg.trend_drop - detect.EARLY.trend_drop) < 0.25


def test_mode_follows_history_length():
    short, _ = simulate(n_students=12, n_weeks=5, seed=1, n_classes=1)
    long_, _ = simulate(n_students=12, n_weeks=12, seed=1, n_classes=1)
    assert detect.rebuild(short)[1]["mode"] == "early"
    assert detect.rebuild(long_)[1]["mode"] == "standard"
    assert detect.rebuild(short)[0].low_score == detect.EARLY.low_score


def test_noisier_school_gets_looser_trend_threshold():
    calm, _ = simulate(seed=2, noise_sd=0.3)
    noisy, _ = simulate(seed=2, noise_sd=0.9)
    assert detect.rebuild(noisy)[0].trend_drop > detect.rebuild(calm)[0].trend_drop + 0.4


def test_low_score_floor_is_not_learned():
    low_school, _ = simulate(seed=3, base_mean=6.0)
    assert detect.rebuild(low_school)[0].low_score == detect.Config().low_score


def test_rebuild_does_not_mutate_or_store(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    df, _ = simulate(seed=4)
    before = df.copy()
    detect.analyse(df)
    assert df.equals(before)
    assert list(tmp_path.iterdir()) == []  # nothing written


def test_web_code_never_persists_uploads():
    banned = ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "fetch(\"http", "XMLHttpRequest", "sendBeacon"]
    for f in (ROOT / "web").glob("*.*"):
        if f.suffix in {".js", ".html"}:
            text = f.read_text()
            for b in banned:
                assert b not in text, f"{b} found in {f.name}"


def test_forecast_noise_is_shrunk_towards_default_on_small_data():
    df, _ = simulate(n_students=10, n_weeks=4, seed=1, n_classes=1, noise_sd=0.1)
    rep = detect.rebuild(df)[1]
    assert rep["noise_sd"] < 0.3 and rep["noise_used"] > rep["noise_sd"] + 0.1
