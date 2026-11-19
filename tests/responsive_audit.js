// Layout audit used by tests/test_responsive.py. Usage: node responsive_audit.js <baseUrl>
// Prints a JSON list of problems (empty list = pass).
const { chromium } = require('playwright');
const BASE = process.argv[2];
const VPS = [[320, 640], [360, 740], [390, 844], [768, 1024], [1280, 800]];
const STATES = {
  'form': async p => { await p.goto(BASE + '/'); },
  'upload': async p => { await p.goto(BASE + '/'); await p.click('#tab2'); },
  'results': async p => {
    await p.goto(BASE + '/'); await p.click('#sample'); await p.waitForSelector('#out:not([hidden])');
    await p.selectOption('#flt', '1'); await p.locator('tr.click').first().click(); await p.waitForTimeout(300);
  },
  'methodology': async p => { await p.goto(BASE + '/methodology'); },
};
(async () => {
  const b = await chromium.launch(), problems = [];
  for (const [w, h] of VPS) {
    const touch = w < 800, ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    for (const [name, go] of Object.entries(STATES)) {
      await go(p); await p.waitForTimeout(300);
      const r = await p.evaluate(touch => {
        const vw = document.documentElement.clientWidth, out = [];
        const scrollable = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if ((o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
        const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''));
        if (document.documentElement.scrollWidth > vw) out.push('page scrolls sideways: scrollWidth ' + document.documentElement.scrollWidth + ' > ' + vw);
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          if (r.right > vw + 1 && !scrollable(el) && !el.closest('svg') && !el.closest('thead')) out.push('overflows right: ' + label(el) + ' (' + Math.round(r.right) + ' > ' + vw + ')');
          if (touch && el.matches('button,a.btn,nav a.l,select,label.btn,[role=tab],input[type=text],input[type=number],input:not([type])')) {
            if (r.height < 40 || r.width < 40) out.push('small touch target: ' + label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
          if (touch && el.matches('input[type=range]') && r.height < 32) out.push('slider too thin: ' + label(el));
          let fs = parseFloat(cs.fontSize); if (el.closest('svg') && el.getScreenCTM) fs *= el.getScreenCTM().a;
          if (fs < 11 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) out.push('text too small: ' + fs.toFixed(1) + 'px "' + el.textContent.trim().slice(0, 20) + '"');
        }
        return [...new Set(out)];
      }, touch);
      r.forEach(m => problems.push(`${w}x${h} ${name}: ${m}`));
    }
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(problems));
})().catch(e => { console.log(JSON.stringify(['audit crashed: ' + e.message])); });
