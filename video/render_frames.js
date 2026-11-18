// Renders frames by seeking the page to exact times. Usage: node render_frames.js <t0> <t1> <fps> <outdir> [workers]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{
  const [t0,t1,fps,out,W]=[+process.argv[2],+process.argv[3],+process.argv[4],process.argv[5],+(process.argv[6]||4)];
  fs.mkdirSync(out,{recursive:true});
  const b=await chromium.launch();
  const first=Math.round(t0*fps),last=Math.round(t1*fps);
  const idx=[];for(let i=first;i<last;i++)idx.push(i);
  let next=0,done=0;const t_start=Date.now();
  async function worker(){
    const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await p.goto('file://'+path.resolve(__dirname,'scenes.html'));await p.evaluate(()=>document.fonts.ready);
    while(true){const k=next++;if(k>=idx.length)break;const i=idx[k];
      await p.evaluate(t=>window.render(t),i/fps);
      await p.screenshot({path:`${out}/f${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92});
      if(++done%100===0)console.log(`${done}/${idx.length} ${((Date.now()-t_start)/1000).toFixed(0)}s`)}
    await p.close()}
  await Promise.all(Array.from({length:W},worker));await b.close();console.log('done',idx.length)
})();
