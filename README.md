# Psychometric-Pulse
**Early Wellbeing Detection System for Schools** · *Sistem Pengesanan Awal Kesejahteraan Murid*
> Notice early. Support early. · *Perhati awal. Sokong awal.*

Hypothesis: screening students more often than once a year finds struggling students sooner, provided
school-wide changes (a teacher transfer, exam week) are separated from individual decline.

## Quick start
```bash
pip install -r requirements.txt
python3 -m pulse.simulate          # data/sample_school_upload.csv (+ hidden ground truth)
python3 -m pulse.template          # data/school_upload_template.{csv,xlsx}
python3 -m pulse.evaluate          # frequency study -> data/evaluation.csv
python3 -m pytest                  # unit + Python/JS parity tests
python3 -m http.server             # then open http://localhost:8000/web/
```
The dashboard (`web/index.html`) runs fully in the browser: a school uploads its CSV and nothing leaves the machine.

## How detection works
1. **Environment adjustment**: subtract each class's weekly median deviation (small classes use the whole school), so a class-wide dip does not read as individual risk.
2. **Signals** on the adjusted score: *low* (< 5.0), *3-screening decline* (smoothed fall ≥ 1.6), *sharp drop* (≥ 2.0 below own baseline).
3. **Level**: Red = signal + low attendance/late work · Orange = signal · Yellow = mild one-step drop · Green.

Rules live in `pulse/detect.py` and are mirrored in `web/detect.js`; `tests/test_parity.py` keeps them identical.

## Synthetic frequency study (30 simulated schools × 120 students, 24 weeks, ~17% at risk)
```
                  frequency  detected  before_crisis  lead_weeks  false_alarm
                     weekly     1.000          0.992       2.886        0.070
weekly (no env. adjustment)     1.000          0.997       4.118        0.174
                fortnightly     1.000          0.927       2.130        0.050
                    monthly     0.998          0.705       0.813        0.027
                     termly     0.539          0.171      -1.745        0.011
```
*detected* = at-risk students ever flagged · *before_crisis* = flagged before latent score < 4.5 · *lead_weeks* = mean weeks of warning · *false_alarm* = healthy students flagged at least once.
Thresholds were tuned on this same synthetic generator, so these numbers show the mechanism, not real-world performance.

## Limits and safeguards
- Synthetic data only. Validate on anonymised real data before any decision.
- Weekly screening trades earlier warning for more false alarms; alerts are a prompt for a private, supportive conversation, never a label or diagnosis.
- Use anonymous IDs only. Never upload names or MyKad. Restrict dashboard access to counsellors and school leaders.
- Audit alert rates by gender, socioeconomic status, language and disability before scaling.

## Roadmap
Pilot one school for 12 weeks and compare alerts with counsellor judgement · tune thresholds · difference-in-differences for teacher transfers · fairness report.
