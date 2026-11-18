// Records stills of the LIVE dashboard (sample data only) for the video.
const {chromium}=require('playwright');
const URL=process.argv[2]||'https://psycho-pulse.vercel.app/';
const OUT=process.argv[3]||'assets';
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2,colorScheme:'light'});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.click('#sample');await p.waitForSelector('#out:not([hidden])');
  await p.waitForTimeout(800);
  await p.locator('#tiles').screenshot({path:OUT+'/tiles.png'});
  await p.locator('#ready').screenshot({path:OUT+'/ready.png'});
  await p.locator('#modelcard').screenshot({path:OUT+'/model.png'});
  // pick a student with a falling outlook for the forecast shot
  await p.selectOption('#flt','1');
  const rows=await p.locator('tr.click').all();
  let pick=rows[0];
  for(const r of rows){const t=await r.textContent();if(/floor in|falling/.test(t)){pick=r;break}}
  await pick.click();await p.waitForTimeout(700);
  await p.locator('#detail').screenshot({path:OUT+'/forecast.png'});
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.locator('#rows').locator('xpath=ancestor::div[contains(@class,"card")]').screenshot({path:OUT+'/table.png'});
  await p.locator('#trend').locator('xpath=ancestor::div[contains(@class,"card")]').screenshot({path:OUT+'/trend.png'});
  console.log('captured from',URL,'errors:',errs);
  await b.close();
})();
