import pandas as pd
import pytest

from pulse import detect
from pulse.simulate import simulate


def _student(sid, scores, att=96, late=0, cls="5A"):
    return pd.DataFrame([dict(student_id=sid, **{"class": cls}, week=i + 1, score=s,
                              attendance_pct=att, late_submissions=late)
                         for i, s in enumerate(scores)])


def _school(target_scores, **kw):
    """Target student plus 8 stable classmates so class medians are stable."""
    mates = [_student(f"M{i}", [7.5] * len(target_scores)) for i in range(8)]
    return pd.concat([_student("T", target_scores, **kw)] + mates)


def level(df, sid="T"):
    return detect.latest_alerts(df).set_index("student_id").loc[sid, "level"]


def test_stable_student_is_green():
    assert level(_school([7.5, 7.4, 7.6, 7.5, 7.4])) == "Green"


def test_single_bad_week_is_not_orange():
    assert level(_school([7.5, 7.5, 7.5, 6.5])) in ("Green", "Yellow")


def test_sustained_decline_is_orange():
    assert level(_school([7.5, 7.5, 7.0, 6.0, 4.8])) == "Orange"


def test_decline_plus_attendance_is_red():
    assert level(_school([7.5, 7.5, 7.0, 6.0, 4.8], att=70)) == "Red"


def test_class_wide_dip_is_not_attributed_to_student():
    # whole class drops together (teacher transfer): student's adjusted score stays normal
    n = 5
    df = pd.concat([_student(f"C{i}", [7.5, 7.5, 7.5, 4.8, 4.8]) for i in range(9)])
    assert (detect.latest_alerts(df)["level_rank"] < 2).all()


def test_validation():
    with pytest.raises(ValueError):
        detect.validate(pd.DataFrame({"student_id": ["a"]}))
    bad = _student("T", [7, 7]); bad.loc[1, "week"] = 1
    with pytest.raises(ValueError):
        detect.validate(bad)
    with pytest.raises(ValueError):
        detect.validate(_student("T", [11.0]))


def test_sample_data_finds_at_risk_students():
    df, truth = simulate(seed=3)
    alerts = detect.latest_alerts(df).set_index("student_id")
    risk = truth[truth.at_risk].student_id
    caught = (alerts.loc[risk, "level_rank"] >= 2).mean()
    assert caught >= 0.8
