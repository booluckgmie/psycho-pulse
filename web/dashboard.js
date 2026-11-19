const COL={Red:'var(--red)',Orange:'var(--orange)',Yellow:'var(--yellow)',Green:'var(--green)'};
const $=id=>document.getElementById(id);
// In-memory pool only. No browser storage, no network.
let POOL=new Map(),TL=[],ALERTS=[],CFG=null,FC=new Map(),NOISE=null;
const setMsg=(t,c='note')=>{$('msg').textContent=t;$('msg').className=c};

/* Rebuild the model from `pool`; commit to globals only if everything succeeds. */
function analyse(pool,replaced=0,notes=[]){
  try{
    const rows=[...pool.values()];
    const {cfg,report}=Pulse.rebuild(rows);          // model rebuilt from scratch every time
    const tl=Pulse.timeline(rows,cfg),alerts=Pulse.latestAlerts(rows,cfg),ready=Pulse.readiness(rows);
    const fc=new Map(),by=new Map();tl.forEach(r=>{(by.get(r.student_id)||by.set(r.student_id,[]).get(r.student_id)).push(r)});
    by.forEach((g,id)=>fc.set(id,Pulse.forecast(g.map(r=>r.week),g.map(r=>r.adjusted),cfg,report.noiseUsed)));
    POOL=pool;CFG=cfg;NOISE=report.noiseUsed;TL=tl;ALERTS=alerts;FC=fc;
    setMsg(`${report.students} students, ${report.weeks} weeks, ${report.rows} rows in memory`+(replaced?` (${replaced} rows replaced by newer data)`:'')+'.'+(notes.length?' '+notes.join(' '):''));
    $('forget').hidden=false;render(report,ready);return true;
  }catch(e){setMsg(e.message,'err');return false}
}
/* Add rows to what is in memory (or replace it). Rows are plain objects: student_id, class, week, score, ... */
function ingestRows(rows,notes=[],replace=false){
  const next=replace?new Map():new Map(POOL);let replaced=0;
  for(const r of rows){const k=r.student_id+'|'+r.week;if(next.has(k))replaced++;next.set(k,r)}
  return analyse(next,replaced,notes);
}
async function readFile(f){
  const n=f.name.toLowerCase();
  if(n.endsWith('.xlsx'))return Pulse.normalizeSheets(await Xlsx.read(await f.arrayBuffer()));
  if(n.endsWith('.csv'))return Pulse.normalizeSheets([{name:f.name,table:Pulse.parseCSVTable(await f.text())}]);
  throw new Error(`${f.name}: please use .xlsx or .csv (save an older .xls file as .xlsx first).`);
}
async function ingestFiles(files){
  try{
    const res=await Promise.all(files.map(async f=>{
      try{return await readFile(f)}
      catch(e){throw new Error(e.message.startsWith(f.name)?e.message:f.name+': '+e.message)}}));
    ingestRows(res.flatMap(r=>r.rows),res.flatMap(r=>r.notes));
  }catch(e){setMsg(e.message,'err')}
}
function forget(){POOL=new Map();TL=[];ALERTS=[];CFG=null;FC=new Map();$('out').hidden=true;$('forget').hidden=true;$('file').value='';
  if(window.resetForm)window.resetForm();setMsg('All data cleared from memory.')}
$('forget').onclick=forget;
$('file').onchange=e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)ingestFiles(fs)};
const drop=$('drop');
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const fs=[...e.dataTransfer.files];if(fs.length)ingestFiles(fs)});
document.querySelector('label[for=file]').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}};
$('sample').onclick=()=>fetch('sample_school_upload.csv').then(r=>{if(!r.ok)throw 0;return r.text()})
  .then(t=>ingestRows(Pulse.normalizeSheets([{name:'sample.csv',table:Pulse.parseCSVTable(t)}]).rows))
  .catch(()=>setMsg('Sample needs a web server (it cannot load from a local file). Upload sample_school_upload.csv instead.','err'));
$('flt').onchange=$('cls').onchange=table;

const TIER_COL={'Not enough':'var(--red)','Early signals':'var(--orange)','Usable':'var(--teal)','Reliable':'var(--green)'};
function readyPanel(list){
  const worst=list.reduce((a,b)=>a.median<=b.median?a:b);
  const idx={'Not enough':1,'Early signals':2,'Usable':3,'Reliable':4}[worst.tier];
  $('ready').innerHTML=`<h2>How much can you trust this? <span class="tier" style="background:${TIER_COL[worst.tier]}">${worst.tier}</span></h2>
   <div class="steps" aria-hidden="true">${[0,1,2,3].map(i=>`<i class="${i<idx?'on':''}"></i>`).join('')}</div>
   <p class="sub">Recommended: <b>at least 5 screenings per student</b> (weekly for 5 weeks) and <b>10 or more students per class</b> (6 is the minimum). 3 screenings is the absolute minimum, and 8+ is reliable.</p>
   <div class="tbl"><table><thead><tr><th>Class</th><th>Students</th><th>Screenings per student (median)</th><th>Level</th><th>What it means</th></tr></thead><tbody>${list.map(c=>`<tr><td><b>${c.class}</b></td><td>${c.students}</td><td>${c.median}</td><td><span class="tier" style="background:${TIER_COL[c.tier]}">${c.tier}</span></td><td>${c.advice}</td></tr>`).join('')}</tbody></table></div>`;
}
function render(rep,ready){
  $('out').hidden=false;readyPanel(ready);
  $('modelsub').textContent=(rep.mode==='early'?'Early mode: with 8 or fewer screenings per student the model is more sensitive (it needs a smaller fall to alert). ':'Standard mode. ')+`Fitted from ${rep.rows} rows. Estimated week-to-week noise: ${rep.noise==null?'not enough data yet':rep.noise+' points'}.`;
  $('conf').style.width=(rep.confidence*100)+'%';$('confpct').textContent='('+Math.round(rep.confidence*100)+'%)';
  const D=Pulse.CFG,f=(a,b)=>`<tr><td>${a}</td><td>${D[b[0]]}</td><td><b>${CFG[b[0]]}</b></td></tr>`;
  $('params').innerHTML=[['3-screening decline (points)',['trendDrop']],['Sharp drop vs own baseline',['sharpDrop']],['Low attendance (%)',['lowAtt']],[rep.mode==='early'?'Low score floor (fixed, early mode)':'Low score floor (fixed)',['low']]].map(([a,b])=>f(a,b)).join('');
  const cnt={Red:0,Orange:0,Yellow:0,Green:0};ALERTS.forEach(a=>cnt[a.level]++);
  const env=ALERTS.filter(a=>a.env_explained).length;
  $('tiles').innerHTML=['Red','Orange','Yellow','Green'].map(l=>`<div class="tile" style="--c:${COL[l]}"><small>${l}</small><b>${cnt[l]}</b></div>`).join('')
    +`<div class="tile" style="--c:var(--teal)"><small>Dip explained by environment</small><b>${env}</b></div>`;
  const keep=$('cls').value,cls=[...new Set(ALERTS.map(a=>a.class))].sort();
  $('cls').innerHTML='<option value="">All</option>'+cls.map(c=>`<option>${c}</option>`).join('');$('cls').value=cls.includes(keep)?keep:'';
  trend();table();$('detail').hidden=true;
}
function why(a){const w=[];if(a.low)w.push('low score');if(a.trend)w.push('3-week decline');if(a.sharp)w.push('sharp drop vs own baseline');if(a.extra)w.push('attendance / late work');
  return w.map(x=>`<span class="chip">${x}</span>`).join('')+(a.env_explained?'<span class="chip env">dip partly environment</span>':'')||'-'}
function outlook(id){
  const f=FC.get(id);if(!f)return '<span class="note">needs 3+ screenings</span>';
  if(f.weeksToFloor!=null&&f.weeksToFloor<=6)return `<b style="color:var(--red)">&darr; floor in ~${Math.max(1,Math.round(f.weeksToFloor))} wk</b>`;
  if(f.fittedNow<=CFG.low)return '<b style="color:var(--red)">&darr; at/below floor</b>';
  if(f.slope<-0.15)return '<span style="color:var(--orange)">&darr; falling</span>';
  if(f.slope>0.15)return '<span style="color:var(--green)">&uarr; improving</span>';
  return '<span class="note">steady</span>';
}
function table(){
  const min=+$('flt').value,c=$('cls').value;
  const list=ALERTS.filter(a=>a.level_rank>=min&&(!c||a.class===c));
  $('rows').innerHTML=list.map(a=>`<tr class="click" tabindex="0" data-id="${a.student_id}"><td><b>${a.student_id}</b></td><td>${a.class}</td>
    <td><span class="badge" style="background:${COL[a.level]}">${a.level}</span></td><td>${a.score.toFixed(1)}</td><td>${a.adjusted.toFixed(1)}</td><td>${why(a)}</td><td>${outlook(a.student_id)}</td><td>${a.counsellor_followup||'-'}</td></tr>`).join('')||'<tr><td colspan="8">No students at this level.</td></tr>';
  document.querySelectorAll('tr.click').forEach(tr=>{tr.onclick=()=>detail(tr.dataset.id);tr.onkeydown=e=>{if(e.key==='Enter')detail(tr.dataset.id)}});
}
function line(pts,x,y,color,dash){return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" ${dash?'stroke-dasharray="6 5"':''} points="${pts.map(p=>x(p[0])+','+y(p[1])).join(' ')}"/>`}
function chart(svg,series,events,w=900,h=260,fc=null){
  const L=40,R=12,T=12,B=28,wk=[...new Set([...series.flatMap(s=>s.pts.map(p=>p[0])),...(fc?fc.points.map(p=>p.week):[])])].sort((a,b)=>a-b);
  const x=v=>L+(v-wk[0])/(wk[wk.length-1]-wk[0]||1)*(w-L-R),y=v=>T+(10-v)/9*(h-T-B);
  let s='';for(let v=1;v<=10;v+=3)s+=`<line x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="4" y="${y(v)+4}" fill="var(--mute)" font-size="11">${v}</text>`;
  const step=Math.ceil(wk.length/16);wk.forEach((v,i)=>{if(i%step===0)s+=`<text x="${x(v)}" y="${h-8}" font-size="11" fill="var(--mute)" text-anchor="middle">${v}</text>`});
  events.forEach(([week,label],i)=>{s+=`<line x1="${x(week)}" x2="${x(week)}" y1="${T}" y2="${h-B}" stroke="var(--mute)" stroke-dasharray="2 3"/><text x="${x(week)+3}" y="${T+10+(i%2)*12}" font-size="10" fill="var(--mute)">${label}</text>`});
  s+=`<line x1="${L}" x2="${w-R}" y1="${y(CFG.low)}" y2="${y(CFG.low)}" stroke="var(--red)" stroke-opacity=".45"/>`;
  if(fc){const lim=v=>Math.min(10,Math.max(1,v)),last=series[series.length-1].pts.slice(-1)[0],P=fc.points;
    const up=[[last[0],last[1]],...P.map(p=>[p.week,lim(p.hi)])],lo=[...P.map(p=>[p.week,lim(p.lo)])].reverse(),poly=[...up,...lo,[last[0],last[1]]];
    s+=`<polygon points="${poly.map(p=>x(p[0])+','+y(p[1])).join(' ')}" fill="var(--violet)" fill-opacity=".16"/>`;
    s+=line([[last[0],last[1]],...P.map(p=>[p.week,lim(p.mean)])],x,y,'var(--violet)',1);
    s+=`<text x="${x(P[P.length-1].week)}" y="${y(lim(P[P.length-1].mean))-8}" font-size="11" font-weight="600" fill="var(--violet)" text-anchor="end">forecast</text>`}
  series.forEach((sr,i)=>{s+=line(sr.pts,x,y,sr.color,sr.dash)+`<text x="${L+8+i*170}" y="${h-B-6}" font-size="11" fill="${sr.color}">${sr.name}</text>`});
  svg.innerHTML=s;
}
function trend(){
  const by={};TL.forEach(r=>{const o=by[r.week]=by[r.week]||{s:[],a:[],ev:'',tc:0};o.s.push(r.score);o.a.push(r.adjusted);if(r.school_event)o.ev=r.school_event;if(+r.teacher_change)o.tc=1});
  const med=a=>{a=[...a].sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2};
  const wks=Object.keys(by).map(Number).sort((a,b)=>a-b);
  const ev=wks.filter(w=>by[w].ev||by[w].tc).map(w=>[w,by[w].tc?'Teacher change':by[w].ev]);
  chart($('trend'),[{name:'Raw median',color:'var(--mute)',dash:1,pts:wks.map(w=>[w,med(by[w].s)])},{name:'Adjusted median',color:'var(--accent)',pts:wks.map(w=>[w,med(by[w].a)])}],ev);
  $('trendnote').textContent=ev.length?'Dotted lines mark logged school events / teacher transfers. If many students dip there together, treat it as an environment effect first.':'No school events or teacher changes logged in this data.';
}
function detail(id){
  const r=TL.filter(x=>x.student_id===id);$('detail').hidden=false;
  $('dtitle').textContent=`${id} (${r[0].class}) - latest: ${r[r.length-1].level}`;
  const f=FC.get(id);
  chart($('spark'),[{name:'Raw score',color:'var(--mute)',dash:1,pts:r.map(x=>[x.week,x.score])},{name:'Adjusted score',color:'var(--accent)',pts:r.map(x=>[x.week,x.adjusted])}],[],900,260,f);
  $('dsub').textContent=!f?'Forecast needs at least 3 screenings for this student.':f.weeksToFloor!=null&&f.weeksToFloor<=6
    ?`If the current trend continues, the adjusted score may reach the ${CFG.low} floor in about ${Math.max(1,Math.round(f.weeksToFloor))} week(s). Use this to plan support early, not as a certainty.`
    :f.fittedNow<=CFG.low?`Already at or below the ${CFG.low} floor on the fitted trend.`:f.slope<-0.15?'Trending down, but not projected to reach the floor within 6 weeks.':f.slope>0.15?'Trending up.':'Steady trend.';
  $('detail').scrollIntoView({behavior:'smooth',block:'center'});
}
