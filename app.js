/* ============================================================
   CONFIG
   ============================================================ */
const EA='YrwsDbSwfHgAGSqPK5Vq8zJH3ubVNOBpBkoFPwHA/zcS3U6Cq1StskfgLiftypXBdNDh5f9440fXqEJMdtZlFMMZkhdf/kIzbvO2YJJeOfYRPdN71YX4OQ9A3nUBbJYOdbCZmpeRJJd9xLUbCf5y/z8I9GhRByMS1kCf1qrzpslG/XxQOJhOPF0KhhFs8q5fSWtrW+os5tI=';
const EG='MzyQzn3RfMCVJOMSbfchNtHCe+QxwuVxp/k8Eyda10iGmeQfeydEGq93VsTWgY048QHh3b9z6FG0dsGMRjQlux3V/yWfVkKJ96Qep1Ds0CAOoAQ=';
const CPR=0.067,CZK_RATE=21.2,ANALYSIS_COST=0.01;
const SB_URL='https://vlbisbnvwfvvjbveihdf.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsYmlzYm52d2Z2dmpidmVpaGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzQ0MDYsImV4cCI6MjA4OTg1MDQwNn0.QjE8GFLVMpPA1NCb7sf54l1ZJyTlgRhX0qeEPNHXCnM';
let AK='',GK='';

/* ============================================================
   STATE
   ============================================================ */
const state = {
  curSession: null,
  curScene: null,
  renders: [],
  dirty: false, // track unsaved changes
  settings: {imageData:null,fileName:'',description:'',sceneHint:'',sceneType:'exterior',timeOfDay:'midday',weather:'clear',material:75,angle:80,vegetation:50,people:30,floor:'low',aspect:'auto'},
};

/* ============================================================
   UTILITIES
   ============================================================ */
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function czPlural(n,one,few,many){return n===1?one:(n>=2&&n<=4)?few:many;}
function czRender(n){return n+' '+czPlural(n,'render','rendery','renderů');}
function czScene(n){return n+' '+czPlural(n,'scéna','scény','scén');}
function validUrl(p){return p&&typeof p==='string'&&p.startsWith('http');}
function $(id){return document.getElementById(id);}

function toast(msg,ms){const t=$('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>{t.style.display='none';},ms||2500);}

/* ============================================================
   CRYPTO
   ============================================================ */
async function decrypt(enc,pwd){
  const r=Uint8Array.from(atob(enc),c=>c.charCodeAt(0));
  const salt=r.slice(0,16),iv=r.slice(16,28),tag=r.slice(28,44),ct=r.slice(44);
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pwd),'PBKDF2',false,['deriveKey']);
  const k=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
  const combined=new Uint8Array(ct.length+tag.length);combined.set(ct);combined.set(tag,ct.length);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},k,combined));
}

/* ============================================================
   SUPABASE
   ============================================================ */
const sb = {
  hdr(extra){return{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',...(extra||{})}},
  async get(path){try{const r=await fetch(SB_URL+path,{headers:sb.hdr()});return await r.json();}catch(e){console.error('SB GET:',e);return[];}},
  async post(path,body,extra){try{const r=await fetch(SB_URL+path,{method:'POST',headers:sb.hdr(extra),body:JSON.stringify(body)});return await r.json();}catch(e){console.error('SB POST:',e);return null;}},
  async patch(path,body){try{await fetch(SB_URL+path,{method:'PATCH',headers:sb.hdr(),body:JSON.stringify(body)});}catch(e){console.error('SB PATCH:',e);}},
  async del(path){try{await fetch(SB_URL+path,{method:'DELETE',headers:sb.hdr()});}catch(e){console.error('SB DEL:',e);}},
  async uploadImg(dataUrl,fname){
    const b64=dataUrl.split(',')[1],mime=dataUrl.split(';')[0].split(':')[1];
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const h={apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':mime};
    let r=await fetch(`${SB_URL}/storage/v1/object/marinada/${fname}`,{method:'POST',headers:h,body:bytes});
    if(!r.ok)r=await fetch(`${SB_URL}/storage/v1/object/marinada/${fname}`,{method:'PUT',headers:h,body:bytes});
    if(!r.ok)throw new Error('Upload failed');
    return `${SB_URL}/storage/v1/object/public/marinada/${fname}`;
  },
  async toB64(src){
    if(src.startsWith('data:'))return{b64:src.split(',')[1],mime:src.split(';')[0].split(':')[1]};
    const bl=await(await fetch(src)).blob();
    return new Promise(res=>{const rd=new FileReader();rd.onload=()=>{const d=rd.result;res({b64:d.split(',')[1],mime:d.split(';')[0].split(':')[1]});};rd.readAsDataURL(bl);});
  },
};

/* ============================================================
   AUTH
   ============================================================ */
async function unlock(pwd){
  const p=pwd||$('pwdIn').value;if(!p)return;$('lockErr').textContent='';
  try{AK=await decrypt(EA,p);GK=await decrypt(EG,p);localStorage.setItem('marinada_pwd',p);$('lock').style.display='none';$('app').style.display='block';nav.goSessions();}
  catch{$('lockErr').textContent='Špatné heslo';$('pwdIn').value='';$('pwdIn').focus();}
}
$('unlockBtn').addEventListener('click',()=>unlock());
$('pwdIn').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});
function logout(){localStorage.removeItem('marinada_pwd');AK='';GK='';$('app').style.display='none';$('lock').style.display='flex';$('pwdIn').value='';$('pwdIn').focus();}
(async()=>{const s=localStorage.getItem('marinada_pwd');if(s)await unlock(s);})();

/* ============================================================
   NAVIGATION
   ============================================================ */
const nav = {
  showView(id){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
    $('v-'+id).classList.add('on');
    document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('on',a.dataset.nav===(id==='spend'?'spend':'studio'));});
  },
  setCrumb(parts){
    $('crumb').innerHTML=parts.map((p,i)=>i<parts.length-1?`<span onclick="${esc(p.fn)}">${esc(p.label)}</span><span class="sep">›</span>`:`<span class="cur">${esc(p.label)}</span>`).join('');
  },
  async goSessions(){
    if(state.dirty&&!confirm('Máš neuložené změny. Opravdu odejít?'))return;
    state.dirty=false;
    nav.showView('sessions');nav.setCrumb([{label:'Projekty'}]);
    $('sessionCards').innerHTML='<div class="skeleton skel-card"></div>';
    const rows=await sb.get('/rest/v1/sessions?select=*,scenes(id,renders(id,image_path,version))&order=created_at.desc');
    $('sessionCards').innerHTML=`<div class="card card-new" onclick="sessions.create()">+ Nový projekt</div>`+
      (rows||[]).map(s=>{
        const all=(s.scenes||[]).flatMap(sc=>(sc.renders||[])).filter(r=>validUrl(r.image_path));
        const latest=all.sort((a,b)=>b.id-a.id)[0];
        const img=latest?`<img class="card-img" src="${esc(latest.image_path)}">`:`<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-light);font-size:0.8rem;">Žádné rendery</div>`;
        const n=esc(s.name),nq=s.name.replace(/'/g,"\\'");
        return`<div class="card"><div onclick="sessions.open(${s.id})" style="cursor:pointer">${img}<div class="card-body"><div class="card-name">${n}</div><div class="card-meta">${czScene((s.scenes||[]).length)} · ${czRender(all.length)}</div></div></div>
          <div class="card-actions"><button class="btn btn-o btn-sm" onclick="event.stopPropagation();sessions.rename(${s.id},'${nq}')">Přejmenovat</button><button class="btn btn-o btn-sm" onclick="event.stopPropagation();sessions.zip(${s.id},'${nq}')">ZIP</button><button class="btn btn-o btn-sm" style="color:var(--red)" onclick="event.stopPropagation();sessions.remove(${s.id},'${nq}')">Smazat</button></div></div>`;
      }).join('');
  },
};

/* ============================================================
   SESSIONS
   ============================================================ */
const sessions = {
  async create(){const n=prompt('Název projektu:');if(!n)return;const r=await sb.post('/rest/v1/sessions',{name:n},{'Prefer':'return=representation'});if(r?.[0])sessions.open(r[0].id);else nav.goSessions();},
  async rename(id,old){const n=prompt('Nový název:',old);if(!n||n===old)return;await sb.patch(`/rest/v1/sessions?id=eq.${id}`,{name:n});nav.goSessions();},
  async remove(id,name){if(!confirm(`Opravdu smazat projekt "${name}"?`))return;await sb.del(`/rest/v1/sessions?id=eq.${id}`);nav.goSessions();},
  async open(id){
    state.curSession=await sb.get(`/rest/v1/sessions?id=eq.${id}&select=*`).then(r=>r[0]);
    if(!state.curSession)return nav.goSessions();
    const s=state.curSession,n=esc(s.name),nq=s.name.replace(/'/g,"\\'");
    nav.showView('session');nav.setCrumb([{label:'Projekty',fn:'nav.goSessions()'},{label:s.name}]);
    $('sessionTitle').textContent=s.name;
    $('sessionMgmt').innerHTML=`<button class="btn btn-o btn-sm" onclick="sessions.rename(${s.id},'${nq}')">Přejmenovat</button><button class="btn btn-o btn-sm" onclick="sessions.zip(${s.id},'${nq}')">ZIP</button><button class="btn btn-o btn-sm" style="color:var(--red)" onclick="sessions.remove(${s.id},'${nq}')">Smazat</button>`;
    styleRef.update();
    const scenes=await sb.get(`/rest/v1/scenes?session_id=eq.${id}&select=*,renders(id,image_path,version,note)&order=created_at.desc`);
    $('sceneCards').innerHTML=`<div class="card card-new" onclick="scenes.create()">+ Nová scéna</div>`+
      (scenes||[]).map(sc=>{
        const last=(sc.renders||[]).filter(r=>validUrl(r.image_path)).sort((a,b)=>b.version-a.version)[0];
        const img=last?`<img class="card-img" src="${esc(last.image_path)}">`:`<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-light);font-size:0.8rem;">Žádný render</div>`;
        const nq=sc.name.replace(/'/g,"\\'");
        return`<div class="card"><div onclick="scene.open(${sc.id})" style="cursor:pointer">${img}<div class="card-body"><div class="card-name">${esc(sc.name)}</div><div class="card-meta">${czRender((sc.renders||[]).filter(r=>validUrl(r.image_path)).length)}</div></div></div>
          <div class="card-actions"><button class="btn btn-o btn-sm" onclick="event.stopPropagation();scenes.rename(${sc.id},'${nq}')">Přejmenovat</button><button class="btn btn-o btn-sm" onclick="event.stopPropagation();scenes.zip(${sc.id},'${nq}')">ZIP</button><button class="btn btn-o btn-sm" onclick="event.stopPropagation();scenes.duplicate(${sc.id})">Duplikovat</button><button class="btn btn-o btn-sm" style="color:var(--red)" onclick="event.stopPropagation();scenes.remove(${sc.id},'${nq}')">Smazat</button></div></div>`;
      }).join('');
  },
  async zip(id,name){
    const p=$('zipProg');p.style.display='block';p.textContent='Připravuji ZIP...';
    const sc=await sb.get(`/rest/v1/scenes?session_id=eq.${id}&select=name,renders(version,image_path,note)`);
    if(!sc?.length){p.style.display='none';toast('Žádné scény.');return;}
    const zip=new JSZip();let done=0,total=sc.reduce((n,s)=>(s.renders||[]).filter(r=>validUrl(r.image_path)).length+n,0);
    for(const s of sc){const f=zip.folder(s.name.replace(/[\/\\]/g,'-'));
      for(const r of(s.renders||[]).filter(r=>validUrl(r.image_path))){
        try{const resp=await fetch(r.image_path);f.file(`v${r.version}-${(r.note||'render').replace(/[\/\\]/g,'-')}.png`,await resp.blob());done++;p.textContent=`Stahuji ${done}/${total}...`;}catch{}
      }}
    p.textContent='Komprimuji...';const blob=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${name.replace(/[\/\\]/g,'-')}.zip`;a.click();
    p.style.display='none';toast('ZIP stažen');
  },
};

/* ============================================================
   SCENES
   ============================================================ */
const scenes = {
  async create(){const n=prompt('Název scény:');if(!n||!state.curSession)return;const r=await sb.post('/rest/v1/scenes',{session_id:state.curSession.id,name:n},{'Prefer':'return=representation'});if(r?.[0])scene.open(r[0].id);else sessions.open(state.curSession.id);},
  async rename(id,old){const n=prompt('Nový název:',old);if(!n||n===old)return;await sb.patch(`/rest/v1/scenes?id=eq.${id}`,{name:n});sessions.open(state.curSession.id);},
  async remove(id,name){if(!confirm(`Smazat scénu "${name}"?`))return;await sb.del(`/rest/v1/scenes?id=eq.${id}`);sessions.open(state.curSession.id);},
  async duplicate(id){
    const orig=await sb.get(`/rest/v1/scenes?id=eq.${id}&select=*`).then(r=>r[0]);if(!orig)return;
    const n=prompt('Název kopie:',orig.name+' (kopie)');if(!n)return;
    await sb.post('/rest/v1/scenes',{session_id:orig.session_id,name:n,source_image_path:orig.source_image_path,description:orig.description,settings:orig.settings},{'Prefer':'return=minimal'});
    sessions.open(state.curSession.id);toast('Scéna duplikována');
  },
  async zip(id,name){
    const p=$('zipProg');p.style.display='block';p.textContent='Připravuji ZIP...';
    const rows=await sb.get(`/rest/v1/renders?scene_id=eq.${id}&select=version,image_path,note`);
    const valid=(rows||[]).filter(r=>validUrl(r.image_path));
    if(!valid.length){p.style.display='none';toast('Žádné rendery.');return;}
    const zip=new JSZip();
    for(let i=0;i<valid.length;i++){const r=valid[i];p.textContent=`Stahuji ${i+1}/${valid.length}...`;
      try{const resp=await fetch(r.image_path);zip.file(`v${r.version}-${(r.note||'render').replace(/[\/\\]/g,'-')}.png`,await resp.blob());}catch{}}
    p.textContent='Komprimuji...';const blob=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${name.replace(/[\/\\]/g,'-')}.zip`;a.click();
    p.style.display='none';toast('ZIP stažen');
  },
};

/* ============================================================
   SCENE STUDIO
   ============================================================ */
const STEPS=[{id:'upload',label:'Obrázek'},{id:'analyze',label:'Analýza'},{id:'settings',label:'Nastavení'},{id:'render',label:'Render'},{id:'iter',label:'Iterace'},{id:'export',label:'Export'}];
let curStep=0;

const scene = {
  async open(id){
    // Reset
    state.renders=[];state.dirty=false;
    $('rout').innerHTML='';$('vStr').innerHTML='';
    $('refineBox').style.display='none';$('reRenderBtn').style.display='none';
    $('uploadZone').classList.remove('has');$('uploadHint').style.display='';
    $('description').value='';$('descPreview').textContent='';$('windowView').value='';
    $('sceneHint').value='';$('promptOut').value='';
    Object.assign(state.settings,{imageData:null,fileName:'',description:'',sceneHint:'',sceneType:'exterior',timeOfDay:'midday',weather:'clear',material:75,angle:80,vegetation:50,people:30,floor:'low',aspect:'auto'});
    ui.showSub('render');

    state.curScene=await sb.get(`/rest/v1/scenes?id=eq.${id}&select=*`).then(r=>r[0]);
    if(!state.curScene||!state.curSession)return;
    nav.showView('scene');
    nav.setCrumb([{label:'Projekty',fn:'nav.goSessions()'},{label:state.curSession.name,fn:`sessions.open(${state.curSession.id})`},{label:state.curScene.name}]);
    $('sceneTitle').textContent=state.curScene.name;

    // Load renders
    const rows=await sb.get(`/rest/v1/renders?scene_id=eq.${id}&select=*&order=version.asc`);
    const fourKs=(rows||[]).filter(r=>r.version===0&&r.note&&r.note.startsWith('4K verze'));
    state.renders=(rows||[]).filter(r=>r.version>0).map(r=>({id:r.version,imgSrc:r.image_path,note:r.note||'',prompt:r.prompt||'',cost:parseFloat(r.cost)||CPR,parentId:r.parent_id,dbId:r.id}));
    for(const fk of fourKs){if(fk.parent_id){const p=state.renders.find(x=>x.dbId===fk.parent_id);if(p)p.url4k=fk.image_path;}}

    // Restore
    const S=state.settings,sc=state.curScene;
    if(sc.source_image_path){S.imageData=sc.source_image_path;ui.showUploadedImg(S.imageData);$('toAnalyzeBtn').disabled=false;}
    if(sc.description){S.description=sc.description;$('description').value=S.description;ui.updDescPreview();}
    if(sc.settings){const s=sc.settings;Object.assign(S,s);ui.restoreSettings(s);if(s.sceneHint)$('sceneHint').value=s.sceneHint;}

    if(state.renders.length){scene.goStep(3);iter.renderStrip();ui.showRender(state.renders[state.renders.length-1]);$('refineBox').style.display='block';$('reRenderBtn').style.display='';$('reRenderHint').style.display='';$('toIterBtn').style.display='';ui.updIterCount();}
    else if(sc.description)scene.goStep(2);
    else if(sc.source_image_path)scene.goStep(1);
    else scene.goStep(0);

    presets.renderBar();
  },
  goStep(n){
    if(state.dirty&&n<curStep&&!confirm('Máš neuložené změny. Pokračovat?'))return;
    curStep=n;
    document.querySelectorAll('.step-content').forEach(el=>el.classList.remove('on'));
    $('sc-'+STEPS[n].id).classList.add('on');
    const maxStep=state.renders.length?5:curStep;
    $('stepsBar').innerHTML=STEPS.map((s,i)=>`<div class="step ${i<n?'done':''} ${i===n?'active':''}" style="${i<=maxStep?'cursor:pointer':'cursor:default;opacity:0.4'}" onclick="${i<=maxStep?'scene.goStep('+i+')':''}">${i+1}. ${s.label}</div>`).join('');
    if(n===3)prompt_gen.generate();
    if(n===4)iter.renderDetail();
    if(n===5)output.render();
  },
  async saveState(){
    if(!state.curScene)return;
    const S=state.settings;
    const body={description:S.description,settings:{sceneType:S.sceneType,timeOfDay:S.timeOfDay,weather:S.weather,floor:S.floor,material:S.material,angle:S.angle,vegetation:S.vegetation,people:S.people,windowView:$('windowView').value,sceneHint:$('sceneHint').value,aspect:S.aspect}};
    if(S.imageData&&S.imageData.startsWith('http'))body.source_image_path=S.imageData;
    sb.patch(`/rest/v1/scenes?id=eq.${state.curScene.id}`,body);
    state.dirty=false;
  },
};

/* ============================================================
   UI HELPERS
   ============================================================ */
const ui = {
  showUploadedImg(src){const uz=$('uploadZone');uz.classList.add('has');$('uploadHint').style.display='none';const old=uz.querySelector('img');if(old)old.remove();const img=document.createElement('img');img.src=src;uz.appendChild(img);},
  restoreSettings(s){
    document.querySelectorAll('.pills').forEach(pg=>{const key=pg.id==='sceneType'?'sceneType':pg.id==='timeOfDay'?'timeOfDay':pg.id==='weather'?'weather':pg.id==='floorLevel'?'floor':pg.id==='aspectRatio'?'aspect':null;
      if(!key||!s[key])return;pg.querySelectorAll('.pill').forEach(p=>{p.classList.toggle('on',p.dataset.val===s[key]);});});
    if(s.material!=null){$('matS').value=s.material;$('matL').textContent=ui.sL(s.material);}
    if(s.angle!=null){$('angS').value=s.angle;$('angL').textContent=ui.sL(s.angle);}
    if(s.vegetation!=null){$('vegS').value=s.vegetation;$('vegL').textContent=s.vegetation+' %';}
    if(s.people!=null){$('pplS').value=s.people;$('pplL').textContent=s.people+' %';}
    if(s.windowView)$('windowView').value=s.windowView;
  },
  sL(v){return v<25?'Nízká':v<50?'Střední':v<75?'Vysoká':'Maximální';},
  updDescPreview(){const p=$('descPreview'),d=$('description').value;if(d){p.textContent=d.substring(0,120)+(d.length>120?'…':'');p.style.display='';}else p.style.display='none';},
  toggleDesc(){const w=$('descWrap'),t=$('descToggle');if(w.style.display==='none'){w.style.display='';t.textContent='skrýt ▴';$('descPreview').style.display='none';}else{w.style.display='none';t.textContent='zobrazit ▾';ui.updDescPreview();}},
  togglePrompt(){const w=$('promptWrap'),t=$('promptToggle');if(w.style.display==='none'){w.style.display='';t.textContent='skrýt ▴';}else{w.style.display='none';t.textContent='zobrazit ▾';}},
  showSub(){},// legacy — now handled by steps
  updIterCount(){const el=$('iterCount');if(el)el.textContent=state.renders.length?`(${state.renders.length})`:'';},
  showRender(v){
    const has4k=v.url4k&&validUrl(v.url4k);
    $('rout').innerHTML=`<img src="${esc(v.imgSrc)}">
      <div class="rmeta">v${v.id} · $${v.cost.toFixed(3)} · ${(v.cost*CZK_RATE).toFixed(1)} Kč · ${esc(v.note)}</div>
      <div class="btns" style="margin-top:0.5rem">
        <button class="btn btn-o btn-sm" onclick="render.dl(${v.id})">Stáhnout 2K</button>
        ${has4k?`<button class="btn btn-f btn-sm" onclick="render.dl4K(${v.id})">Stáhnout 4K</button>`:`<button class="btn btn-f btn-sm" onclick="render.gen4K(${v.id})" id="btn4k">Vygenerovat 4K</button>`}
        <button class="btn btn-o btn-sm" onclick="styleRef.set(${v.dbId})">Referenční styl</button>
      </div><div class="st" id="st4k"></div>`;
  },
};

/* ============================================================
   UPLOAD
   ============================================================ */
const uz=$('uploadZone'),fi=$('fileInput');
uz.addEventListener('click',()=>fi.click());
uz.addEventListener('dragover',e=>{e.preventDefault();uz.style.borderColor='var(--olive)';});
uz.addEventListener('dragleave',()=>{uz.style.borderColor='';});
uz.addEventListener('drop',e=>{e.preventDefault();uz.style.borderColor='';if(e.dataTransfer.files.length)upload.load(e.dataTransfer.files[0]);});
fi.addEventListener('change',()=>{if(fi.files.length)upload.load(fi.files[0]);});
$('toAnalyzeBtn').addEventListener('click',()=>scene.goStep(1));

const upload = {
  load(f){if(!f.type.startsWith('image/'))return;state.settings.fileName=f.name;state.dirty=true;
    const r=new FileReader();r.onload=async e=>{state.settings.imageData=e.target.result;ui.showUploadedImg(state.settings.imageData);$('toAnalyzeBtn').disabled=false;
      if(state.curScene){const url=await sb.uploadImg(state.settings.imageData,`source-scene-${state.curScene.id}-${Date.now()}.png`);state.settings.imageData=url;sb.patch(`/rest/v1/scenes?id=eq.${state.curScene.id}`,{source_image_path:url});}
    };r.readAsDataURL(f);}
};

/* ============================================================
   TOGGLES & SLIDERS
   ============================================================ */
function tog(id,key){$(id).addEventListener('click',e=>{const p=e.target.closest('[data-val]');if(!p)return;p.parentElement.querySelectorAll('[data-val]').forEach(x=>x.classList.remove('on'));p.classList.add('on');state.settings[key]=p.dataset.val;state.dirty=true;});}
tog('sceneType','sceneType');tog('timeOfDay','timeOfDay');tog('weather','weather');tog('floorLevel','floor');tog('aspectRatio','aspect');
$('matS').addEventListener('input',e=>{state.settings.material=+e.target.value;$('matL').textContent=ui.sL(state.settings.material);state.dirty=true;});
$('angS').addEventListener('input',e=>{state.settings.angle=+e.target.value;$('angL').textContent=ui.sL(state.settings.angle);state.dirty=true;});
$('vegS').addEventListener('input',e=>{state.settings.vegetation=+e.target.value;$('vegL').textContent=e.target.value+' %';state.dirty=true;});
$('pplS').addEventListener('input',e=>{state.settings.people=+e.target.value;$('pplL').textContent=e.target.value+' %';state.dirty=true;});
$('description').addEventListener('input',e=>{state.settings.description=e.target.value;state.dirty=true;});
$('toSettingsBtn').addEventListener('click',()=>{scene.goStep(2);scene.saveState();});

/* ============================================================
   ANALYZE
   ============================================================ */
$('analyzeBtn').addEventListener('click',()=>analyze.run());
const analyze = {
  async run(){
    const S=state.settings;
    if(!S.imageData){analyze.st('Nejdřív nahraj obrázek',1);return;}
    $('analyzeBtn').disabled=true;
    const fname=S.fileName||'unnamed';
    try{analyze.st('Hledám v cache...',0);
      const c=await sb.get(`/rest/v1/analyses?filename=eq.${encodeURIComponent(fname)}&select=description&limit=1`);
      if(c?.length){$('description').value=c[0].description;S.description=c[0].description;ui.updDescPreview();analyze.st('Načteno z cache (zdarma)',0);$('analyzeBtn').disabled=false;return;}
    }catch{}
    analyze.st('Analyzuji scénu...',0);
    const {b64:b,mime:m}=await sb.toB64(S.imageData);
    const hint=$('sceneHint').value.trim();
    const ctx=hint?` Context: this is "${hint}".`:'';
    try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':AK,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1024,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:m,data:b}},{type:'text',text:'You are an architectural visualization expert. Describe this SketchUp 3D model export in detail for generating a photorealistic render.'+ctx+' Include: building form, materials, style, floors, roof, windows, landscape, camera angle. Be factual. Single dense paragraph.'}]}]})});
      const d=await r.json();if(d.error)throw new Error(d.error.message);
      const desc=d.content[0].text;$('description').value=desc;S.description=desc;ui.updDescPreview();
      sb.post('/rest/v1/analyses',{filename:fname,description:desc}).catch(()=>{});
      if(state.curScene)sb.post('/rest/v1/renders',{version:0,scene_id:state.curScene.id,note:'Analýza (Claude)',cost:ANALYSIS_COST,image_path:'none'},{'Prefer':'return=minimal'}).catch(()=>{});
      analyze.st('Hotovo (uloženo)',0);
    }catch(e){analyze.st(e.message,1);}
    $('analyzeBtn').disabled=false;
  },
  st(msg,err){const el=$('analyzeStatus');el.textContent=msg;el.className='st '+(err?'er':'ld');if(!err&&(msg.startsWith('Hotovo')||msg.startsWith('Načteno')))setTimeout(()=>{el.textContent='';},2500);}
};

/* ============================================================
   PROMPT GENERATION
   ============================================================ */
$('genBtn').addEventListener('click',()=>prompt_gen.generate());
$('copyBtn').addEventListener('click',()=>{navigator.clipboard.writeText($('promptOut').value).then(()=>toast('Zkopírováno'));});
const prompt_gen = {
  generate(){
    const S=state.settings,d=$('description').value.trim();
    if(!d){$('promptOut').value='Nejdřív vyplň popis.';return;}
    scene.saveState();
    const T={dawn:'early dawn light, soft pink and blue sky',morning:'bright morning sun, crisp shadows',midday:'direct midday sun, strong overhead light','golden-hour':'warm golden hour, long soft shadows',sunset:'dramatic sunset, orange and purple sky',dusk:'blue hour dusk, interior lights glowing',night:'night, building lit from within, dark sky'};
    const W={clear:'clear sky','partly-cloudy':'partly cloudy',overcast:'overcast, soft diffused light',rainy:'rain, wet reflections, puddles',foggy:'fog, atmospheric haze',snowy:'snow on ground and roofs'};
    const mat=S.material<25?'Freely interpret materials.':S.material<50?'Keep general palette.':S.material<75?'Faithfully match materials.':'Exactly replicate all materials.';
    const ang=S.angle<25?'Adjust angle freely.':S.angle<50?'Similar direction.':S.angle<75?'Closely match camera angle.':'CRITICAL: EXACT same camera position. No reframing.';
    const vg=S.vegetation<15?'No vegetation.':S.vegetation<40?'Minimal vegetation.':S.vegetation<65?'Moderate landscaping.':'Lush, dense vegetation.';
    const pp=S.people<15?'No people.':S.people<40?'One or two for scale.':S.people<65?'Several people.':'Busy scene.';
    const wv=$('windowView').value.trim(),isI=S.sceneType==='interior';
    const fl={ground:'Ground floor view.',low:'1st-2nd floor.',mid:'3rd-5th floor, rooftops visible.',high:'6th+ floor, panoramic.',penthouse:'Rooftop, wide skyline.'};
    const ar=S.aspect!=='auto'?`\n- Aspect ratio: ${S.aspect}.`:'';
    $('promptOut').value=[
      `Transform the attached SketchUp screenshot into a photorealistic ${S.sceneType} architectural photograph.`,'',`Scene: ${d}`,'',
      'LIGHTING:',`- ${T[S.timeOfDay]}`,`- ${W[S.weather]}`,isI?'- Interior: window ambient + artificial, warm spill, soft shadows.':'- Exterior: natural sky, ambient occlusion, accurate shadows.','',
      'MATERIALS:',`- ${mat}`,'- Physically accurate surfaces. Glass: reflections + transparency. Metal: specular highlights.','',
      'CAMERA:',`- ${ang}`,'- 1:1 layout match. Only upgrade materials & lighting.','- Canon EOS R5, 24mm tilt-shift, f/5.6.',ar,'',
      'CONTEXT:',`- ${vg}`,`- ${pp}`,wv?`- WINDOWS: View of ${wv}. ${fl[S.floor]||''}`:'','',
      'QUALITY:','- Indistinguishable from real photo. Magazine quality.','- Global illumination, HDR. Zero CG artifacts.'
    ].filter(Boolean).join('\n');
  }
};

/* ============================================================
   RENDER ENGINE
   ============================================================ */
$('renderBtn').addEventListener('click',()=>render.run(null));
$('refBtn').addEventListener('click',()=>{const n=$('refIn').value.trim();if(!n)return;$('refIn').value='';render.run(n);});
$('refIn').addEventListener('keydown',e=>{if(e.key==='Enter'){const n=$('refIn').value.trim();if(!n)return;$('refIn').value='';render.run(n);}});

let loadTimer=null;
const render = {
  showLoader(on){const l=$('loader');if(on){l.innerHTML='<div class="loader-bar"></div>';l.classList.add('on');}else{l.classList.remove('on');if(loadTimer){clearInterval(loadTimer);loadTimer=null;}}},
  startMsgs(note){
    const S=state.settings;
    const msgs=['Připravuji scénu...','Analyzuji geometrii...','Nastavuji osvětlení — '+({dawn:'úsvit',morning:'ranní slunce',midday:'polední světlo','golden-hour':'zlatá hodinka',sunset:'západ slunce',dusk:'soumrak',night:'noční scéna'}[S.timeOfDay]||'denní světlo')+'...','Počítám odrazy...','Generuji textury...','Aplikuji globální iluminaci...','Renderuji stíny...','Ladím barvy...','Přidávám atmosféru...','Finalizuji...'];
    if(note)msgs.unshift('Aplikuji: '+note+'...');
    if(S.weather==='rainy')msgs.splice(5,0,'Generuji mokré povrchy...');
    if(S.weather==='snowy')msgs.splice(5,0,'Pokládám sníh...');
    if(S.vegetation>40)msgs.splice(6,0,'Zasazuji vegetaci...');
    let i=0;render.stR(msgs[0],0);
    loadTimer=setInterval(()=>{i++;if(i<msgs.length)render.stR(msgs[i],0);},2500);
  },
  stR(msg,err){const el=$('renderSt');el.textContent=msg;el.className='st '+(err?'er':'ld');},
  async run(note){
    const pr=$('promptOut').value.trim();
    if(!pr||pr.startsWith('Nejdřív')){render.stR('Nejdřív vygeneruj prompt',1);return;}
    const sourceImg=state.settings.imageData;
    if(!sourceImg){render.stR('Nahraj obrázek',1);return;}
    const lastRender=state.renders.length?state.renders[state.renders.length-1]:null;
    const sRef=state.curSession?.style_ref_render_id?state.renders.find(x=>x.dbId===state.curSession.style_ref_render_id)||await styleRef.load():null;

    // Build prompt: always use full prompt as base, add edits on top
    let rp;
    if(note){
      // Collect all previous edit notes for context
      const history=state.renders.filter(v=>v.note&&v.note!=='Základní render').map(v=>v.note);
      const allEdits=[...history,note];
      rp=pr+`\n\nADDITIONAL EDITS (apply all of these to the render):\n${allEdits.map((e,i)=>`${i+1}. ${e}`).join('\n')}\n\nIMPORTANT: Generate a FRESH render from the SketchUp source image with ALL the above edits applied. Do not degrade quality.`;
    } else if(sRef){
      rp=pr+'\n\nSTYLE REFERENCE:\nFirst image = style reference. Match its EXACT rendering style. Second image = new SketchUp view to render in that style.';
    } else {
      rp=pr;
    }

    render.showLoader(true);render.startMsgs(note);
    $('renderBtn').disabled=true;$('refBtn').disabled=true;
    const parts=[];
    try{
      // Style ref image first (if set and not iterating)
      if(sRef&&!note){const d=await sb.toB64(sRef.imgSrc);parts.push({inlineData:{mimeType:d.mime,data:d.b64}});}
    }catch(e){console.warn('Style ref fetch failed:',e);}
    try{
      // For iterations: send source image + last render as reference
      // For initial: just source image
      if(note&&lastRender){
        const refD=await sb.toB64(lastRender.imgSrc);
        parts.push({inlineData:{mimeType:refD.mime,data:refD.b64}});
      }
      const{b64:b,mime:m}=await sb.toB64(sourceImg);parts.push({inlineData:{mimeType:m,data:b}});
      if(note){
        rp+='\n\nThe first image is a reference render showing the desired style and previous edits. The second image is the original SketchUp source. Generate a new photorealistic render from the SketchUp source, matching the reference style but with ALL edits applied.';
      }
      parts.push({text:rp});
      const S=state.settings;
      const genCfg={responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'2K'}};
      if(S.aspect!=='auto')genCfg.imageConfig.aspectRatio=S.aspect;
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}],generationConfig:genCfg})});
      const d=await r.json();if(d.error)throw new Error(d.error.message);
      let ok=false;
      for(const p of d.candidates[0].content.parts){if(p.inlineData){
        const is=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        const ver=state.renders.length+1;
        const v={id:ver,imgSrc:is,note:note||'Základní render',prompt:rp,cost:CPR,parentId:note&&state.renders.length?state.renders[state.renders.length-1].dbId:null};
        const fname=`render-s${state.curScene.id}-v${ver}-${Date.now()}.png`;
        const url=await sb.uploadImg(is,fname);
        const row={version:ver,scene_id:state.curScene.id,note:v.note,prompt:rp,cost:CPR,parent_id:v.parentId,image_path:url};
        const saved=await sb.post('/rest/v1/renders',row,{'Prefer':'return=representation'});
        v.imgSrc=url;v.dbId=saved?.[0]?.id;
        state.renders.push(v);iter.renderStrip();ui.showRender(v);$('refineBox').style.display='block';$('reRenderBtn').style.display='';$('reRenderHint').style.display='';$('toIterBtn').style.display='';ui.updIterCount();ok=true;
      }}
      render.stR(ok?'':'Žádný obrázek',!ok);
    }catch(e){render.stR(e.message,1);}
    render.showLoader(false);$('renderBtn').disabled=false;$('refBtn').disabled=false;
  },
  async dl(id){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    try{const r=await fetch(v.imgSrc);const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`marinada-v${v.id}.png`;a.click();URL.revokeObjectURL(a.href);}
    catch{window.open(v.imgSrc,'_blank');}
  },
  async dl4K(id){
    const v=state.renders.find(x=>x.id===id);if(!v?.url4k)return;
    try{const r=await fetch(v.url4k);const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`marinada-v${v.id}-4k.png`;a.click();URL.revokeObjectURL(a.href);}
    catch{window.open(v.url4k,'_blank');}
  },
  async gen4K(id){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    const btn=$('btn4k');if(btn){btn.disabled=true;btn.textContent='Generuji 4K...';}
    const el=$('st4k');if(el){el.textContent='Generuji 4K (~3,2 Kč)...';el.className='st ld';}
    try{
      const{b64:b,mime:m}=await sb.toB64(v.imgSrc);
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{inlineData:{mimeType:m,data:b}},{text:'Upscale to 4K. Keep EXACT same image. Only increase resolution.'}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'4K'}}})});
      const d=await r.json();if(d.error)throw new Error(d.error.message);
      for(const p of d.candidates[0].content.parts){if(p.inlineData){
        const src=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        const fname=`render-s${state.curScene.id}-v${v.id}-4k-${Date.now()}.png`;
        const url=await sb.uploadImg(src,fname);
        sb.post('/rest/v1/renders',{version:0,scene_id:state.curScene.id,note:'4K verze v'+v.id,cost:0.151,parent_id:v.dbId,image_path:url},{'Prefer':'return=minimal'});
        v.url4k=url;
        const blob=await(await fetch(src)).blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`marinada-v${v.id}-4k.png`;a.click();URL.revokeObjectURL(a.href);
        if(el){el.textContent='4K uloženo a staženo!';setTimeout(()=>{el.textContent='';},3000);}
        ui.showRender(v);
      }}
    }catch(e){if(el){el.textContent=e.message;el.className='st er';}}
    if(btn){btn.disabled=false;btn.textContent='Vygenerovat 4K';}
  },
};

/* ============================================================
   BEFORE / AFTER
   ============================================================ */
const beforeAfter = {
  show(id){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    const srcImg=state.curScene?.source_image_path||state.settings.imageData;
    if(!srcImg){toast('Žádný zdrojový obrázek');return;}
    $('baContainer').innerHTML=`
      <div class="ba-wrap" id="baWrap" style="margin-top:1rem;">
        <img src="${esc(srcImg)}" id="baBefore">
        <div class="ba-after" id="baAfter" style="width:50%"><img src="${esc(v.imgSrc)}"></div>
        <div class="ba-line" id="baLine" style="left:50%"></div>
        <span class="ba-label l">SketchUp</span><span class="ba-label r">Render v${v.id}</span>
      </div>`;
    const wrap=$('baWrap');
    const move=e=>{const rect=wrap.getBoundingClientRect();const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));$('baAfter').style.width=(x*100)+'%';$('baLine').style.left=(x*100)+'%';};
    wrap.addEventListener('mousedown',()=>{const up=()=>{wrap.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};wrap.addEventListener('mousemove',move);document.addEventListener('mouseup',up);});
    wrap.addEventListener('click',move);
  }
};

/* ============================================================
   ITERATIONS
   ============================================================ */
const iter = {
  renderStrip(){
    const s=$('vStr');const srcImg=state.curScene?.source_image_path||state.settings.imageData;
    const srcCard=srcImg?`<div class="vc" onclick="iter.select(0)"><img src="${esc(srcImg)}"><div class="vc-i"><div class="vi" style="color:var(--olive)">Zdroj</div><div class="vn">SketchUp</div><div class="vp">—</div></div></div>`:'';
    s.innerHTML=srcCard+state.renders.map(v=>`<div class="vc" onclick="iter.select(${v.id})"><img src="${esc(v.imgSrc)}"><div class="vc-i"><div class="vi">v${v.id}</div><div class="vn">${esc(v.note)}</div><div class="vp">${(v.cost*CZK_RATE).toFixed(1)} Kč</div></div></div>`).join('');
  },
  renderDetail(){
    const empty=$('iterEmpty');
    if(!state.renders.length&&!state.curScene?.source_image_path){empty.style.display='';$('iterDetail').innerHTML='';return;}
    empty.style.display='none';iter.renderStrip();
    if(state.renders.length)iter.select(state.renders[state.renders.length-1].id);else iter.select(0);
  },
  select(id){
    document.querySelectorAll('#vStr .vc').forEach(c=>c.classList.remove('sel'));
    const cards=document.querySelectorAll('#vStr .vc');
    if(id===0){
      if(cards[0])cards[0].classList.add('sel');
      const srcImg=state.curScene?.source_image_path||state.settings.imageData;if(!srcImg)return;
      $('iterDetail').innerHTML=`<div class="duo" style="margin-top:1rem;"><div><img src="${esc(srcImg)}" style="max-width:100%;border:1px solid var(--border);display:block;"></div><div>
        <div style="font-family:var(--serif);font-size:1.1rem;margin-bottom:0.5rem;">Zdrojový obrázek</div>
        <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:1rem;">Původní export ze SketchUp</div>
        <div class="btns"><button class="btn btn-o btn-sm" onclick="iter.reAnalyze()">Znovu analyzovat</button><button class="btn btn-o btn-sm" onclick="iter.editDesc()">Upravit popis</button></div></div></div>`;
      return;
    }
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    const idx=state.renders.findIndex(x=>x.id===id)+1;
    if(cards[idx])cards[idx].classList.add('sel');
    const has4k=v.url4k&&validUrl(v.url4k);
    $('iterDetail').innerHTML=`<div class="duo" style="margin-top:1rem;"><div><img src="${esc(v.imgSrc)}" style="max-width:100%;border:1px solid var(--border);display:block;"></div><div>
      <div style="font-family:var(--serif);font-size:1.1rem;margin-bottom:0.5rem;">Verze ${v.id}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.3rem;">${esc(v.note)}</div>
      <div style="font-size:0.75rem;color:var(--text-light);margin-bottom:1rem;font-family:var(--serif);font-style:italic;">$${v.cost.toFixed(3)} · ${(v.cost*CZK_RATE).toFixed(1)} Kč</div>
      <div class="btns">
        <button class="btn btn-o btn-sm" onclick="render.dl(${v.id})">Stáhnout 2K</button>
        ${has4k?`<button class="btn btn-f btn-sm" onclick="render.dl4K(${v.id})">Stáhnout 4K</button>`:''}
        <button class="btn btn-o btn-sm" onclick="styleRef.set(${v.dbId})">Referenční styl</button>
        <button class="btn btn-o btn-sm" onclick="iter.loadToRender(${v.id})">Iterovat</button>
        <button class="btn btn-o btn-sm" style="color:var(--red)" onclick="iter.remove(${v.id},${v.dbId})">Smazat</button>
      </div></div></div>`;
  },
  loadToRender(id){const v=state.renders.find(x=>x.id===id);if(!v)return;ui.showRender(v);$('refineBox').style.display='block';scene.goStep(3);},
  async remove(verId,dbId){
    if(!confirm('Smazat tento render?'))return;
    if(dbId)await sb.del(`/rest/v1/renders?id=eq.${dbId}`);
    state.renders=state.renders.filter(x=>x.id!==verId);
    iter.renderStrip();ui.updIterCount();
    if(state.renders.length)iter.select(state.renders[state.renders.length-1].id);
    else{$('iterDetail').innerHTML='';$('iterEmpty').style.display='';}
    toast('Render smazán');
  },
  async reAnalyze(){
    if(state.settings.fileName)await sb.del(`/rest/v1/analyses?filename=eq.${encodeURIComponent(state.settings.fileName)}`).catch(()=>{});
    scene.goStep(1);setTimeout(()=>analyze.run(),100);
  },
  editDesc(){scene.goStep(1);$('descWrap').style.display='';$('descToggle').textContent='skrýt ▴';$('description').focus();}
};

/* ============================================================
   STYLE REFERENCE
   ============================================================ */
const styleRef = {
  async set(dbId){if(!state.curSession||!dbId)return;await sb.patch(`/rest/v1/sessions?id=eq.${state.curSession.id}`,{style_ref_render_id:dbId});state.curSession.style_ref_render_id=dbId;styleRef.update();toast('Referenční styl nastaven');},
  async clear(){if(!state.curSession)return;await sb.patch(`/rest/v1/sessions?id=eq.${state.curSession.id}`,{style_ref_render_id:null});state.curSession.style_ref_render_id=null;styleRef.update();},
  async load(){if(!state.curSession?.style_ref_render_id)return null;const r=await sb.get(`/rest/v1/renders?id=eq.${state.curSession.style_ref_render_id}&select=*`);return r?.[0]?{imgSrc:r[0].image_path,dbId:r[0].id}:null;},
  async update(){
    const box=$('styleRefContent'),st=$('styleRefStatus');
    if(!state.curSession?.style_ref_render_id){st.textContent='žádný';box.innerHTML='<div style="font-size:0.72rem;color:var(--text-dim);">Vyrenderuj scénu a nastav ji jako referenční styl.</div>';return;}
    const r=await sb.get(`/rest/v1/renders?id=eq.${state.curSession.style_ref_render_id}&select=image_path,note,version`);
    if(!r?.length){styleRef.clear();return;}
    st.textContent='v'+r[0].version;
    box.innerHTML=`<div class="style-ref-preview"><img src="${esc(r[0].image_path)}"><div class="style-ref-info"><strong>v${r[0].version}</strong> — ${esc(r[0].note||'')}<br>Nové rendery budou vizuálně odpovídat tomuto stylu.<div class="btns" style="margin-top:0.4rem"><button class="btn btn-o btn-sm" onclick="styleRef.clear()">Zrušit</button></div></div></div>`;
  },
};

/* ============================================================
   PRESETS
   ============================================================ */
const presets = {
  KEY: 'marinada_presets',
  getAll(){try{return JSON.parse(localStorage.getItem(presets.KEY))||[];}catch{return[];}},
  save(){
    const name=prompt('Název předvolby:');if(!name)return;
    const S=state.settings;
    const p={name,sceneType:S.sceneType,timeOfDay:S.timeOfDay,weather:S.weather,floor:S.floor,material:S.material,angle:S.angle,vegetation:S.vegetation,people:S.people,aspect:S.aspect,windowView:$('windowView').value};
    const all=presets.getAll();all.push(p);localStorage.setItem(presets.KEY,JSON.stringify(all));
    presets.renderBar();toast('Předvolba uložena');
  },
  apply(idx){
    const all=presets.getAll();const p=all[idx];if(!p)return;
    Object.assign(state.settings,p);ui.restoreSettings(p);if(p.windowView)$('windowView').value=p.windowView;
    state.dirty=true;toast('Předvolba aplikována');
  },
  remove(idx){
    if(!confirm('Smazat předvolbu?'))return;
    const all=presets.getAll();all.splice(idx,1);localStorage.setItem(presets.KEY,JSON.stringify(all));
    presets.renderBar();
  },
  renderBar(){
    const all=presets.getAll();
    $('presetBar').innerHTML=all.map((p,i)=>`<div class="preset-chip" onclick="presets.apply(${i})" title="Dvojklik = smazat" ondblclick="event.stopPropagation();presets.remove(${i})">${esc(p.name)}</div>`).join('')||'<span style="font-size:0.7rem;color:var(--text-light);">Žádné předvolby</span>';
  }
};

/* ============================================================
   SPENDINGS
   ============================================================ */
const spend = {
  async load(){
    const rows=await sb.get('/rest/v1/renders?select=*,scenes(name,sessions(name))&order=id.asc');if(!rows)return;
    const real=rows.filter(r=>validUrl(r.image_path));
    const totalCost=rows.reduce((s,r)=>s+parseFloat(r.cost||0),0);
    $('spN').textContent=real.length;
    $('spU').textContent='$'+totalCost.toFixed(2);
    $('spK').textContent=Math.round(totalCost*CZK_RATE)+' Kč';
    $('spB').innerHTML=rows.length?rows.map(r=>{
      const type=r.version>0?'Render v'+r.version:esc(r.note||'—');
      return`<tr><td class="it">${type}</td><td>${esc(r.scenes?.sessions?.name||'—')}</td><td>${esc(r.scenes?.name||'—')}</td><td>${esc(r.note||'')}</td><td class="it">$${parseFloat(r.cost||0).toFixed(3)}</td><td class="it">${(parseFloat(r.cost||0)*CZK_RATE).toFixed(1)} Kč</td></tr>`;
    }).join(''):'<tr><td colspan="6" style="color:var(--text-light);text-align:center;padding:2rem;">Zatím žádné rendery</td></tr>';
  }
};

/* ============================================================
   OUTPUT / EXPORT
   ============================================================ */
const output = {
  selected: new Set(),

  render(){
    const R=state.renders;
    if(!R.length){$('outputEmpty').style.display='';$('outputContent').style.display='none';return;}
    $('outputEmpty').style.display='none';$('outputContent').style.display='';
    // Grid
    $('outputGrid').innerHTML=R.map(v=>{
      const has4k=v.url4k&&validUrl(v.url4k);
      const checked=output.selected.has(v.id);
      return`<div class="out-card ${checked?'checked':''}" id="oc${v.id}">
        <div class="out-check ${checked?'on':''}" onclick="output.toggle(${v.id})">${checked?'✓':''}</div>
        <img src="${esc(v.imgSrc)}" onclick="output.toggle(${v.id})">
        <div class="out-card-body">
          <div class="out-card-top">
            <span class="out-card-name">v${v.id}</span>
            <div class="out-card-badges">
              <span class="out-badge b2k">2K</span>
              ${has4k?'<span class="out-badge b4k">4K</span>':'<span class="out-badge no4k">—</span>'}
            </div>
          </div>
          <div style="color:var(--text-dim);font-size:0.65rem;margin-top:0.15rem;">${esc(v.note)}</div>
          <div class="out-card-note">
            <input value="${esc(v.label||'')}" placeholder="Pojmenuj..." onchange="output.setLabel(${v.id},this.value)">
          </div>
        </div>
      </div>`;
    }).join('');
    // Rename list
    $('renameList').innerHTML=R.map(v=>`<div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;">
      <span style="font-size:0.75rem;color:var(--text-dim);min-width:2rem;">v${v.id}</span>
      <input class="fi" style="font-size:0.75rem;padding:0.3rem 0.5rem;" value="${esc(v.label||v.note)}" onchange="output.setLabel(${v.id},this.value)" placeholder="${esc(v.note)}">
    </div>`).join('');
  },

  toggle(id){
    if(output.selected.has(id))output.selected.delete(id);else output.selected.add(id);
    output.render();
  },
  selectAll(){state.renders.forEach(v=>output.selected.add(v.id));output.render();},
  selectNone(){output.selected.clear();output.render();},
  select4K(){output.selected.clear();state.renders.filter(v=>v.url4k&&validUrl(v.url4k)).forEach(v=>output.selected.add(v.id));output.render();},

  setLabel(id,label){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    v.label=label;
    // Save to DB
    if(v.dbId)sb.patch(`/rest/v1/renders?id=eq.${v.dbId}`,{note:label});
  },

  async zipSelected(){
    const sel=state.renders.filter(v=>output.selected.has(v.id));
    if(!sel.length){toast('Vyber alespoň jednu verzi');return;}
    const p=$('zipProg');p.style.display='block';
    const zip=new JSZip();
    const sceneName=(state.curScene?.name||'scene').replace(/[\/\\]/g,'-');
    for(let i=0;i<sel.length;i++){
      const v=sel[i];
      p.textContent=`Stahuji ${i+1}/${sel.length}...`;
      const name=v.label||v.note||'render';
      // 2K
      if(validUrl(v.imgSrc)){try{const r=await fetch(v.imgSrc);zip.file(`${sceneName}-v${v.id}-${name.replace(/[\/\\]/g,'-')}-2k.png`,await r.blob());}catch{}}
      // 4K if exists
      if(v.url4k&&validUrl(v.url4k)){try{const r=await fetch(v.url4k);zip.file(`${sceneName}-v${v.id}-${name.replace(/[\/\\]/g,'-')}-4k.png`,await r.blob());}catch{}}
    }
    p.textContent='Komprimuji...';
    const blob=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${sceneName}-export.zip`;a.click();URL.revokeObjectURL(a.href);
    p.style.display='none';toast(`ZIP se ${sel.length} ${czPlural(sel.length,'verzí','verzemi','verzemi')} stažen`);
  },

  async gen4KAll(){
    const missing=state.renders.filter(v=>output.selected.has(v.id)&&(!v.url4k||!validUrl(v.url4k)));
    if(!missing.length){toast('Všechny vybrané už mají 4K');return;}
    if(!confirm(`Vygenerovat 4K pro ${missing.length} ${czPlural(missing.length,'verzi','verze','verzí')}? (~${(missing.length*3.2).toFixed(0)} Kč)`))return;
    const st=$('outputSt');
    for(let i=0;i<missing.length;i++){
      const v=missing[i];
      st.textContent=`Generuji 4K ${i+1}/${missing.length} (v${v.id})...`;st.className='st ld';
      try{
        const{b64:b,mime:m}=await sb.toB64(v.imgSrc);
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[{inlineData:{mimeType:m,data:b}},{text:'Upscale to 4K. Keep EXACT same image. Only increase resolution.'}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'4K'}}})});
        const d=await r.json();if(d.error)throw new Error(d.error.message);
        for(const p of d.candidates[0].content.parts){if(p.inlineData){
          const src=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
          const fname=`render-s${state.curScene.id}-v${v.id}-4k-${Date.now()}.png`;
          const url=await sb.uploadImg(src,fname);
          sb.post('/rest/v1/renders',{version:0,scene_id:state.curScene.id,note:'4K verze v'+v.id,cost:0.151,parent_id:v.dbId,image_path:url},{'Prefer':'return=minimal'});
          v.url4k=url;
        }}
      }catch(e){st.textContent=`Chyba u v${v.id}: ${e.message}`;st.className='st er';await new Promise(r=>setTimeout(r,2000));}
    }
    st.textContent='Hotovo!';st.className='st ld';setTimeout(()=>{st.textContent='';},2000);
    output.render();
  },

  async contactSheet(){
    const sel=state.renders.filter(v=>output.selected.has(v.id));
    if(!sel.length){toast('Vyber alespoň jednu verzi');return;}
    const st=$('outputSt');st.textContent='Vytvářím kontaktní arch...';st.className='st ld';
    try{
      const imgs=[];
      for(const v of sel){
        const img=new Image();img.crossOrigin='anonymous';
        await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=v.imgSrc;});
        imgs.push({img,label:v.label||v.note||'v'+v.id});
      }
      // Layout: 2 columns
      const cols=Math.min(2,imgs.length);
      const rows=Math.ceil(imgs.length/cols);
      const cellW=800,cellH=600,pad=20,labelH=30;
      const cw=cols*cellW+(cols+1)*pad;
      const ch=rows*(cellH+labelH)+(rows+1)*pad+60;
      const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#f4f1ea';ctx.fillRect(0,0,cw,ch);
      // Title
      ctx.fillStyle='#2c2c28';ctx.font='bold 24px Helvetica Neue, sans-serif';
      ctx.fillText((state.curScene?.name||'marinada')+' — kontaktní arch',pad,40);
      ctx.fillStyle='#8a8578';ctx.font='14px Helvetica Neue, sans-serif';
      ctx.fillText(new Date().toLocaleDateString('cs-CZ'),pad+ctx.measureText((state.curScene?.name||'')+' — kontaktní arch').width+20,40);

      for(let i=0;i<imgs.length;i++){
        const col=i%cols,row=Math.floor(i/cols);
        const x=pad+col*(cellW+pad),y=60+pad+row*(cellH+labelH+pad);
        // Draw image scaled to fit
        const{img,label}=imgs[i];
        const scale=Math.min(cellW/img.width,cellH/img.height);
        const dw=img.width*scale,dh=img.height*scale;
        ctx.fillStyle='#ffffff';ctx.fillRect(x,y,cellW,cellH);
        ctx.drawImage(img,x+(cellW-dw)/2,y+(cellH-dh)/2,dw,dh);
        ctx.strokeStyle='#ddd8cc';ctx.strokeRect(x,y,cellW,cellH);
        // Label
        ctx.fillStyle='#2c2c28';ctx.font='13px Helvetica Neue, sans-serif';
        ctx.fillText(label,x,y+cellH+18);
      }
      // Download
      canvas.toBlob(blob=>{
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(state.curScene?.name||'marinada').replace(/[\/\\]/g,'-')}-kontaktni-arch.png`;a.click();URL.revokeObjectURL(a.href);
      },'image/png');
      // Also show preview
      $('contactSheetResult').innerHTML='';$('contactSheetResult').appendChild(canvas);
      st.textContent='Kontaktní arch vytvořen a stažen';setTimeout(()=>{st.textContent='';},3000);
    }catch(e){st.textContent=e.message;st.className='st er';}
  },
};

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if((e.metaKey||e.ctrlKey)&&e.key==='c'){e.preventDefault();const v=$('promptOut').value;if(v)navigator.clipboard.writeText(v).then(()=>toast('Prompt zkopírován'));}
  if(e.key==='Enter'&&curStep===3){e.preventDefault();render.run(null);}
});
