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
python3 -m pulse.evaluate --study rebuild   # fixed vs rebuilt model
python3 -m pulse.minimum_data      # how little data works (~4 min) -> data/minimum_data.csv
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

## Rebuild, don't store
Every upload (and every extra file added in the same session) rebuilds the model from scratch: \`detect.rebuild()\` re-estimates the
decline, sharp-drop and attendance thresholds from that school's noise level and attendance norm, blended with the defaults by
\`w = rows / (rows + 500)\`. The low-score floor (5.0) is deliberately **not** learned; learning it cost about 15 points of early detection.
Nothing is written to disk or browser storage; \`tests/test_rebuild.py\` fails the build if the web code ever uses storage, cookies or network calls.

\`python3 -m pulse.evaluate --study rebuild\` (40 schools per size, varied noise/level, weekly screening): false alarms fall from about 17% (fixed
defaults) to about 14% (rebuilt) with ~0.1 weeks less lead time and unchanged detection (99%). Gains grow with data and vanish with very little data, as designed.

## Pages
- \`web/index.html\`: dashboard (multi-file upload, in-memory, "Forget all data").
- \`web/methodology.html\`: methodology with interactive demos that run the real engine. Refresh its embedded results with
  \`python3 -m pulse.evaluate && python3 -m pulse.evaluate --study rebuild && python3 -m pulse.build_site\`.

## Small data: how much does a teacher need?
Teachers can type scores straight into the dashboard (`S01, 7.5, 7.0, 6.1`) with no attendance or spreadsheet; the dashboard shows a readiness tier,
an **Outlook** column and a forecast plot (4 weeks ahead, ~80% band) per student. With 8 or fewer screenings per student the model switches to a more
sensitive **early mode** (decline 0.8 / sharp drop 1.2 / floor 5.5). Groups under 5 students skip the class adjustment because the median would absorb the student's own decline.

| Screenings per student | Tier | Simulation (class of 10-30) |
|---|---|---|
| under 3 | Not enough | no trend possible |
| 3-4 | Early signals | ~half of flags false; real declines barely visible yet |
| 5-7 | Usable (**recommended minimum: 5 screenings, 10+ students; 6 students absolute minimum**) | 45-70% of declining students caught, 1-4% of healthy flagged, 69-91% of flags real |
| 8+ | Reliable | 76-92% caught, 0.2-4% healthy flagged, 81-98% of flags real |

Forecast: the 80% band held about 77% of the time (65-84%); 3-weeks-ahead error is 0.6-0.9 points with 5+ screenings (about 1.2 with 3).
Classes of 4 gave up to 19% false alarms, hence the 6-student minimum. All figures are synthetic (single class, ~20% declining, noise sd 0.45).

## Deploy (Vercel)
Static site, no build step: \`vercel.json\` serves \`web/\` with clean URLs (\`/\` dashboard, \`/methodology\`) and security headers.
The CSP allows only same-origin scripts and requests (\`connect-src 'self'\`), so the "nothing leaves your browser" claim is enforced by the browser too.
\`\`\`bash
npm i -g vercel && vercel          # preview;  vercel --prod  to publish
\`\`\`
Or import the GitHub repo in Vercel: Framework **Other**, leave build/install commands empty (they come from \`vercel.json\`).
Before deploying run \`python3 -m pulse.build_site\` so the embedded study results and sample file are current (\`tests/test_deploy.py\` checks the sample).
Python code and tests are excluded via \`.vercelignore\`; they are not needed in production.

## Limits and safeguards
- Adjusted scores are relative to each class's median over the uploaded period, so a long class-wide dip lowers that class's adjusted level by up to ~1 point.
- Synthetic data only. Validate on anonymised real data before any decision.
- Weekly screening trades earlier warning for more false alarms; alerts are a prompt for a private, supportive conversation, never a label or diagnosis.
- Use anonymous IDs only. Never upload names or MyKad. Restrict dashboard access to counsellors and school leaders.
- Audit alert rates by gender, socioeconomic status, language and disability before scaling.

## Roadmap
Pilot one school for 12 weeks and compare alerts with counsellor judgement · tune thresholds · difference-in-differences for teacher transfers · fairness report.
