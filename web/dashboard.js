const COL={Red:'var(--red)',Orange:'var(--orange)',Yellow:'var(--yellow)',Green:'var(--green)'};
const $=id=>document.getElementById(id);
// In-memory pool only. No browser storage, no network.
let POOL=new Map(),TL=[],ALERTS=[],CFG=null;

function ingest(texts){
  let replaced=0;
  for(const t of texts){
    for(const r of Pulse.parseCSV(t)){
      const k=r.student_id+'|'+r.week;
      if(POOL.has(k))replaced++;
      POOL.set(k,r);
    }
  }
  rebuild(replaced);
}
function rebuild(replaced=0){
  try{
    const rows=[...POOL.values()];
    const {cfg,report}=Pulse.rebuild(rows);          // model rebuilt from scratch every time
    CFG=cfg;TL=Pulse.timeline(rows,cfg);ALERTS=Pulse.latestAlerts(rows,cfg);
    $('msg').textContent=`${report.students} students, ${report.weeks} weeks, ${report.rows} rows in memory`+(replaced?` (${replaced} rows replaced by newer upload)`:'')+'.';
    $('msg').className='note';$('forget').hidden=false;render(report);
  }catch(e){
    $('msg').textContent=e.message;$('msg').className='err';
    if(!TL.length)$('out').hidden=true;
  }
}
function forget(){POOL=new Map();TL=[];ALERTS=[];CFG=null;$('out').hidden=true;$('forget').hidden=true;$('file').value='';$('msg').textContent='All data cleared from memory.';$('msg').className='note'}
$('forget').onclick=forget;
$('file').onchange=e=>{const fs=[...e.target.files];if(fs.length)Promise.all(fs.map(f=>f.text())).then(ingest);e.target.value=''};
const drop=$('drop');
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const fs=[...e.dataTransfer.files].filter(f=>f.name.endsWith('.csv'));if(fs.length)Promise.all(fs.map(f=>f.text())).then(ingest)});
document.querySelector('label[for=file]').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}};
$('sample').onclick=()=>fetch('sample_school_upload.csv').then(r=>{if(!r.ok)throw 0;return r.text()}).then(t=>ingest([t]))
  .catch(()=>{$('msg').textContent='Sample needs a web server (it cannot load from a local file). Upload sample_school_upload.csv instead.';$('msg').className='err'});
$('flt').onchange=$('cls').onchange=table;

function render(rep){
  $('out').hidden=false;
  $('modelsub').textContent=`Fitted from ${rep.rows} rows. Estimated week-to-week noise: ${rep.noise==null?'not enough data yet':rep.noise+' points'}.`;
  $('conf').style.width=(rep.confidence*100)+'%';$('confpct').textContent='('+Math.round(rep.confidence*100)+'%)';
  const D=Pulse.CFG,f=(a,b)=>`<tr><td>${a}</td><td>${D[b[0]]}</td><td><b>${CFG[b[0]]}</b></td></tr>`;
  $('params').innerHTML=[['3-screening decline (points)',['trendDrop']],['Sharp drop vs own baseline',['sharpDrop']],['Low attendance (%)',['lowAtt']],['Low score floor (fixed)',['low']]].map(([a,b])=>f(a,b)).join('');
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
function table(){
  const min=+$('flt').value,c=$('cls').value;
  const list=ALERTS.filter(a=>a.level_rank>=min&&(!c||a.class===c));
  $('rows').innerHTML=list.map(a=>`<tr class="click" tabindex="0" data-id="${a.student_id}"><td><b>${a.student_id}</b></td><td>${a.class}</td>
    <td><span class="badge" style="background:${COL[a.level]}">${a.level}</span></td><td>${a.score.toFixed(1)}</td><td>${a.adjusted.toFixed(1)}</td><td>${why(a)}</td><td>${a.counsellor_followup||'-'}</td></tr>`).join('')||'<tr><td colspan="7">No students at this level.</td></tr>';
  document.querySelectorAll('tr.click').forEach(tr=>{tr.onclick=()=>detail(tr.dataset.id);tr.onkeydown=e=>{if(e.key==='Enter')detail(tr.dataset.id)}});
}
function line(pts,x,y,color,dash){return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" ${dash?'stroke-dasharray="6 5"':''} points="${pts.map(p=>x(p[0])+','+y(p[1])).join(' ')}"/>`}
function chart(svg,series,events,w=900,h=260){
  const L=40,R=12,T=12,B=28,wk=[...new Set(series.flatMap(s=>s.pts.map(p=>p[0])))].sort((a,b)=>a-b);
  const x=v=>L+(v-wk[0])/(wk[wk.length-1]-wk[0]||1)*(w-L-R),y=v=>T+(10-v)/9*(h-T-B);
  let s='';for(let v=1;v<=10;v+=3)s+=`<line x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="4" y="${y(v)+4}" fill="var(--mute)" font-size="11">${v}</text>`;
  const step=Math.ceil(wk.length/16);wk.forEach((v,i)=>{if(i%step===0)s+=`<text x="${x(v)}" y="${h-8}" font-size="11" fill="var(--mute)" text-anchor="middle">${v}</text>`});
  events.forEach(([week,label],i)=>{s+=`<line x1="${x(week)}" x2="${x(week)}" y1="${T}" y2="${h-B}" stroke="var(--mute)" stroke-dasharray="2 3"/><text x="${x(week)+3}" y="${T+10+(i%2)*12}" font-size="10" fill="var(--mute)">${label}</text>`});
  s+=`<line x1="${L}" x2="${w-R}" y1="${y(CFG.low)}" y2="${y(CFG.low)}" stroke="var(--red)" stroke-opacity=".45"/>`;
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
  chart($('spark'),[{name:'Raw score',color:'var(--mute)',dash:1,pts:r.map(x=>[x.week,x.score])},{name:'Adjusted score',color:'var(--accent)',pts:r.map(x=>[x.week,x.adjusted])}],[],900,220);
  $('detail').scrollIntoView({behavior:'smooth',block:'center'});
}
