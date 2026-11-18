/* Browser mirror of pulse/detect.py. Keep rules identical (see tests/test_parity.py). */
(function (root) {
  const CFG = { low: 5.0, trendDrop: 1.6, sharpDrop: 2.0, baselineN: 3,
    lowAtt: 85, lateLimit: 3, minClass: 5 };
  const LEVELS = ["Green", "Yellow", "Orange", "Red"];
  const REQUIRED = ["student_id", "week", "score"];
  const EARLY = { low: 5.5, trendDrop: 0.8, sharpDrop: 1.2, baselineN: 3, lowAtt: 85, lateLimit: 3, minClass: 5 };
  const EARLY_MAX = 8;

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  function median(a) {
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function group(rows, keyFn) {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); (m.get(k) || m.set(k, []).get(k)).push(r); }
    return m;
  }

  function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
    const split = l => { const o = []; let c = "", q = false;
      for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; }
      o.push(c); return o; };
    const head = split(lines[0]).map(h => h.trim());
    return lines.slice(1).map(l => { const v = split(l), r = {}; head.forEach((h, i) => r[h] = (v[i] ?? "").trim()); return r; });
  }

  function validate(rows) {
    if (!rows.length) throw new Error("File has no data rows");
    const miss = REQUIRED.filter(c => !(c in rows[0]));
    if (miss.length) throw new Error("Missing required columns: " + miss.join(", "));
    const seen = new Set(), num = (v, d) => (v === undefined || v === "" ? d : +v);
    return rows.map((r, i) => {
      const o = { ...r, class: r.class || "Class", week: +r.week, score: +r.score,
        attendance_pct: num(r.attendance_pct, 100), late_submissions: num(r.late_submissions, 0) };
      if ([o.week, o.score, o.attendance_pct, o.late_submissions].some(Number.isNaN) || !r.student_id)
        throw new Error("Row " + (i + 2) + " has blank or non-numeric required values");
      if (o.score < 1 || o.score > 10) throw new Error("Row " + (i + 2) + ": score must be 1-10");
      const k = o.student_id + "|" + o.week;
      if (seen.has(k)) throw new Error("Row " + (i + 2) + ": duplicate student/week");
      seen.add(k); return o;
    });
  }

  // Environment adjustment: class-week median vs the class's own median (small classes -> whole school).
  function prep(rows, cfg) {
    const all = median(rows.map(r => r.score));
    const schoolWk = new Map([...group(rows, r => r.week)].map(([k, g]) => [k, median(g.map(r => r.score))]));
    const schoolN = new Map([...group(rows, r => r.week)].map(([k, g]) => [k, g.length]));
    const clsAll = new Map([...group(rows, r => r.class)].map(([k, g]) => [k, median(g.map(r => r.score))]));
    const clsWk = new Map([...group(rows, r => r.class + "|" + r.week)].map(([k, g]) => [k, [median(g.map(r => r.score)), g.length]]));
    for (const r of rows) {
      const [m, n] = clsWk.get(r.class + "|" + r.week);
      r.env_effect = n >= cfg.minClass ? m - clsAll.get(r.class) : (schoolN.get(r.week) >= cfg.minClass ? schoolWk.get(r.week) - all : 0);
      r.adjusted = r.score - r.env_effect;
    }
    return rows;
  }

  // Model rebuild: re-estimate thresholds from the data in memory. Mirrors pulse/detect.py rebuild().
  const PRIOR_OBS = 500, TREND_K = 3.55, SHARP_K = 4.45;
  const madSd = x => { if (!x.length) return 0; const m = median(x); return 1.4826 * median(x.map(v => Math.abs(v - m))); };
  const r4 = v => Math.round(v * 1e4) / 1e4;
  function pickBase(rows) {
    const per = [...group(rows, r => r.student_id)].map(([, g]) => new Set(g.map(r => r.week)).size);
    const med = median(per);
    return med <= EARLY_MAX ? [EARLY, "early", med] : [CFG, "standard", med];
  }
  function rebuild(rawRows, base = null) {
    const valid = validate(rawRows);
    let mode = "custom", med;
    if (!base) [base, mode, med] = pickBase(valid);
    const rows = prep(valid, base), diffs = [], starts = [];
    for (const [, g] of group(rows, r => r.student_id)) {
      g.sort((a, b) => a.week - b.week);
      const a = g.map(r => r.adjusted);
      for (let i = 1; i < a.length; i++) diffs.push(a[i] - a[i - 1]);
      if (a.length >= base.baselineN) starts.push(mean(a.slice(0, base.baselineN)));
    }
    const n = rows.length, w = n / (n + PRIOR_OBS);
    const noise = diffs.length >= 20 ? madSd(diffs) / Math.SQRT2 : null;
    const attS = madSd(rows.map(r => r.attendance_pct)), attC = median(rows.map(r => r.attendance_pct));
    const blend = (d, t, lo, hi) => (t == null || !isFinite(t) || t <= 0) ? d : r4(w * Math.min(Math.max(t, lo), hi) + (1 - w) * d);
    const cfg = { ...base,
      trendDrop: blend(base.trendDrop, noise ? TREND_K * noise : null, 0.8, 2.5),
      sharpDrop: blend(base.sharpDrop, noise ? SHARP_K * noise : null, 1.2, 3.5),
      lowAtt: blend(base.lowAtt, attS ? attC - 3 * attS : null, 70, 90) };
    const report = { mode, screenings: med, rows: n, students: new Set(rows.map(r => r.student_id)).size,
      weeks: new Set(rows.map(r => r.week)).size, confidence: +w.toFixed(3),
      noise: noise == null ? null : +noise.toFixed(3),
      noiseUsed: noise ? +(w * noise + (1 - w) * 0.45).toFixed(3) : 0.45 };
    return { cfg, report };
  }

  function timeline(rawRows, cfg = CFG) {
    const rows = prep(validate(rawRows), cfg);
    const out = [];
    for (const [, g] of group(rows, r => r.student_id)) {
      g.sort((a, b) => a.week - b.week);
      const adj = g.map(r => r.adjusted);
      const sm = adj.map((_, i) => mean(adj.slice(Math.max(0, i - 1), i + 1)));
      g.forEach((r, i) => {
        r.low = adj[i] < cfg.low;
        r.trend = i >= 2 && sm[i - 2] > sm[i - 1] && sm[i - 1] > sm[i] && (sm[i - 2] - sm[i]) >= cfg.trendDrop;
        r.sharp = i >= cfg.baselineN && (mean(adj.slice(0, cfg.baselineN)) - sm[i]) >= cfg.sharpDrop;
        const mild = i >= 1 && (sm[i - 1] - sm[i]) >= 0.6;
        const w = g.slice(Math.max(0, i - 2), i + 1);
        r.extra = mean(w.map(x => x.attendance_pct)) < cfg.lowAtt || mean(w.map(x => x.late_submissions)) >= cfg.lateLimit;
        const core = r.low || r.trend || r.sharp;
        r.level_rank = core && r.extra ? 3 : core ? 2 : mild ? 1 : 0;
        r.level = LEVELS[r.level_rank];
        out.push(r);
      });
    }
    return out;
  }

  function latestAlerts(rows, cfg = CFG) {
    const tl = timeline(rows, cfg), last = [];
    for (const [, g] of group(tl, r => r.student_id)) {
      const r = g[g.length - 1];
      r.env_explained = r.score < cfg.low && r.adjusted >= cfg.low;
      last.push(r);
    }
    return last.sort((a, b) => b.level_rank - a.level_rank || a.adjusted - b.adjusted);
  }


  // Indicative straight-line projection of the adjusted score. Mirrors pulse/detect.py forecast().
  function forecast(weeks, adjusted, cfg, noise) {
    const W = 6, H = 4, Z = 1.28, w = weeks.slice(-W), y = adjusted.slice(-W), n = y.length;
    if (n < 3) return null;
    noise = noise || 0.45;
    const xb = mean(w), yb = mean(y), sxx = w.reduce((s, v) => s + (v - xb) ** 2, 0);
    const slope = sxx ? w.reduce((s, v, i) => s + (v - xb) * (y[i] - yb), 0) / sxx : 0;
    const rss = y.reduce((s, v, i) => s + (v - (yb + slope * (w[i] - xb))) ** 2, 0);
    const sd = Math.max(Math.sqrt(rss / (n - 2)), noise), last = weeks[weeks.length - 1], points = [];
    for (let k = 1; k <= H; k++) {
      const x = last + k, m = yb + slope * (x - xb), se = sd * Math.sqrt(1 + 1 / n + (x - xb) ** 2 / sxx);
      points.push({ week: x, mean: m, lo: m - Z * se, hi: m + Z * se });
    }
    const now = yb + slope * (last - xb);
    const toFloor = slope < -0.05 && now > cfg.low ? (cfg.low - now) / slope : null;
    return { slope, fittedNow: now, points, weeksToFloor: toFloor, n };
  }

  // How much can a teacher trust the output? Based on screenings per student and group size.
  function readiness(rawRows) {
    const rows = validate(rawRows), out = [];
    for (const [cls, g] of group(rows, r => r.class)) {
      const per = [...group(g, r => r.student_id)].map(([, x]) => new Set(x.map(r => r.week)).size);
      const students = per.length, screenings = Math.min(...per), med = median(per);
      let tier, advice;
      if (med < 3) { tier = "Not enough"; advice = "Need at least 3 screenings per student before any trend can be judged. Only a single very low score can be noticed."; }
      else if (med < 5) { tier = "Early signals"; advice = "Useful for obvious drops only. Forecast is rough. Add screenings weekly to reach 5."; }
      else if (med < 8) { tier = "Usable"; advice = "Reasonable detection and forecasts. 8+ screenings gives much better coverage."; }
      else { tier = "Reliable"; advice = "Enough history for stable detection and forecasts."; }
      if (students < 6) advice += " With fewer than 6 students, alerts are unstable and class-wide effects cannot be separated from individual change. 10 or more is recommended.";
      out.push({ class: cls, students, screenings, median: med, tier, advice });
    }
    return out.sort((a, b) => a.class.localeCompare(b.class));
  }

  // Teacher quick entry: "S01, 7.5, 7.0, 6.1" per line; optional "class: 5A" and "start: 3" lines.
  function quickEntryToCSV(text) {
    let cls = "Class", start = 1; const lines = ["student_id,class,week,score"];
    for (const raw of text.split("\n")) {
      const l = raw.trim(); if (!l) continue;
      let m = l.match(/^class\s*:\s*(.+)$/i); if (m) { cls = m[1].trim(); continue; }
      m = l.match(/^start\s*:\s*(\d+)$/i); if (m) { start = +m[1]; continue; }
      const parts = l.split(/[\s,;]+/).map(x => x.trim()).filter(x => x !== "");
      const id = parts.shift();
      parts.forEach((v, i) => lines.push([id, cls, start + i, v].join(",")));
    }
    return lines.join("\n");
  }

  const api = { CFG, LEVELS, parseCSV, validate, timeline, latestAlerts, rebuild, forecast, readiness, quickEntryToCSV, EARLY };
  if (typeof module !== "undefined") module.exports = api; else root.Pulse = api;
})(typeof window !== "undefined" ? window : globalThis);
