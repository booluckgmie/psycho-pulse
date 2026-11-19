/* Minimal .xlsx reader (no libraries): unzip with the browser's DecompressionStream, read sheet XML.
   Xlsx.read(ArrayBuffer) -> Promise<[{name, table}]> where table is an array of rows (arrays of strings).
   Works with files saved by Excel, LibreOffice, Google Sheets and openpyxl. Everything stays in memory. */
(function (root) {
  const td = new TextDecoder();
  const u16 = (d, o) => d[o] | (d[o + 1] << 8);
  const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

  async function inflate(raw) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("This browser cannot open .xlsx files. Save the sheet as .csv instead, or update your browser.");
    const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  function entries(d) {
    let e = -1;
    for (let i = d.length - 22; i >= Math.max(0, d.length - 66000); i--) if (u32(d, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("This does not look like a valid .xlsx file.");
    const n = u16(d, e + 10); let p = u32(d, e + 16); const out = new Map();
    for (let i = 0; i < n; i++) {
      if (u32(d, p) !== 0x02014b50) throw new Error("The .xlsx file is damaged.");
      const method = u16(d, p + 10), csize = u32(d, p + 20), nl = u16(d, p + 28), xl = u16(d, p + 30), cl = u16(d, p + 32), lho = u32(d, p + 42);
      out.set(td.decode(d.subarray(p + 46, p + 46 + nl)), { method, csize, lho });
      p += 46 + nl + xl + cl;
    }
    return out;
  }

  async function text(d, ents, name) {
    const e = ents.get(name); if (!e) return null;
    const start = e.lho + 30 + u16(d, e.lho + 26) + u16(d, e.lho + 28), raw = d.subarray(start, start + e.csize);
    if (e.method === 0) return td.decode(raw);
    if (e.method === 8) return td.decode(await inflate(raw));
    throw new Error("Unsupported .xlsx compression.");
  }

  const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, g) => {
    if (g[0] === "#") return String.fromCodePoint(g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : +g.slice(1));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[g.toLowerCase()];
  });
  const attrs = s => { const o = {}; for (const m of s.matchAll(/([\w:.-]+)="([^"]*)"/g)) o[m[1]] = unesc(m[2]); return o; };
  const texts = x => [...x.replace(/<rPh\b.*?<\/rPh>/gs, "").matchAll(/<t\b[^>]*>(.*?)<\/t>/gs)].map(m => unesc(m[1])).join("");
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  function parseSheet(xml, shared) {
    const table = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>(.*?)<\/row>)/gs)) {
      const row = [];
      for (const cm of (rm[1] || "").matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
        const a = attrs(cm[1]), body = cm[2] || "", v = (body.match(/<v>(.*?)<\/v>/s) || [])[1];
        let val = "";
        if (a.t === "s" && v !== undefined) val = shared[+v] ?? "";
        else if (a.t === "inlineStr") val = texts(body);
        else if (v !== undefined) val = unesc(v);
        row[a.r ? colIndex(a.r) : row.length] = val;
      }
      table.push(Array.from(row, c => (c === undefined ? "" : String(c))));
    }
    return table;
  }

  async function read(buf) {
    const d = new Uint8Array(buf), ents = entries(d);
    const wb = await text(d, ents, "xl/workbook.xml");
    if (!wb) throw new Error("This does not look like an Excel workbook.");
    const rels = await text(d, ents, "xl/_rels/workbook.xml.rels") || "";
    const target = {}; for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) { const a = attrs(m[1]); target[a.Id] = a.Target; }
    const ss = await text(d, ents, "xl/sharedStrings.xml");
    const shared = ss ? [...ss.matchAll(/<si\b[^>]*?(?:\/>|>(.*?)<\/si>)/gs)].map(m => texts(m[1] || "")) : [];
    const out = [];
    for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const a = attrs(m[1]), t = target[a["r:id"]]; if (!t) continue;
      const path = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
      const xml = await text(d, ents, path); if (xml == null) continue;
      out.push({ name: a.name, table: parseSheet(xml, shared) });
    }
    if (!out.length) throw new Error("No sheets found in this workbook.");
    return out;
  }

  const api = { read };
  if (typeof module !== "undefined") module.exports = api; else root.Xlsx = api;
})(typeof window !== "undefined" ? window : globalThis);
