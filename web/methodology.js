const $=id=>document.getElementById(id);
const COL={Red:'var(--red)',Orange:'var(--orange)',Yellow:'var(--yellow)',Green:'var(--green)'};
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss=r=>Math.sqrt(-2*Math.log(r()||1e-9))*Math.cos(2*Math.PI*r());
const clip=v=>Math.min(10,Math.max(1,v));

function lineChart(svg,series,w,h,marks=[]){
  const L=30,R=8,T=10,B=24,wk=series[0].pts.map(p=>p[0]);
  const x=v=>L+(v-wk[0])/(wk[wk.length-1]-wk[0])*(w-L-R),y=v=>T+(10-v)/9*(h-T-B);
  let s='';for(let v=1;v<=10;v+=3)s+=`<line x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="2" y="${y(v)+4}" fill="var(--mute)" font-size="10">${v}</text>`;
  wk.forEach(v=>s+=`<text x="${x(v)}" y="${h-7}" font-size="10" fill="var(--mute)" text-anchor="middle">${v}</text>`);
  marks.forEach(([wv,t])=>s+=`<line x1="${x(wv)}" x2="${x(wv)}" y1="${T}" y2="${h-B}" stroke="var(--mute)" stroke-dasharray="3 3"/><text x="${x(wv)+3}" y="${T+9}" font-size="10" fill="var(--mute)">${t}</text>`);
  s+=`<line x1="${L}" x2="${w-R}" y1="${y(5)}" y2="${y(5)}" stroke="var(--red)" stroke-opacity=".5"/><text x="${w-R-4}" y="${y(5)-4}" font-size="10" fill="var(--red)" text-anchor="end">floor 5.0</text>`;
  series.forEach((sr,i)=>{s+=`<polyline fill="none" stroke="${sr.c}" stroke-width="2.6" stroke-linejoin="round" ${sr.d?'stroke-dasharray="6 5"':''} points="${sr.pts.map(p=>x(p[0])+','+y(p[1])).join(' ')}"/>`;
    sr.pts.forEach(p=>s+=`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="3" fill="${sr.c}"/>`);
    s+=`<text x="${L+6+i*150}" y="${h-B-6}" font-size="11" font-weight="600" fill="${sr.c}">${sr.n}</text>`});
  svg.innerHTML=s;
}
const row=(id,cls,week,score,att=95,late=0)=>({student_id:id,class:cls,week:String(week),score:String(score),attendance_pct:String(att),late_submissions:String(late)});

// ---- Demo A: teacher leaves ------------------------------------------------
function demoA(){
  const dip=+$('aDip').value,self=$('aSelf').checked;$('aDipV').textContent=dip.toFixed(1);
  const r=rng(11),rows=[];
  const off=Array.from({length:10},()=>gauss(r)*0.5);
  for(let s=0;s<10;s++)for(let w=1;w<=12;w++){
    let v=7.4+off[s]+gauss(r)*0.35;
    if(w>=6)v-=dip*Math.exp(-(w-6)/8);
    if(s===0&&self&&w>=5)v-=0.3*(w-4);
    rows.push(row('S'+String(s+1).padStart(2,'0'),'5A',w,clip(v).toFixed(1)));
  }
  const tl=Pulse.timeline(rows),me=tl.filter(x=>x.student_id==='S01'),last=me[me.length-1];
  lineChart($('aChart'),[{n:'Raw score',c:'var(--mute)',d:1,pts:me.map(x=>[x.week,x.score])},{n:'Adjusted score',c:'var(--accent)',pts:me.map(x=>[x.week,x.adjusted])}],520,240,[[6,'Teacher change']]);
  $('aOut').innerHTML=`S01 at week 12: <span class="badge" style="background:${COL[last.level]}">${last.level}</span> &nbsp;raw ${last.score.toFixed(1)} &rarr; adjusted ${last.adjusted.toFixed(1)}`;
  $('aWhy').textContent=self
    ?(last.level_rank>=2?'S01 has a real decline on top of the class-wide dip, and the model still catches it.':'S01 is declining, but not enough yet to cross a threshold.')
    :(dip>0.5?'The whole class dipped, so the raw line drops at week 6 but the adjusted line stays level. No alert: this is an environment effect, not S01.':'No class-wide event and no individual decline: nothing to flag.');
}
// ---- Demo B: student ladder ------------------------------------------------
function demoB(){
  const v=id=>+$(id).value,fmt=(id,d=1)=>$(id+'V').textContent=(+$(id).value).toFixed(d);
  fmt('bw4');fmt('bw5');fmt('bw6');fmt('bat',0);fmt('bl',0);
  const rows=[];const r=rng(5);
  for(let m=0;m<8;m++)for(let w=1;w<=6;w++)rows.push(row('M'+m,'5A',w,clip(7.5+gauss(r)*0.25).toFixed(1)));
  const sc=[7.5,7.4,7.6,v('bw4'),v('bw5'),v('bw6')];
  sc.forEach((s,i)=>rows.push(row('YOU','5A',i+1,s,i<3?96:v('bat'),i<3?0:v('bl'))));
  const tl=Pulse.timeline(rows),me=tl.filter(x=>x.student_id==='YOU'),a=me[me.length-1];
  lineChart($('bChart'),[{n:'Raw score',c:'var(--mute)',d:1,pts:me.map(x=>[x.week,x.score])},{n:'Adjusted',c:'var(--accent)',pts:me.map(x=>[x.week,x.adjusted])}],520,200);
  $('bOut').innerHTML=`Alert: <span class="badge" style="background:${COL[a.level]}">${a.level}</span>`;
  const chips=[];if(a.low)chips.push('low score');if(a.trend)chips.push('3-week decline');if(a.sharp)chips.push('sharp drop vs own baseline');if(a.extra)chips.push('attendance / late work');
  $('bWhy').innerHTML=chips.length?chips.map(c=>`<span class="chip">${c}</span>`).join(''):'<span class="note">No signals firing.</span>';
}
// ---- Demo C: confidence ----------------------------------------------------
function demoC(){
  const n=+$('cRows').value,w=n/(n+500);
  $('cRowsV').textContent=n;$('cStu').textContent=Math.round(n/12);
  $('cMeter').style.width=(w*100)+'%';
  $('cNote').textContent=`Weight on this school's own data: ${Math.round(w*100)}%. Weight on defaults: ${Math.round((1-w)*100)}%.`;
  $('cVal').textContent=(w*2.3+(1-w)*1.6).toFixed(2);
}
// ---- Bars ------------------------------------------------------------------
function bars(el,items,max,fmt){
  el.innerHTML=items.map(i=>{const neg=i.v<0;return `<div class="bar"><span>${i.l}</span><span class="track"><i style="width:${Math.min(100,Math.abs(i.v)/max*100)}%;background:${i.c}"></i></span><b>${neg?'':''}${fmt(i.v)}</b></div>`}).join('');
}
function studies(){
  const f=(window.EVAL||{}).frequency||[],r=(window.EVAL||{}).rebuild||[];
  const cols={weekly:'var(--teal)','weekly (no env. adjustment)':'var(--coral)',fortnightly:'var(--violet)',monthly:'var(--sun)',termly:'var(--mute)'};
  bars($('fLead'),f.map(x=>({l:x.frequency.replace(' (no env. adjustment)',' (no adj.)'),v:x.lead_weeks,c:cols[x.frequency]})),5,v=>v.toFixed(1)+' wk');
  bars($('fFa'),f.map(x=>({l:x.frequency.replace(' (no env. adjustment)',' (no adj.)'),v:x.false_alarm,c:cols[x.frequency]})),0.2,v=>Math.round(v*100)+'%');
  const items=[];r.forEach(x=>{items.push({l:x.students+' students, fixed',v:x.fixed_false_alarm,c:'var(--mute)'});items.push({l:x.students+' students, rebuilt',v:x.rebuilt_false_alarm,c:'var(--teal)'})});
  bars($('rFa'),items,0.25,v=>Math.round(v*100)+'%');
  if(r.length){const a=r[r.length-1];$('rNote').textContent=`With ${a.data_rows} rows the rebuilt model flags ${Math.round(a.rebuilt_false_alarm*100)}% of healthy students vs ${Math.round(a.fixed_false_alarm*100)}% for fixed defaults, while still catching ${Math.round(a.rebuilt_before_crisis*100)}% of declining students before crisis (fixed: ${Math.round(a.fixed_before_crisis*100)}%). With very little data the two are almost identical, as designed.`}
}
['aDip','aSelf'].forEach(i=>$(i).addEventListener('input',demoA));
['bw4','bw5','bw6','bat','bl'].forEach(i=>$(i).addEventListener('input',demoB));
$('cRows').addEventListener('input',demoC);
demoA();demoB();demoC();studies();
