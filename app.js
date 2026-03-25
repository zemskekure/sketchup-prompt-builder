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
  iterateFromId: null, // which version to iterate from (null = latest)
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
  // Resize image to stay under maxBytes (default 4.5MB for Claude's 5MB limit)
  async resizeForApi(src, maxBytes=4500000){
    const {b64,mime}=await sb.toB64(src);
    const bytes=atob(b64).length;
    if(bytes<=maxBytes)return{b64,mime};
    // Need to resize — draw to canvas at reduced size
    return new Promise(res=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        const ratio=Math.sqrt(maxBytes/bytes)*0.9; // 10% safety margin
        w=Math.round(w*ratio);h=Math.round(h*ratio);
        const c=document.createElement('canvas');c.width=w;c.height=h;
        const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
        const dataUrl=c.toDataURL('image/jpeg',0.85);
        res({b64:dataUrl.split(',')[1],mime:'image/jpeg'});
      };
      img.src=src.startsWith('data:')?src:src;
    });
  },
};

/* ============================================================
   AUTH
   ============================================================ */
async function unlock(pwd){
  const p=pwd||$('pwdIn').value;if(!p)return;$('lockErr').textContent='';
  try{AK=await decrypt(EA,p);GK=await decrypt(EG,p);window.AK=AK;window.GK=GK;localStorage.setItem('marinada_pwd',p);$('lock').style.display='none';$('app').style.display='block';nav.goSessions();}
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
    const navMap={sessions:'studio',session:'studio',scene:'studio',spend:'spend',master:'master'};
    document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('on',a.dataset.nav===(navMap[id]||'studio'));});
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

    if(state.renders.length){scene.goStep(3);iter.renderStrip();ui.showRender(state.renders[state.renders.length-1]);$('refineBox').style.display='block';$('reRenderBtn').style.display='';$('reRenderHint').style.display='';$('toIterBtn').style.display='';ui.renderQuickEdits();ui.updIterCount();}
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
  renderQuickEdits(){
    const isInterior=state.settings.sceneType==='interior';
    const edits=isInterior?[
      {label:'Přidej lidi',edit:'Add 3-4 realistic people naturally using the space — sitting, standing, having conversation'},
      {label:'Rozsviť světla',edit:'Turn on all interior lights — warm ambient ceiling lights, pendant lamps, under-cabinet lighting. Cozy evening atmosphere'},
      {label:'Večerní nálada',edit:'Change to evening/dusk mood — warm interior lighting glowing, blue hour visible through windows, cozy atmosphere'},
      {label:'Staž žaluzie',edit:'Lower the window blinds/shades halfway, creating soft filtered light patterns on the floor'},
      {label:'Přidej rostliny',edit:'Add realistic indoor plants — a large monstera in the corner, small potted herbs, a hanging plant'},
      {label:'Doplň dekorace',edit:'Add tasteful decor — books on shelves, a fruit bowl, candles, artwork on walls, cushions on seating'},
      {label:'Více světla',edit:'Brighten the scene significantly — more sunlight streaming through windows, lighter and airier atmosphere'},
      {label:'Teplejší tóny',edit:'Shift the overall color temperature warmer — more amber/honey tones, warm wood, golden light'},
      {label:'Chladnější tóny',edit:'Shift color temperature cooler — crisp whites, gray tones, blue-tinted daylight, minimalist Scandinavian feel'},
      {label:'Vyčisti prostor',edit:'Remove all clutter and decorative items. Clean, minimal, empty space with just the architecture and furniture'},
    ]:[
      {label:'Přidej lidi',edit:'Add 3-4 realistic people walking on sidewalk or entering the building for scale and life'},
      {label:'Přidej stromy',edit:'Add mature realistic trees, landscaping, green shrubs along the building'},
      {label:'Přidej auta',edit:'Add a few realistic parked cars along the street — modern, clean'},
      {label:'Západ slunce',edit:'Change lighting to golden hour sunset — warm orange sky, long dramatic shadows, golden reflections on glass'},
      {label:'Po dešti',edit:'Make it look like just after rain — wet pavement with reflections, puddles, moody overcast sky, glistening surfaces'},
      {label:'Noční scéna',edit:'Change to nighttime — dark sky, building lit from within, exterior architectural lighting, street lamps glowing'},
      {label:'Zimní scéna',edit:'Add winter atmosphere — snow on rooftops and ground, bare trees, cold blue light, breath-visible cold'},
      {label:'Více světla',edit:'Brighten the scene — more direct sunlight, clearer sky, stronger shadows'},
      {label:'Kontext okolí',edit:'Add realistic neighboring buildings, urban context, street infrastructure — make it feel like a real location'},
      {label:'Teplejší tóny',edit:'Shift overall color grading warmer — honey tones, warm stone, golden light'},
    ];
    $('quickEdits').innerHTML=edits.map(e=>
      `<div class="pill" data-edit="${esc(e.edit)}" onclick="this.classList.toggle('on')">${e.label}</div>`
    ).join('');
  },
  showRender(v){
    const has4k=v.url4k&&validUrl(v.url4k);
    $('rout').innerHTML=`<img src="${esc(v.imgSrc)}">
      <div class="rmeta">v${v.id} · $${v.cost.toFixed(3)} · ${(v.cost*CZK_RATE).toFixed(1)} Kč · ${esc(v.note)}</div>
      <div class="btns" style="margin-top:0.5rem">
        <button class="btn btn-o btn-sm" onclick="render.dl(${v.id})">Stáhnout 2K</button>
        ${has4k?`<button class="btn btn-f btn-sm" onclick="render.dl4K(${v.id})">Stáhnout 4K</button>`:`<button class="btn btn-f btn-sm" onclick="render.gen4K(${v.id})" id="btn4k">Vygenerovat 4K</button>`}
        <button class="btn btn-o btn-sm" onclick="styleRef.set(${v.dbId})">Referenční styl</button>
        <button class="btn btn-o btn-sm" onclick="render.refresh(${v.id})" id="refreshBtn">Zaostřit</button>
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
    const {b64:b,mime:m}=await sb.resizeForApi(S.imageData);
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
    const vg=S.vegetation<15?'No vegetation or plants in the scene.':S.vegetation<40?'Minimal greenery — a small potted plant or sparse grass, nothing dominant.':S.vegetation<65?'Moderate landscaping with realistic trees, shrubs, potted plants, and ground cover where appropriate.':'Lush, abundant vegetation — mature trees, dense planting, climbing plants, overflowing planters. Green should be a dominant visual element.';
    const pp=S.people<15?'No people in the scene whatsoever. The space must be completely empty of any human figures.':S.people<40?'Add 1-2 realistic people in the scene for scale — casually standing, sitting, or walking. They should look like real photograph subjects, not 3D models.':S.people<65?'Add 4-6 realistic people naturally using the space — sitting at tables, walking, talking. The scene should feel alive and inhabited.':'Busy, populated scene with 8+ realistic people — active use of the space, movement, social interaction. The scene should feel vibrant and full of life.';
    const wv=$('windowView').value.trim(),isI=S.sceneType==='interior';
    const fl={ground:'Ground floor view.',low:'1st-2nd floor.',mid:'3rd-5th floor, rooftops visible.',high:'6th+ floor, panoramic.',penthouse:'Rooftop, wide skyline.'};
    const ar=S.aspect!=='auto'?`\n- Aspect ratio: ${S.aspect}.`:'';
    $('promptOut').value=[
      `Transform the attached SketchUp screenshot into a photorealistic ${S.sceneType} architectural photograph.`,'',`Scene: ${d}`,'',
      'LIGHTING:',`- ${T[S.timeOfDay]}`,`- ${W[S.weather]}`,isI?'- Interior lighting: If windows are present, show natural light streaming in with realistic falloff. If no windows visible, rely entirely on artificial light sources — ceiling fixtures, pendant lamps, spotlights, under-cabinet lights. Create realistic warm pools of light with soft shadows. The space should feel like a real inhabited room photographed with professional lighting.':'- Exterior: natural sky illumination, ambient occlusion in corners and under overhangs, accurate shadow casting from sun position.','',
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
$('refBtn').addEventListener('click',()=>{
  const custom=$('refIn').value.trim();
  const quickSel=Array.from(document.querySelectorAll('#quickEdits .pill.on')).map(p=>p.dataset.edit);
  const allEdits=[...quickSel];
  if(custom)allEdits.push(custom);
  if(!allEdits.length){toast('Zaškrtni úpravu nebo napiš vlastní');return;}
  $('refIn').value='';
  document.querySelectorAll('#quickEdits .pill').forEach(p=>p.classList.remove('on'));
  render.run(allEdits.join('. '));
});
$('refIn').addEventListener('keydown',e=>{if(e.key==='Enter'){$('refBtn').click();}});

let loadTimer=null;
const render = {
  showLoader(on){const l=$('loader');if(on){l.innerHTML='<div class="loader-dots"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div><div class="loader-track"><div class="loader-bar"></div></div><div class="loader-msg" id="loaderMsg"></div>';l.classList.add('on');}else{l.classList.remove('on');if(loadTimer){clearInterval(loadTimer);loadTimer=null;}}},
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
  stR(msg,err){
    const el=$('renderSt');el.textContent=err?msg:'';el.className='st '+(err?'er':'ld');
    const lm=$('loaderMsg');if(lm&&!err)lm.textContent=msg;
  },
  async run(note){
    const pr=$('promptOut').value.trim();
    if(!pr||pr.startsWith('Nejdřív')){render.stR('Nejdřív vygeneruj prompt',1);return;}
    const sourceImg=state.settings.imageData;
    if(!sourceImg){render.stR('Nahraj obrázek',1);return;}
    // Determine which version to iterate from
    const baseId=state.iterateFromId;
    const baseRender=baseId?state.renders.find(x=>x.id===baseId):state.renders[state.renders.length-1]||null;
    const sRef=state.curSession?.style_ref_render_id?state.renders.find(x=>x.dbId===state.curSession.style_ref_render_id)||await styleRef.load():null;

    // Build prompt
    let rp;
    if(note){
      // Simple: base prompt + ONE edit. The reference image already shows all previous edits visually.
      rp=pr+`\n\nIMPORTANT EDIT: ${note}\n\nYou are given two images. The FIRST image is a previous photorealistic render — use it as your visual reference for style, lighting, materials, and overall look. The SECOND image is the original SketchUp 3D model source.\n\nGenerate a NEW photorealistic render from the SketchUp source that looks like the reference render, but with this ONE change applied: ${note}\n\nKeep everything else identical to the reference render. Same quality, same style, same angle. Only change what was requested.`;
    } else if(sRef){
      rp=pr+'\n\nSTYLE REFERENCE:\nFirst image = style reference. Match its EXACT rendering style. Second image = new SketchUp view to render in that style.';
    } else {
      rp=pr;
    }

    render.showLoader(true);render.startMsgs(note);
    $('renderBtn').disabled=true;$('refBtn').disabled=true;
    const parts=[];
    try{
      if(sRef&&!note){const d=await sb.toB64(sRef.imgSrc);parts.push({inlineData:{mimeType:d.mime,data:d.b64}});}
    }catch(e){console.warn('Style ref fetch failed:',e);}
    try{
      // For iterations: reference render first, then source SketchUp
      // For initial: just source SketchUp (+ optional style ref above)
      if(note&&baseRender){
        const refD=await sb.toB64(baseRender.imgSrc);
        parts.push({inlineData:{mimeType:refD.mime,data:refD.b64}});
      }
      const{b64:b,mime:m}=await sb.toB64(sourceImg);
      parts.push({inlineData:{mimeType:m,data:b}});
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
        const v={id:ver,imgSrc:is,note:note||'Základní render',prompt:rp,cost:CPR,parentId:note&&baseRender?baseRender.dbId:null};
        const fname=`render-s${state.curScene.id}-v${ver}-${Date.now()}.png`;
        const url=await sb.uploadImg(is,fname);
        const row={version:ver,scene_id:state.curScene.id,note:v.note,prompt:rp,cost:CPR,parent_id:v.parentId,image_path:url};
        const saved=await sb.post('/rest/v1/renders',row,{'Prefer':'return=representation'});
        v.imgSrc=url;v.dbId=saved?.[0]?.id;
        state.renders.push(v);state.iterateFromId=v.id;iter.renderStrip();ui.showRender(v);$('refineBox').style.display='block';$('reRenderBtn').style.display='';$('reRenderHint').style.display='';$('toIterBtn').style.display='';$('refIn').placeholder=`Iteruji z v${v.id} — nebo zaškrtni rychlé úpravy`;ui.updIterCount();ok=true;
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
  async refresh(id){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    const sourceImg=state.settings.imageData;
    if(!sourceImg){toast('Žádný zdrojový obrázek');return;}
    const btn=$('refreshBtn');if(btn){btn.disabled=true;btn.textContent='Zaostřuji...';}
    const st=$('st4k');if(st){st.textContent='Generuji ostrý render (čistě z textu)...';st.className='st ld';}
    try{
      // Walk the ancestry to collect ALL edits for this version
      const editChain=[];
      let cur=v;
      while(cur){
        if(cur.note&&cur.note!=='Základní render'&&!cur.note.startsWith('Zaostřeno'))editChain.unshift(cur.note);
        cur=cur.parentId?state.renders.find(x=>x.dbId===cur.parentId):null;
      }
      // Build prompt with edits
      const basePrompt=$('promptOut').value.trim()||v.prompt||'';
      const editBlock=editChain.length?`\n\nThese modifications have been applied and are visible in IMAGE 1:\n${editChain.map((e,i)=>`${i+1}. ${e}`).join('\n')}`:'';

      // Send: blurry render (style ref) + SketchUp source (geometry) + prompt
      const refD=await sb.toB64(v.imgSrc);
      const srcD=await sb.toB64(sourceImg);
      const parts=[
        {inlineData:{mimeType:refD.mime,data:refD.b64}},
        {inlineData:{mimeType:srcD.mime,data:srcD.b64}},
        {text:basePrompt+editBlock+`\n\nYou are given two images:\n- IMAGE 1: A previous render showing the EXACT desired result — same lighting, colors, materials, decorations, people, everything. Use this as your visual style target. However this image has quality degradation (blur, artifacts).\n- IMAGE 2: The original SketchUp 3D model source with clean, sharp geometry.\n\nYour task: Generate a FRESH photorealistic render from the SketchUp source (IMAGE 2) that looks IDENTICAL to IMAGE 1 in every visual aspect — same lighting mood, same materials, same color grading, same decorations, same people placement — but at MAXIMUM sharpness and detail. Use IMAGE 2 for all geometry and spatial accuracy. Use IMAGE 1 ONLY for style, mood, colors, and content reference. The result must be perfectly crisp with zero blur.`}
      ];
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'2K'}}})
      });
      const d=await r.json();if(d.error)throw new Error(d.error.message);
      for(const p of d.candidates[0].content.parts){if(p.inlineData){
        const imgSrc=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        const ver=state.renders.length+1;
        const newV={id:ver,imgSrc,note:'Zaostřeno z v'+v.id,prompt:'Refresh/sharpen',cost:CPR,parentId:v.dbId};
        const fname=`render-s${state.curScene.id}-v${ver}-${Date.now()}.png`;
        const url=await sb.uploadImg(imgSrc,fname);
        const row={version:ver,scene_id:state.curScene.id,note:newV.note,prompt:newV.prompt,cost:CPR,parent_id:v.dbId,image_path:url};
        const saved=await sb.post('/rest/v1/renders',row,{'Prefer':'return=representation'});
        newV.imgSrc=url;newV.dbId=saved?.[0]?.id;
        state.renders.push(newV);state.iterateFromId=newV.id;
        iter.renderStrip();ui.showRender(newV);ui.updIterCount();
        if(st){st.textContent='Zaostřeno!';setTimeout(()=>{st.textContent='';},3000);}
        toast('Ostrá verze vytvořena jako v'+ver);
      }}
    }catch(e){if(st){st.textContent=e.message;st.className='st er';}}
    if(btn){btn.disabled=false;btn.textContent='Zaostřit';}
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
  loadToRender(id){
    const v=state.renders.find(x=>x.id===id);if(!v)return;
    state.iterateFromId=v.id;
    ui.showRender(v);
    $('refineBox').style.display='block';
    $('refIn').placeholder=`Iteruji z v${v.id} — nebo zaškrtni rychlé úpravy`;
    scene.goStep(3);
  },
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
   MASTER MARINADA
   ============================================================ */
const master = {
  left: null,   // {imgSrc, note, sessionName, sceneName, version, sourceImg, prompt}
  right: null,
  source: 'left',
  picking: null,
  attrs: {},
  TOGGLES: [
    {key:'lighting', name:'Osvětlení', prompt_l:'lighting, shadows, time of day, and light color temperature from IMAGE 1 (left)', prompt_r:'lighting, shadows, time of day, and light color temperature from IMAGE 2 (right)'},
    {key:'materials', name:'Materiály a podlaha', prompt_l:'floor material, wall finishes, surface textures, and material colors from IMAGE 1 (left)', prompt_r:'floor material, wall finishes, surface textures, and material colors from IMAGE 2 (right)'},
    {key:'colors', name:'Barvy a nálada', prompt_l:'overall color grading, contrast, saturation, and mood from IMAGE 1 (left)', prompt_r:'overall color grading, contrast, saturation, and mood from IMAGE 2 (right)'},
    {key:'furniture', name:'Nábytek a dekorace', prompt_l:'furniture style, decorations, and objects from IMAGE 1 (left)', prompt_r:'furniture style, decorations, and objects from IMAGE 2 (right)'},
    {key:'people', name:'Lidé', prompt_l:'people and activity level from IMAGE 1 (left)', prompt_r:'people and activity level from IMAGE 2 (right)'},
    {key:'vegetation', name:'Zeleň a rostliny', prompt_l:'plants and vegetation from IMAGE 1 (left)', prompt_r:'plants and vegetation from IMAGE 2 (right)'},
    {key:'windows', name:'Výhled z oken', prompt_l:'window view and outside scene from IMAGE 1 (left)', prompt_r:'window view and outside scene from IMAGE 2 (right)'},
  ],

  init(){
    master.TOGGLES.forEach(t=>{if(!master.attrs[t.key])master.attrs[t.key]='left';});
    master.renderToggles();
  },

  renderToggles(){
    const el=document.getElementById('masterToggles');if(!el)return;
    el.innerHTML=master.TOGGLES.map(t=>{
      const v=master.attrs[t.key]||'left';
      return`<div class="mtog">
        <div class="mtog-name">${t.name}</div>
        <div class="mtog-btns">
          <div class="mtog-btn ${v==='left'?'on-l':''}" onclick="master.setAttr('${t.key}','left')">Levý</div>
          <div class="mtog-btn ${v==='right'?'on-r':''}" onclick="master.setAttr('${t.key}','right')">Pravý</div>
        </div>
      </div>`;
    }).join('');
  },

  setAttr(key,side){master.attrs[key]=side;master.renderToggles();},

  setSource(el){
    document.querySelectorAll('#masterSourcePills .pill').forEach(p=>p.classList.remove('on'));
    el.classList.add('on');
    master.source=el.dataset.val;
  },

  async pick(side){
    master.picking=side;
    const el=document.getElementById('masterBrowser');
    el.style.display='flex';
    document.getElementById('masterBrowserContent').innerHTML='<div class="skeleton skel-card"></div>';
    const sessions=await sb.get('/rest/v1/sessions?select=*,scenes(id,name,source_image_path,renders(id,version,image_path,note,prompt))&order=created_at.desc');
    let html='';
    for(const s of(sessions||[])){
      const scenesHtml=(s.scenes||[]).map(sc=>{
        const renders=(sc.renders||[]).filter(r=>validUrl(r.image_path)&&r.version>0);
        if(!renders.length)return'';
        return`<div style="margin-left:0.5rem;margin-bottom:0.75rem;"><div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.35rem;">${esc(sc.name)}</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap;">${renders.map(r=>
          `<div style="width:100px;cursor:pointer;border:2px solid var(--border);border-radius:8px;overflow:hidden;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--olive)'" onmouseout="this.style.borderColor='var(--border)'" onclick="master.selectRender('${side}','${esc(s.name)}','${esc(sc.name)}','${esc(sc.source_image_path||'')}',${r.version},'${esc(r.image_path)}',\'${esc(r.note||'')}\')">
            <img src="${esc(r.image_path)}" style="width:100%;height:65px;object-fit:cover;display:block;"><div style="font-size:0.6rem;padding:0.2rem 0.3rem;color:var(--text-dim);">v${r.version}</div></div>`
        ).join('')}</div></div>`;
      }).join('');
      if(scenesHtml)html+=`<div style="margin-bottom:1.25rem;"><div style="font-family:var(--serif);font-size:1rem;margin-bottom:0.5rem;">${esc(s.name)}</div>${scenesHtml}</div>`;
    }
    document.getElementById('masterBrowserContent').innerHTML=html||'<div style="color:var(--text-light);padding:2rem;">Žádné rendery</div>';
  },

  selectRender(side,sessionName,sceneName,sourceImg,version,imgPath,note){
    master[side]={sessionName,sceneName,sourceImg,version,imgPath,note};
    master.closeBrowser();
    master.renderPick(side);
    if(master.left&&master.right)document.getElementById('masterControls').style.display='';
  },

  closeBrowser(){document.getElementById('masterBrowser').style.display='none';},

  renderPick(side){
    const el=document.getElementById(side==='left'?'masterLeftPick':'masterRightPick');
    const d=master[side];
    if(!d)return;
    el.style.padding='0';el.style.borderStyle='solid';
    el.innerHTML=`<img src="${esc(d.imgPath)}" style="width:100%;height:160px;object-fit:cover;display:block;border-radius:10px;">
      <div style="padding:0.4rem 0.6rem;font-size:0.72rem;color:var(--text-dim);"><strong>${esc(d.sessionName)}</strong> > ${esc(d.sceneName)} > v${d.version}</div>`;
  },

  async generate(){
    if(!master.left||!master.right){toast('Vyber oba rendery');return;}
    const btn=document.getElementById('masterGenBtn');btn.disabled=true;btn.textContent='Generuji Master...';
    const loader=document.getElementById('masterLoader');
    loader.innerHTML='<div class="loader-dots"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div><div class="loader-track"><div class="loader-bar"></div></div><div class="loader-msg">Mixuji to nejlepší z obou...</div>';
    loader.classList.add('on');
    const st=document.getElementById('masterSt');st.textContent='';

    try{
      const userDesc=document.getElementById('masterDesc').value.trim();

      // Build per-attribute instructions from toggles
      const attrLines=master.TOGGLES.map(t=>{
        const side=master.attrs[t.key]||'left';
        return`- Use ${side==='left'?t.prompt_l:t.prompt_r}`;
      });

      let prompt=`You are given 3 images:
- IMAGE 1 (LEFT): First reference render
- IMAGE 2 (RIGHT): Second reference render
- IMAGE 3: Original SketchUp 3D model source for geometry and camera angle

Create a NEW photorealistic architectural render from the SketchUp source (IMAGE 3), combining specific visual elements from each reference render as listed below.

TAKE THESE SPECIFIC ELEMENTS:
${attrLines.join('\n')}
${userDesc?`\nADDITIONAL CHANGES: ${userDesc}`:``}

CRITICAL RULES:
- Use IMAGE 3 (SketchUp) for geometry, spatial layout, walls, and camera angle
- For EACH attribute listed above, look at the SPECIFIC image referenced and match that quality exactly
- The result must be ONE coherent photorealistic architectural photograph
- Architecture magazine quality — no artifacts, no seams, no CG look
- Everything must blend naturally into one unified image`;

      // Parts: left render, right render, source SketchUp
      const parts=[];
      const leftD=await sb.toB64(master.left.imgPath);
      parts.push({inlineData:{mimeType:leftD.mime,data:leftD.b64}});
      const rightD=await sb.toB64(master.right.imgPath);
      parts.push({inlineData:{mimeType:rightD.mime,data:rightD.b64}});

      const srcData=master.source==='left'?master.left:master.right;
      if(srcData.sourceImg&&validUrl(srcData.sourceImg)){
        const srcD=await sb.toB64(srcData.sourceImg);
        parts.push({inlineData:{mimeType:srcD.mime,data:srcD.b64}});
      }
      parts.push({text:prompt});

      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'2K'}}})
      });
      const d=await r.json();if(d.error)throw new Error(d.error.message);

      for(const p of d.candidates[0].content.parts){if(p.inlineData){
        const imgSrc=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        const fname=`master-${Date.now()}.png`;
        const url=await sb.uploadImg(imgSrc,fname);
        document.getElementById('masterResult').innerHTML=`
          <img src="${esc(url)}" style="max-width:100%;border:1px solid var(--border);border-radius:var(--r);display:block;">
          <div class="rmeta" style="margin-top:0.5rem;">L: ${esc(master.left.sessionName)} v${master.left.version} + R: ${esc(master.right.sessionName)} v${master.right.version}</div>
          <div class="btns" style="margin-top:0.75rem;">
            <button class="btn btn-o btn-sm" onclick="master.download('${esc(url)}')">Stáhnout</button>
          </div>`;
      }}
    }catch(e){st.textContent=e.message;st.className='st er';}
    loader.classList.remove('on');btn.disabled=false;btn.textContent='Vytvořit Master Marinadu';
  },

  async download(url){
    try{const r=await fetch(url);const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='master-marinada.png';a.click();URL.revokeObjectURL(a.href);}
    catch{window.open(url,'_blank');}
  },
};


/* ============================================================
   LOCAL EDIT (paint mask)
   ============================================================ */
const localEdit = {
  imgSrc: null,
  imgEl: null,
  ctx: null,
  painting: false,
  brushSize: 30,
  history: [],

  async pick(){
    master.picking='_local';
    const el=$('masterBrowser');
    el.style.display='flex';
    $('masterBrowserContent').innerHTML='<div class="skeleton skel-card"></div>';
    const sessions=await sb.get('/rest/v1/sessions?select=*,scenes(id,name,renders(id,version,image_path,note))&order=created_at.desc');
    let html='';
    for(const s of(sessions||[])){
      const scenesHtml=(s.scenes||[]).map(sc=>{
        const renders=(sc.renders||[]).filter(r=>validUrl(r.image_path)&&r.version>0);
        if(!renders.length)return'';
        return`<div style="margin-left:0.5rem;margin-bottom:0.75rem;"><div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.35rem;">${esc(sc.name)}</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap;">${renders.map(r=>
          `<div style="width:100px;cursor:pointer;border:2px solid var(--border);border-radius:8px;overflow:hidden;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--olive)'" onmouseout="this.style.borderColor='var(--border)'" onclick="localEdit.selectRender('${esc(r.image_path)}')">
            <img src="${esc(r.image_path)}" style="width:100%;height:65px;object-fit:cover;display:block;"><div style="font-size:0.6rem;padding:0.2rem 0.3rem;color:var(--text-dim);">v${r.version}</div></div>`
        ).join('')}</div></div>`;
      }).join('');
      if(scenesHtml)html+=`<div style="margin-bottom:1.25rem;"><div style="font-family:var(--serif);font-size:1rem;margin-bottom:0.5rem;">${esc(s.name)}</div>${scenesHtml}</div>`;
    }
    $('masterBrowserContent').innerHTML=html||'<div style="color:var(--text-light);padding:2rem;">Žádné rendery</div>';
  },

  async selectRender(imgPath){
    master.closeBrowser();
    localEdit.imgSrc=imgPath;
    // Show in the pick area
    const pickEl=$('localEditPick');
    pickEl.style.padding='0';pickEl.style.borderStyle='solid';
    pickEl.innerHTML=`<img src="${esc(imgPath)}" style="width:100%;max-height:200px;object-fit:cover;display:block;border-radius:10px;">`;
    // Setup canvas
    $('localEditCanvas').style.display='';
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      localEdit.imgEl=img;
      const canvas=$('localCanvas');
      // Scale to max 700px wide
      const scale=Math.min(700/img.width,1);
      canvas.width=Math.round(img.width*scale);
      canvas.height=Math.round(img.height*scale);
      localEdit.ctx=canvas.getContext('2d');
      localEdit.ctx.drawImage(img,0,0,canvas.width,canvas.height);
      localEdit.history=[localEdit.ctx.getImageData(0,0,canvas.width,canvas.height)];
      // Attach paint events
      canvas.onmousedown=e=>{localEdit.painting=true;localEdit.paint(e);};
      canvas.onmousemove=e=>{if(localEdit.painting)localEdit.paint(e);};
      canvas.onmouseup=()=>{localEdit.painting=false;localEdit.history.push(localEdit.ctx.getImageData(0,0,canvas.width,canvas.height));};
      canvas.onmouseleave=()=>{if(localEdit.painting){localEdit.painting=false;localEdit.history.push(localEdit.ctx.getImageData(0,0,canvas.width,canvas.height));}};
      // Touch
      canvas.ontouchstart=e=>{e.preventDefault();localEdit.painting=true;localEdit.paint(e.touches[0]);};
      canvas.ontouchmove=e=>{e.preventDefault();if(localEdit.painting)localEdit.paint(e.touches[0]);};
      canvas.ontouchend=()=>{localEdit.painting=false;localEdit.history.push(localEdit.ctx.getImageData(0,0,canvas.width,canvas.height));};
    };
    img.src=imgPath;
  },

  paint(e){
    if(!localEdit.ctx)return;
    const canvas=$('localCanvas');
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left)*(canvas.width/rect.width);
    const y=(e.clientY-rect.top)*(canvas.height/rect.height);
    localEdit.ctx.beginPath();
    localEdit.ctx.arc(x,y,localEdit.brushSize/2,0,Math.PI*2);
    localEdit.ctx.fillStyle='rgba(255,50,50,0.4)';
    localEdit.ctx.fill();
  },

  updateBrush(){
    localEdit.brushSize=parseInt($('localBrush').value);
    $('localBrushLabel').textContent='Štětec: '+localEdit.brushSize+'px';
  },

  clear(){
    if(!localEdit.ctx||!localEdit.imgEl)return;
    const canvas=$('localCanvas');
    localEdit.ctx.drawImage(localEdit.imgEl,0,0,canvas.width,canvas.height);
    localEdit.history=[localEdit.ctx.getImageData(0,0,canvas.width,canvas.height)];
  },

  undo(){
    if(!localEdit.ctx||localEdit.history.length<2)return;
    localEdit.history.pop();
    localEdit.ctx.putImageData(localEdit.history[localEdit.history.length-1],0,0);
  },

  async generate(){
    const prompt=$('localEditPrompt').value.trim();
    if(!prompt){toast('Napiš co tam má být');return;}
    if(!localEdit.imgSrc){toast('Vyber render');return;}
    const btn=$('localEditBtn');btn.disabled=true;btn.textContent='Upravuji...';
    const loader=$('localEditLoader');
    loader.innerHTML='<div class="loader-dots"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div><div class="loader-track"><div class="loader-bar"></div></div><div class="loader-msg">Měním vyznačenou oblast...</div>';
    loader.classList.add('on');
    const st=$('localEditSt');st.textContent='';

    try{
      // Get the canvas with red paint as data URL
      const canvas=$('localCanvas');
      const paintedDataUrl=canvas.toDataURL('image/jpeg',0.9);
      const {b64,mime}=await sb.toB64(paintedDataUrl);

      const editPrompt=`This image has areas highlighted in semi-transparent RED paint. These red-highlighted areas are the ONLY parts you should change.

INSTRUCTION: Change the red-highlighted area to: ${prompt}

CRITICAL RULES:
- ONLY modify the area covered by the red/pink highlight
- Remove the red highlight completely in the output
- Keep EVERYTHING outside the red area EXACTLY identical — same lighting, materials, colors, perspective
- The edited area must blend seamlessly with the surrounding image
- Match the lighting and perspective of the surrounding area
- Output a clean photorealistic architectural photograph with no red marks`;

      const parts=[
        {inlineData:{mimeType:mime,data:b64}},
        {text:editPrompt}
      ];

      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GK}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'2K'}}})
      });
      const d=await r.json();if(d.error)throw new Error(d.error.message);

      for(const p of d.candidates[0].content.parts){if(p.inlineData){
        const imgSrc=`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
        const fname=`local-edit-${Date.now()}.png`;
        const url=await sb.uploadImg(imgSrc,fname);
        $('localEditResult').innerHTML=`
          <img src="${esc(url)}" style="max-width:100%;border:1px solid var(--border);border-radius:var(--r);display:block;">
          <div class="rmeta" style="margin-top:0.5rem;">Lokální úprava: ${esc(prompt)}</div>
          <div class="btns" style="margin-top:0.5rem;">
            <button class="btn btn-o btn-sm" onclick="localEdit.download('${esc(url)}')">Stáhnout</button>
            <button class="btn btn-o btn-sm" onclick="localEdit.editAgain('${esc(url)}')">Upravit znovu</button>
          </div>`;
      }}
    }catch(e){st.textContent=e.message;st.className='st er';}
    loader.classList.remove('on');btn.disabled=false;btn.textContent='Upravit oblast';
  },

  async download(url){
    try{const r=await fetch(url);const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='marinada-local-edit.png';a.click();URL.revokeObjectURL(a.href);}
    catch{window.open(url,'_blank');}
  },

  async editAgain(url){
    localEdit.selectRender(url);
  },
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
          <div style="display:flex;gap:0.25rem;margin-top:0.35rem;">
            <button class="btn btn-o" style="font-size:0.58rem;padding:0.18rem 0.4rem;" onclick="event.stopPropagation();render.dl(${v.id})">Stáhnout 2K</button>
            ${has4k?`<button class="btn btn-f" style="font-size:0.58rem;padding:0.18rem 0.4rem;" onclick="event.stopPropagation();render.dl4K(${v.id})">Stáhnout 4K</button>`:''}
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
