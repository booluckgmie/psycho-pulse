/* Browser mirror of pulse/detect.py. Keep rules identical (see tests/test_parity.py). */
(function (root) {
  const CFG = { low: 5.0, trendDrop: 1.6, sharpDrop: 2.0, baselineN: 3,
    lowAtt: 85, lateLimit: 3, minClass: 5 };
  const LEVELS = ["Green", "Yellow", "Orange", "Red"];
  const REQUIRED = ["student_id", "class", "week", "score", "attendance_pct", "late_submissions"];

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
    const seen = new Set();
    return rows.map((r, i) => {
      const o = { ...r, week: +r.week, score: +r.score, attendance_pct: +r.attendance_pct, late_submissions: +r.late_submissions };
      if ([o.week, o.score, o.attendance_pct, o.late_submissions].some(Number.isNaN) || !r.student_id || !r.class)
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
    const clsAll = new Map([...group(rows, r => r.class)].map(([k, g]) => [k, median(g.map(r => r.score))]));
    const clsWk = new Map([...group(rows, r => r.class + "|" + r.week)].map(([k, g]) => [k, [median(g.map(r => r.score)), g.length]]));
    for (const r of rows) {
      const [m, n] = clsWk.get(r.class + "|" + r.week);
      r.env_effect = n >= cfg.minClass ? m - clsAll.get(r.class) : schoolWk.get(r.week) - all;
      r.adjusted = r.score - r.env_effect;
    }
    return rows;
  }

  // Model rebuild: re-estimate thresholds from the data in memory. Mirrors pulse/detect.py rebuild().
  const PRIOR_OBS = 500, TREND_K = 3.55, SHARP_K = 4.45;
  const madSd = x => { if (!x.length) return 0; const m = median(x); return 1.4826 * median(x.map(v => Math.abs(v - m))); };
  const r4 = v => Math.round(v * 1e4) / 1e4;
  function rebuild(rawRows, base = CFG) {
    const rows = prep(validate(rawRows), base), diffs = [], starts = [];
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
    const report = { rows: n, students: new Set(rows.map(r => r.student_id)).size,
      weeks: new Set(rows.map(r => r.week)).size, confidence: +w.toFixed(3),
      noise: noise == null ? null : +noise.toFixed(3) };
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

  const api = { CFG, LEVELS, parseCSV, validate, timeline, latestAlerts, rebuild };
  if (typeof module !== "undefined") module.exports = api; else root.Pulse = api;
})(typeof window !== "undefined" ? window : globalThis);
