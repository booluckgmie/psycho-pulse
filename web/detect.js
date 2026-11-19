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

  function parseCSVTable(text) {
    const lines = text.replace(/^\ufeff/, "").replace(/\r/g, "").split("\n").filter(l => l.trim());
    const first = lines[0] || "", count = ch => first.split(ch).length;
    const d = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";   // Excel in some locales exports ; or tabs
    const split = l => { const o = []; let c = "", q = false;
      for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) { o.push(c); c = ""; } else c += ch; }
      o.push(c); return o.map(x => x.trim()); };
    return lines.map(split);
  }
  function parseCSV(text) {
    const t = parseCSVTable(text); if (!t.length) return [];
    return t.slice(1).map(v => { const r = {}; t[0].forEach((h, i) => r[h] = v[i] ?? ""); return r; });
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

  function tierFor(med) {
    if (med < 3) return { tier: "Not enough", advice: "Need at least 3 screenings per student before any trend can be judged. Only a single very low score can be noticed." };
    if (med < 5) return { tier: "Early signals", advice: "Useful for obvious drops only. Forecast is rough. Add screenings weekly to reach 5." };
    if (med < 8) return { tier: "Usable", advice: "Reasonable detection and forecasts. 8+ screenings gives much better coverage." };
    return { tier: "Reliable", advice: "Enough history for stable detection and forecasts." };
  }

  // How much can a teacher trust the output? Based on screenings per student and group size.
  function readiness(rawRows) {
    const rows = validate(rawRows), out = [];
    for (const [cls, g] of group(rows, r => r.class)) {
      const per = [...group(g, r => r.student_id)].map(([, x]) => new Set(x.map(r => r.week)).size);
      const students = per.length, screenings = Math.min(...per), med = median(per);
      let { tier, advice } = tierFor(med);
      if (students < 6) advice += " With fewer than 6 students, alerts are unstable and class-wide effects cannot be separated from individual change. 10 or more is recommended.";
      out.push({ class: cls, students, screenings, median: med, tier, advice });
    }
    return out.sort((a, b) => a.class.localeCompare(b.class));
  }

  // ---- Spreadsheet intake -------------------------------------------------------------------
  // Accepts [{name, table}] (table = array of rows) from an .xlsx or .csv and returns {rows, notes}.
  // Two layouts: WIDE (one row per student, columns "Week 1", "Week 2"...; optional Attendance and
  // Late work sheets) and LONG (one row per student per week: student_id, class, week, score...).
  const norm = h => String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const blank = v => String(v ?? "").trim() === "";
  const IGNORE = /^(read_?me|example|examples|guide|instructions|help)/;
  const weekOf = h => { const m = String(h).trim().match(/^(?:week|wk|w)[\s_.-]*0*(\d+)$/i) || String(h).trim().match(/^0*(\d+)$/); return m ? +m[1] : null; };

  function headOf(table) {
    const i = table.findIndex(r => r.some(c => !blank(c)));
    if (i < 0) return null;
    const head = table[i].map(c => String(c ?? "").trim());
    return { head, first: i, body: table.slice(i + 1).map((r, k) => ({ r, line: i + 2 + k })).filter(x => x.r.some(c => !blank(c))) };
  }
  const idCol = head => head.findIndex(h => ["student_id", "student", "id", "studentid", "student_no", "student_number"].includes(norm(h)));
  const clsCol = head => head.findIndex(h => norm(h) === "class");

  function readWide(sheet, label, kind) {
    const H = headOf(sheet.table); if (!H) return new Map();
    const ic = idCol(H.head);
    if (ic < 0) throw new Error(label + ': add a "Student ID" column.');
    const cc = clsCol(H.head), weeks = H.head.map((h, i) => [weekOf(h), i]).filter(([w]) => w !== null);
    const seenW = new Set(); weeks.forEach(([w]) => { if (seenW.has(w)) throw new Error(label + ": Week " + w + " appears twice in the header."); seenW.add(w); });
    const out = new Map(), seenId = new Map();
    for (const { r, line } of H.body) {
      const id = String(r[ic] ?? "").trim(), cells = weeks.filter(([, i]) => !blank(r[i]));
      if (!id) { if (cells.length) throw new Error(label + ", row " + line + ": there are values but no Student ID."); continue; }
      if (/\s/.test(id)) throw new Error(label + ", row " + line + ': Student ID "' + id + '" must not contain spaces.');
      if (seenId.has(id.toLowerCase())) throw new Error(label + ': Student ID "' + id + '" appears twice (rows ' + seenId.get(id.toLowerCase()) + " and " + line + ").");
      seenId.set(id.toLowerCase(), line);
      const cls = cc >= 0 && !blank(r[cc]) ? String(r[cc]).trim() : "Class";
      for (const [w, i] of cells) {
        const raw = String(r[i]).trim().replace(/^(\d+),(\d+)$/, "$1.$2"), v = Number(raw);
        if (raw === "" || Number.isNaN(v)) throw new Error(label + ", " + id + ", Week " + w + ': "' + String(r[i]).trim() + '" is not a number.');
        if (kind === "score" && (v < 1 || v > 10)) throw new Error(label + ", " + id + ", Week " + w + ": score " + v + " must be between 1 and 10.");
        if (kind === "attendance" && (v < 0 || v > 100)) throw new Error(label + ", " + id + ", Week " + w + ": attendance " + v + " must be between 0 and 100.");
        if (kind === "late" && v < 0) throw new Error(label + ", " + id + ", Week " + w + ": late work cannot be negative.");
        out.set(id + "|" + w, { student_id: id, class: cls, week: w, value: v });
      }
    }
    return out;
  }

  function normalizeSheets(input) {
    const sheets = (Array.isArray(input) ? input : Object.entries(input).map(([name, table]) => ({ name, table })))
      .filter(s => !IGNORE.test(norm(s.name)));
    const info = sheets.map(s => ({ s, H: headOf(s.table) })).filter(x => x.H);
    const isLong = x => { const n = x.H.head.map(norm); return n.includes("week") && n.includes("score"); };
    const long = info.find(isLong);
    if (long) {                                     // LONG layout: pass through, trimmed
      const { head, body } = long.H;
      if (!body.length) throw new Error("The file has column headings but no data rows.");
      return { rows: body.map(({ r }) => { const o = {}; head.forEach((h, i) => { if (h) o[norm(h) === "student" ? "student_id" : norm(h)] = String(r[i] ?? "").trim(); }); return o; }), notes: [] };
    }
    const find = re => info.find(x => re.test(norm(x.s.name)));
    const sc = find(/^scores?/) || info.find(x => x.H.head.some(h => weekOf(h) !== null));
    if (!sc) throw new Error('No scores found. Use the template: one row per student with "Week 1", "Week 2"... columns.');
    const scores = readWide(sc.s, sc.s.name || "Scores", "score");
    if (!scores.size) throw new Error("No scores found. Fill in at least one Week column for at least one student.");
    const notes = [], att = find(/^attendance/), late = find(/^late/);
    const A = att ? readWide(att.s, att.s.name, "attendance") : new Map(), L = late ? readWide(late.s, late.s.name, "late") : new Map();
    const orphans = [...A.keys(), ...L.keys()].filter(k => !scores.has(k)).length;
    if (orphans) notes.push(orphans + " attendance / late-work value(s) had no matching score and were ignored.");
    const rows = [...scores.values()].map(x => {
      const k = x.student_id + "|" + x.week, o = { student_id: x.student_id, class: x.class, week: x.week, score: x.value };
      if (A.has(k)) o.attendance_pct = A.get(k).value;
      if (L.has(k)) o.late_submissions = L.get(k).value;
      return o;
    });
    return { rows, notes };
  }

  const api = { CFG, LEVELS, parseCSV, parseCSVTable, validate, timeline, latestAlerts, rebuild, forecast, readiness, tierFor, normalizeSheets, EARLY };
  if (typeof module !== "undefined") module.exports = api; else root.Pulse = api;
})(typeof window !== "undefined" ? window : globalThis);
