/* Score entry form: tabs + a grid (one row per student, one cell per week). Nothing is stored. */
(function () {
  const $ = id => document.getElementById(id);
  const EXAMPLE = [
    ["S01", 7.5, 7.2, 6.8, 6.1, 5.4], ["S02", 7.0, 7.1, 7.0, 7.3, 7.1], ["S03", 6.8, 6.9, 6.6, 6.8, 6.7],
    ["S04", 7.4, 7.2, 7.5, 7.3, 7.4], ["S05", 7.9, 7.7, 7.8, 8.0, 7.7], ["S06", 7.1, 7.0, 7.2, 6.9, 7.0],
    ["S07", 6.9, 6.5, 6.0, 5.4, 4.9], ["S08", 7.5, 7.4, 7.6, 7.5, 7.3],
  ];
  const MIN_ROWS = 5;
  let nW = 5, extra = false;
  let rNW = 5, rExtra = false;       // shape of what is currently rendered
  const gbody = $("gbody"), ghead = $("ghead"), fmsg = $("fmsg");

  /* ---- tabs ---- */
  const tabs = [$("tab1"), $("tab2")], panels = [$("p1"), $("p2")];
  function selectTab(i, focus) {
    tabs.forEach((t, k) => { t.setAttribute("aria-selected", k === i); t.tabIndex = k === i ? 0 : -1; panels[k].hidden = k !== i; });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.onclick = () => selectTab(i);
    t.onkeydown = e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); selectTab((i + 1) % 2, true); } };
  });

  /* ---- grid model ---- */
  const ncols = () => 1 + nW + (extra ? 2 : 0);
  const blankRow = () => Array(ncols()).fill("");
  const pad2 = n => String(n).padStart(2, "0");
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const startWeek = () => { const v = parseInt($("f_start").value, 10); return v >= 1 ? v : 1; };

  function read() {
    return [...gbody.rows].map(tr => [...tr.querySelectorAll("input")].map(i => i.value));
  }
  function renderHead() {
    const s = startWeek();
    let h = '<tr><th>#</th><th scope="col">Student ID</th>';
    for (let i = 0; i < nW; i++) h += `<th scope="col">Week ${s + i}</th>`;
    if (extra) h += '<th scope="col">Attendance %<br><small>average</small></th><th scope="col">Late work<br><small>per week</small></th>';
    ghead.innerHTML = h + "<th></th></tr>";
  }
  function render(data) {
    while (data.length < MIN_ROWS) data.push(blankRow());
    const s = startWeek();
    gbody.innerHTML = data.map((row, r) => {
      let h = `<tr><td class="n">${r + 1}</td>`;
      for (let c = 0; c < ncols(); c++) {
        const v = esc(row[c] ?? "");
        if (c === 0) h += `<td><input class="id" data-r="${r}" data-c="0" value="${v}" placeholder="S${pad2(r + 1)}" aria-label="Row ${r + 1} Student ID" autocomplete="off" maxlength="24"></td>`;
        else if (c <= nW) h += `<td><input data-r="${r}" data-c="${c}" value="${v}" inputmode="decimal" aria-label="Row ${r + 1} Week ${s + c - 1} score" autocomplete="off"></td>`;
        else h += `<td><input data-r="${r}" data-c="${c}" value="${v}" inputmode="decimal" aria-label="Row ${r + 1} ${c === nW + 1 ? "attendance percent" : "late work per week"}" autocomplete="off"></td>`;
      }
      return h + `<td><button class="x" type="button" aria-label="Remove row ${r + 1}" data-del="${r}">&times;</button></td></tr>`;
    }).join("");
    rNW = nW; rExtra = extra;
    hint();
  }
  function reflow() {  // after the weeks / extra settings change: keep everything already typed
    const data = read().map(row => {
      const scores = row.slice(1, 1 + rNW), ex = rExtra ? row.slice(1 + rNW, 3 + rNW) : ["", ""];
      while (scores.length < nW) scores.push("");
      return [row[0] ?? "", ...scores.slice(0, nW), ...(extra ? ex : [])];
    });
    renderHead(); render(data);
  }

  const num = v => { const t = String(v ?? "").trim().replace(/^(\d+),(\d+)$/, "$1.$2"); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

  /* ---- read + validate the grid ---- */
  function collect() {
    const data = read(), start = parseInt($("f_start").value, 10), cls = $("f_class").value.trim() || "Class";
    const errors = [], rows = [], ids = new Map();
    if (!(start >= 1 && start <= 60)) errors.push({ el: $("f_start"), msg: "First week number must be between 1 and 60." });
    data.forEach((cells, r) => {
      if (!cells.some(c => String(c).trim() !== "")) return;
      const inp = c => gbody.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
      const id = cells[0].trim(), key = id.toLowerCase();
      if (!id) { errors.push({ el: inp(0), msg: `Row ${r + 1}: add a Student ID.` }); return; }
      if (/\s/.test(id)) { errors.push({ el: inp(0), msg: `Row ${r + 1}: ID "${id}" must not contain spaces.` }); return; }
      if (ids.has(key)) { errors.push({ el: inp(0), msg: `Row ${r + 1}: ID "${id}" is already used in row ${ids.get(key)}.` }); return; }
      ids.set(key, r + 1);
      let att = "", late = "";
      if (extra) {
        const a = cells[nW + 1].trim(), l = cells[nW + 2].trim();
        if (a !== "") { const x = num(a); if (x === null || x > 100) errors.push({ el: inp(nW + 1), msg: `${id}: attendance "${a}" must be 0 to 100.` }); else att = x; }
        if (l !== "") { const x = num(l); if (x === null) errors.push({ el: inp(nW + 2), msg: `${id}: late work "${l}" must be a number, 0 or more.` }); else late = x; }
      }
      for (let i = 0; i < nW; i++) {
        const v = String(cells[1 + i]).trim(); if (v === "") continue;
        const x = num(v);
        if (x === null || x < 1 || x > 10) { errors.push({ el: inp(1 + i), msg: `${id}, Week ${start + i}: "${v}" is not a score from 1 to 10.` }); continue; }
        rows.push({ student_id: id, class: cls, week: start + i, score: x, attendance_pct: att, late_submissions: late });
      }
    });
    if (!rows.length && !errors.length) errors.push({ el: null, msg: "Enter at least one student with scores." });
    return { rows, errors };
  }

  function hint() {
    const per = new Map();
    read().forEach(cells => {
      const id = cells[0].trim(); if (!id) return;
      per.set(id, cells.slice(1, 1 + nW).filter(v => { const x = num(v); return x !== null && x >= 1 && x <= 10; }).length);
    });
    const counts = [...per.values()].sort((a, b) => a - b), n = counts.length;
    if (!n) { $("fhint").textContent = "Enter at least 3 scores per student to see a trend (5 or more is recommended)."; return; }
    const med = counts.length % 2 ? counts[counts.length >> 1] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
    const t = Pulse.tierFor(med).tier;
    $("fhint").textContent = `${n} student${n > 1 ? "s" : ""}, median ${med} score${med === 1 ? "" : "s"} each: ${t}.` +
      (n < 6 ? " Fewer than 6 students makes alerts unstable (10 or more is recommended)." : "") + (med < 5 ? " Add more weeks of scores for better results." : "");
  }

  function submit() {
    gbody.querySelectorAll("input.bad").forEach(i => { i.classList.remove("bad"); i.removeAttribute("aria-invalid"); });
    $("f_start").classList.remove("bad");
    const { rows, errors } = collect();
    if (errors.length) {
      errors.forEach(e => { if (e.el) { e.el.classList.add("bad"); e.el.setAttribute("aria-invalid", "true"); } });
      fmsg.textContent = errors.slice(0, 4).map(e => e.msg).join("  ") + (errors.length > 4 ? `  (and ${errors.length - 4} more)` : "");
      const first = errors.find(e => e.el); if (first) first.el.focus();
      return;
    }
    fmsg.textContent = "";
    if (ingestRows(rows, [], true)) $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---- events ---- */
  gbody.addEventListener("input", e => { e.target.classList.remove("bad"); e.target.removeAttribute("aria-invalid"); hint(); });
  gbody.addEventListener("click", e => {
    const b = e.target.closest("button[data-del]"); if (!b) return;
    const data = read(); data.splice(+b.dataset.del, 1); render(data);
  });
  gbody.addEventListener("keydown", e => {
    const el = e.target; if (el.tagName !== "INPUT") return;
    const r = +el.dataset.r, c = +el.dataset.c;
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const nr = e.key === "ArrowUp" ? r - 1 : r + 1;
      if (nr < 0) return;
      if (nr >= gbody.rows.length) { const d = read(); d.push(blankRow()); render(d); }
      const nx = gbody.querySelector(`input[data-r="${nr}"][data-c="${c}"]`); if (nx) { nx.focus(); nx.select(); }
    }
  });
  gbody.addEventListener("paste", e => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!/[\t\n]/.test(text)) return;                       // plain single value: let the browser paste it
    e.preventDefault();
    const el = e.target.closest("input"), r0 = +el.dataset.r, c0 = +el.dataset.c;
    let lines = text.replace(/\r/g, "").split("\n"); while (lines.length && lines[lines.length - 1] === "") lines.pop();
    let cells = lines.map(l => l.split("\t").map(x => x.trim()));
    if (c0 === 0 && cells.length && /^(student|id)\b/i.test(cells[0][0])) cells.shift();       // header row copied along
    if (c0 === 0 && cells.length && cells[0].length > 1 && cells[0][1] !== "" && num(cells[0][1]) === null) {   // template layout: ID, Class, Week 1...
      if (!$("f_class").value.trim()) $("f_class").value = cells[0][1];
      cells = cells.map(r => [r[0], ...r.slice(2)]);
    }
    const data = read();
    while (data.length < r0 + cells.length) data.push(blankRow());
    cells.forEach((row, i) => row.forEach((v, j) => { const c = c0 + j; if (c < ncols()) data[r0 + i][c] = v; }));
    render(data);
  });
  $("f_weeks").onchange = () => { nW = +$("f_weeks").value; reflow(); };
  $("f_start").oninput = () => renderHead();
  $("f_extra").onchange = () => { extra = $("f_extra").checked; reflow(); };
  $("g_add").onclick = () => { const d = read(); d.push(blankRow()); render(d); gbody.querySelector(`input[data-r="${d.length - 1}"][data-c="0"]`).focus(); };
  $("g_add5").onclick = () => { const d = read(); for (let i = 0; i < 5; i++) d.push(blankRow()); render(d); };
  $("g_go").onclick = submit;
  function clear() { $("f_class").value = ""; $("f_start").value = 1; fmsg.textContent = ""; render([]); renderHead(); }
  window.resetForm = clear;
  $("g_clear").onclick = clear;
  $("g_example").onclick = () => {
    $("f_class").value = "5A"; $("f_start").value = 1; nW = 5; $("f_weeks").value = 5; extra = false; $("f_extra").checked = false; fmsg.textContent = "";
    renderHead(); render(EXAMPLE.map(r => r.map(String)));
  };

  /* ---- init ---- */
  for (let i = 3; i <= 12; i++) { const o = document.createElement("option"); o.value = i; o.textContent = i + " weeks"; $("f_weeks").appendChild(o); }
  $("f_weeks").value = nW;
  renderHead(); render([]);
})();
