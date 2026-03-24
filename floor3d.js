import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let floorImgData = null;
let dxfData = null;
let scene3d, camera3d, renderer3d, controls3d;
let walkMode = false;
let walkVelocity = { x: 0, z: 0 };
let walkKeys = {};
let planData = null;

// ============================================================
// UPLOAD
// ============================================================
const drop = document.getElementById('floorDrop');
const fileIn = document.getElementById('floorFile');
drop.addEventListener('click', () => fileIn.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--olive)'; });
drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = ''; if (e.dataTransfer.files.length) loadFloor(e.dataTransfer.files[0]); });
fileIn.addEventListener('change', () => { if (fileIn.files.length) loadFloor(fileIn.files[0]); });

function loadFloor(f) {
  const isDxf = f.name.toLowerCase().endsWith('.dxf');
  if (!isDxf && !f.type.startsWith('image/')) return;
  if (isDxf) {
    const r = new FileReader();
    r.onload = e => {
      dxfData = e.target.result; floorImgData = null;
      drop.classList.add('has'); drop.style.padding = '1rem';
      document.getElementById('floorHint').style.display = 'none';
      const old = drop.querySelector('img'); if (old) old.remove();
      const old2 = drop.querySelector('.dxf-label'); if (old2) old2.remove();
      const label = document.createElement('div'); label.className = 'dxf-label';
      label.style.cssText = 'font-size:0.85rem;color:var(--olive);font-weight:500;';
      label.textContent = f.name + ' (DXF)'; drop.appendChild(label);
      document.getElementById('floor3dBtn').disabled = false;
    };
    r.readAsText(f);
  } else {
    dxfData = null;
    const r = new FileReader();
    r.onload = e => {
      floorImgData = e.target.result;
      drop.classList.add('has'); drop.style.padding = '';
      document.getElementById('floorHint').style.display = 'none';
      const old = drop.querySelector('img'); if (old) old.remove();
      const old2 = drop.querySelector('.dxf-label'); if (old2) old2.remove();
      const img = document.createElement('img'); img.src = floorImgData; drop.appendChild(img);
      document.getElementById('floor3dBtn').disabled = false;
    };
    r.readAsDataURL(f);
  }
}

// ============================================================
// ANALYZE
// ============================================================
document.getElementById('floor3dBtn').addEventListener('click', analyze3D);

async function analyze3D() {
  if (!floorImgData && !dxfData) return;
  const btn = document.getElementById('floor3dBtn');
  const st = document.getElementById('floorSt');
  const loader = document.getElementById('floorLoader');
  btn.disabled = true;
  loader.innerHTML = '<div class="loader-dots"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div><div class="loader-track"><div class="loader-bar"></div></div><div class="loader-msg">Analyzuji pudorys...</div>';
  loader.classList.add('on');
  st.textContent = '';

  const height = parseFloat(document.getElementById('floorHeight').value) || 2.8;
  const ctx = document.getElementById('floorContext').value.trim();

  try {
    if (dxfData) {
      loader.querySelector('.loader-msg').textContent = 'Parsuju DXF...';
      planData = parseDXF(dxfData);
    } else {
      const b64 = floorImgData.split(',')[1];
      const mime = floorImgData.split(';')[0].split(':')[1];
      const ctxLine = ctx ? ` This is: ${ctx}.` : '';
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': window.AK, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 4096,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: `Analyze this architectural floor plan image.${ctxLine}

Your task: Extract the ACTUAL ROOMS and STRUCTURAL WALLS. Output valid JSON only.

IGNORE: Dimension lines, annotations, borders, title blocks, scale bars, furniture symbols.
FOCUS: Thick structural wall lines (exterior + interior), door/window openings.

If dimensions are in mm (like 4182), convert to meters (4.182).

Output:
{"rooms":[{"name":"Room","points":[[x,y],...],"floor_material":"wood|tile","color":"#hex"}],"walls":[{"start":[x,y],"end":[x,y],"thickness":0.2}],"doors":[{"position":[x,y],"width":0.9}],"windows":[{"start":[x,y],"end":[x,y]}],"dimensions":{"width":m,"height":m}}

Coordinates in METERS from building top-left. Only JSON, no markdown.` }
          ]}]
        })
      });
      const d = await r.json(); if (d.error) throw new Error(d.error.message);
      let text = d.content[0].text.trim();
      if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      planData = JSON.parse(text);
    }

    document.getElementById('floorJson').style.display = '';
    document.getElementById('floorJsonWrap').textContent = JSON.stringify(planData, null, 2);
    loader.querySelector('.loader-msg').textContent = 'Generuji 3D...';
    build3D(planData, height);
    st.textContent = `${planData.rooms?.length || 0} mistnosti, ${planData.walls?.length || 0} sten`;
    st.className = 'st ld';
  } catch (e) { st.textContent = e.message; st.className = 'st er'; }
  loader.classList.remove('on');
  btn.disabled = false;
}

// ============================================================
// PROCEDURAL TEXTURES
// ============================================================
function makeWoodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c4a872';
  ctx.fillRect(0, 0, 256, 256);
  // Wood grain lines
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(${140 + Math.random() * 30},${100 + Math.random() * 30},${60 + Math.random() * 20},${0.15 + Math.random() * 0.15})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y + Math.random() * 10);
    for (let x = 0; x < 256; x += 10) ctx.lineTo(x, y + Math.sin(x * 0.02) * 3 + Math.random() * 2);
    ctx.stroke();
  }
  // Plank lines
  for (let y = 0; y < 256; y += 32) {
    ctx.strokeStyle = 'rgba(100,70,40,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeTileTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e0ddd5';
  ctx.fillRect(0, 0, 256, 256);
  // Grid
  ctx.strokeStyle = 'rgba(180,170,155,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = i * 64;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
  }
  // Subtle variation per tile
  for (let tx = 0; tx < 4; tx++) {
    for (let ty = 0; ty < 4; ty++) {
      ctx.fillStyle = `rgba(${200 + Math.random() * 20},${195 + Math.random() * 20},${185 + Math.random() * 20},0.3)`;
      ctx.fillRect(tx * 64 + 2, ty * 64 + 2, 60, 60);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function makeWallTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ede5';
  ctx.fillRect(0, 0, 128, 128);
  // Subtle plaster noise
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.fillStyle = `rgba(${200 + Math.random() * 40},${195 + Math.random() * 40},${185 + Math.random() * 40},0.08)`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeCarpetTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a09880';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(${140 + Math.random() * 40},${130 + Math.random() * 40},${110 + Math.random() * 30},0.15)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// ============================================================
// BUILD 3D
// ============================================================
function build3D(data, ceilingH) {
  const container = document.getElementById('floor3dCanvas');
  document.getElementById('floor3dEmpty').style.display = 'none';

  if (renderer3d) { renderer3d.dispose(); container.querySelector('canvas')?.remove(); }

  const w = container.clientWidth, h = container.clientHeight;
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0xe8e4dc);
  scene3d.fog = new THREE.Fog(0xe8e4dc, 30, 80);

  camera3d = new THREE.PerspectiveCamera(50, w / h, 0.05, 200);
  renderer3d = new THREE.WebGLRenderer({ antialias: true });
  renderer3d.setSize(w, h);
  renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3d.shadowMap.enabled = true;
  renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
  renderer3d.toneMappingExposure = 1.1;
  container.appendChild(renderer3d.domElement);

  controls3d = new OrbitControls(camera3d, renderer3d.domElement);
  controls3d.enableDamping = true;
  controls3d.dampingFactor = 0.08;

  // Lights
  const ambient = new THREE.AmbientLight(0xfff8f0, 0.5);
  scene3d.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.0);
  sun.position.set(8, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  scene3d.add(sun);
  const fill = new THREE.DirectionalLight(0xd4e4ff, 0.3);
  fill.position.set(-5, 8, -5);
  scene3d.add(fill);
  // Hemisphere for nice ambient
  const hemi = new THREE.HemisphereLight(0xfff8f0, 0xc4b8a0, 0.3);
  scene3d.add(hemi);

  const dims = data.dimensions || { width: 10, height: 10 };
  const cx = dims.width / 2, cy = dims.height / 2;

  // Textures
  const woodTex = makeWoodTexture();
  const tileTex = makeTileTexture();
  const carpetTex = makeCarpetTexture();
  const wallTex = makeWallTexture();

  const floorMats = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6 }),
    tile: new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.3, metalness: 0.05 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.7 }),
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6 });

  // Rooms (floors)
  if (data.rooms) {
    for (const room of data.rooms) {
      if (!room.points || room.points.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(room.points[0][0] - cx, -(room.points[0][1] - cy));
      for (let i = 1; i < room.points.length; i++) shape.lineTo(room.points[i][0] - cx, -(room.points[i][1] - cy));
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mat = floorMats[room.floor_material] || floorMats.wood;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.01;
      mesh.receiveShadow = true;
      scene3d.add(mesh);
      addLabel(room.name, centroid(room.points, cx, cy), 0.15);
    }
  }

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(dims.width + 6, dims.height + 6), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene3d.add(ground);

  // Walls
  if (data.walls) {
    for (const wall of data.walls) {
      const sx = wall.start[0] - cx, sy = wall.start[1] - cy;
      const ex = wall.end[0] - cx, ey = wall.end[1] - cy;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const thick = Math.max(wall.thickness || 0.15, 0.2);
      const geo = new THREE.BoxGeometry(len, ceilingH, thick);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(sx + dx / 2, ceilingH / 2, -(sy + dy / 2));
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene3d.add(mesh);
    }
  }

  // Ceiling
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(dims.width + 2, dims.height + 2), ceilMat);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = ceilingH;
  scene3d.add(ceiling);

  // Windows
  if (data.windows) {
    const winMat = new THREE.MeshPhysicalMaterial({ color: 0x88ccee, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, transmission: 0.6 });
    for (const win of data.windows) {
      const sx = win.start[0] - cx, sy = win.start[1] - cy;
      const ex = win.end[0] - cx, ey = win.end[1] - cy;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const geo = new THREE.BoxGeometry(len, ceilingH * 0.45, 0.05);
      const mesh = new THREE.Mesh(geo, winMat);
      mesh.position.set(sx + dx / 2, ceilingH * 0.6, -(sy + dy / 2));
      mesh.rotation.y = -Math.atan2(dy, dx);
      scene3d.add(mesh);
    }
  }

  // Doors
  if (data.doors) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.5 });
    for (const door of data.doors) {
      const geo = new THREE.BoxGeometry(door.width || 0.9, ceilingH * 0.85, 0.06);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(door.position[0] - cx, ceilingH * 0.425, -(door.position[1] - cy));
      scene3d.add(mesh);
    }
  }

  // Baseboard (skirting) along walls for detail
  if (data.walls) {
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.4 });
    for (const wall of data.walls) {
      const sx = wall.start[0] - cx, sy = wall.start[1] - cy;
      const ex = wall.end[0] - cx, ey = wall.end[1] - cy;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.3) continue;
      const geo = new THREE.BoxGeometry(len, 0.08, 0.02);
      const mesh = new THREE.Mesh(geo, skirtMat);
      const thick = Math.max(wall.thickness || 0.15, 0.2);
      mesh.position.set(sx + dx / 2, 0.04, -(sy + dy / 2) + thick / 2 + 0.01);
      mesh.rotation.y = -Math.atan2(dy, dx);
      scene3d.add(mesh);
    }
  }

  // Camera
  const maxDim = Math.max(dims.width, dims.height);
  camera3d.position.set(0, maxDim * 1.0, maxDim * 0.4);
  controls3d.target.set(0, 0, 0);
  camera3d.lookAt(0, 0, 0);

  // Animate
  function animate() {
    requestAnimationFrame(animate);
    if (walkMode) updateWalk();
    controls3d.update();
    renderer3d.render(scene3d, camera3d);
  }
  animate();

  // Resize
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    camera3d.aspect = w / h;
    camera3d.updateProjectionMatrix();
    renderer3d.setSize(w, h);
  });
  ro.observe(container);

  // Show controls
  showViewControls(dims, ceilingH);
}

// ============================================================
// VIEW CONTROLS UI
// ============================================================
function showViewControls(dims, ceilingH) {
  let el = document.getElementById('floor3dControls');
  if (!el) {
    el = document.createElement('div');
    el.id = 'floor3dControls';
    el.style.cssText = 'position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:4px;z-index:10;';
    document.getElementById('floor3dCanvas').appendChild(el);
  }
  const maxDim = Math.max(dims.width, dims.height);
  el.innerHTML = `
    <button class="btn btn-o btn-sm" onclick="floor3dView('top',${maxDim},${ceilingH})" title="Shora">Shora</button>
    <button class="btn btn-o btn-sm" onclick="floor3dView('angle',${maxDim},${ceilingH})" title="Perspektiva">Perspektiva</button>
    <button class="btn btn-o btn-sm" onclick="floor3dView('walk',${maxDim},${ceilingH})" title="Pruchod" id="walkBtn">Pruchod</button>
    <button class="btn btn-o btn-sm" onclick="floor3dView('front',${maxDim},${ceilingH})" title="Zepredu">Zepredu</button>
  `;
}

// View presets (global so onclick works)
window.floor3dView = function(mode, maxDim, ceilingH) {
  if (mode === 'top') {
    walkMode = false;
    camera3d.position.set(0, maxDim * 1.3, 0.01);
    controls3d.target.set(0, 0, 0);
    controls3d.enabled = true;
    document.getElementById('walkBtn').textContent = 'Pruchod';
  } else if (mode === 'angle') {
    walkMode = false;
    camera3d.position.set(maxDim * 0.5, maxDim * 0.7, maxDim * 0.5);
    controls3d.target.set(0, 0, 0);
    controls3d.enabled = true;
    document.getElementById('walkBtn').textContent = 'Pruchod';
  } else if (mode === 'front') {
    walkMode = false;
    camera3d.position.set(0, ceilingH * 0.5, maxDim * 0.8);
    controls3d.target.set(0, ceilingH * 0.3, 0);
    controls3d.enabled = true;
    document.getElementById('walkBtn').textContent = 'Pruchod';
  } else if (mode === 'walk') {
    walkMode = !walkMode;
    if (walkMode) {
      camera3d.position.set(0, ceilingH * 0.6, 0);
      camera3d.rotation.set(0, 0, 0);
      controls3d.target.set(0, ceilingH * 0.6, -2);
      controls3d.enabled = true;
      controls3d.maxPolarAngle = Math.PI * 0.85;
      controls3d.minPolarAngle = Math.PI * 0.15;
      document.getElementById('walkBtn').textContent = 'Zastavit';
      document.getElementById('floor3dCanvas').focus();
    } else {
      controls3d.maxPolarAngle = Math.PI;
      controls3d.minPolarAngle = 0;
      document.getElementById('walkBtn').textContent = 'Pruchod';
    }
  }
};

// ============================================================
// WALK-THROUGH
// ============================================================
function updateWalk() {
  if (!walkMode) return;
  const speed = 0.08;
  const dir = new THREE.Vector3();
  camera3d.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  if (walkKeys['ArrowUp'] || walkKeys['KeyW']) camera3d.position.addScaledVector(dir, speed);
  if (walkKeys['ArrowDown'] || walkKeys['KeyS']) camera3d.position.addScaledVector(dir, -speed);
  if (walkKeys['ArrowLeft'] || walkKeys['KeyA']) camera3d.position.addScaledVector(right, -speed);
  if (walkKeys['ArrowRight'] || walkKeys['KeyD']) camera3d.position.addScaledVector(right, speed);

  // Keep at eye height
  const h = planData?.dimensions ? (parseFloat(document.getElementById('floorHeight').value) || 2.8) * 0.6 : 1.6;
  camera3d.position.y = h;
  controls3d.target.copy(camera3d.position).add(dir.multiplyScalar(2));
  controls3d.target.y = h;
}

document.addEventListener('keydown', e => { if (walkMode) { walkKeys[e.code] = true; e.preventDefault(); } });
document.addEventListener('keyup', e => { walkKeys[e.code] = false; });

// ============================================================
// HELPERS
// ============================================================
function centroid(pts, cx, cy) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0] - cx; z += -(p[1] - cy); }
  return { x: x / pts.length, z: z / pts.length };
}

function addLabel(text, pos, y) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(44,44,40,0.7)';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(pos.x, y, pos.z);
  sprite.scale.set(3, 0.4, 1);
  scene3d.add(sprite);
}

// ============================================================
// DXF PARSER
// ============================================================
function parseDXF(text) {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push({ code: parseInt(lines[i].trim()), value: lines[i + 1].trim() });
  }

  const allLines = [];
  let inEntities = false;
  let entity = null;
  let entityType = '';
  let polyPts = [];
  let debugCounts = { pairs: pairs.length, entities: 0, lines: 0, polys: 0 };

  for (const { code, value } of pairs) {
    if (code === 2 && value === 'ENTITIES') { inEntities = true; continue; }
    if (code === 0 && value === 'ENDSEC' && inEntities) { inEntities = false; continue; }
    const isEntityStart = code === 0 && (value === 'LINE' || value === 'LWPOLYLINE' || value === 'POLYLINE');
    if (!inEntities && !isEntityStart) continue;
    if (isEntityStart) inEntities = true;

    if (code === 0) {
      if (entityType === 'LINE' && entity && entity.x1 != null) {
        allLines.push({ start: [entity.x1, entity.y1], end: [entity.x2, entity.y2] });
        debugCounts.lines++;
      }
      if (entityType === 'LWPOLYLINE' && polyPts.length >= 2) {
        for (let i = 0; i < polyPts.length - 1; i++) allLines.push({ start: [...polyPts[i]], end: [...polyPts[i + 1]] });
        if (entity?.closed) allLines.push({ start: [...polyPts[polyPts.length - 1]], end: [...polyPts[0]] });
        debugCounts.polys++;
      }
      debugCounts.entities++;
      entityType = value;
      entity = {};
      polyPts = [];
    }
    if (entityType === 'LINE') {
      if (code === 10) entity.x1 = parseFloat(value);
      if (code === 20) entity.y1 = parseFloat(value);
      if (code === 11) entity.x2 = parseFloat(value);
      if (code === 21) entity.y2 = parseFloat(value);
    }
    if (entityType === 'LWPOLYLINE') {
      if (code === 70) entity.closed = (parseInt(value) & 1) === 1;
      if (code === 10) polyPts.push([parseFloat(value), 0]);
      if (code === 20 && polyPts.length) polyPts[polyPts.length - 1][1] = parseFloat(value);
    }
  }
  // Flush last
  if (entityType === 'LINE' && entity?.x1 != null) {
    allLines.push({ start: [entity.x1, entity.y1], end: [entity.x2, entity.y2] }); debugCounts.lines++;
  }
  if (entityType === 'LWPOLYLINE' && polyPts.length >= 2) {
    for (let i = 0; i < polyPts.length - 1; i++) allLines.push({ start: [...polyPts[i]], end: [...polyPts[i + 1]] });
    if (entity?.closed) allLines.push({ start: [...polyPts[polyPts.length - 1]], end: [...polyPts[0]] });
    debugCounts.polys++;
  }

  console.log('DXF debug:', debugCounts, 'raw lines:', allLines.length);
  if (!allLines.length) return { rooms: [], walls: [], doors: [], windows: [], dimensions: { width: 10, height: 10 } };

  // Outlier clipping
  const allX = [], allY = [];
  for (const l of allLines) { allX.push(l.start[0], l.end[0]); allY.push(l.start[1], l.end[1]); }
  allX.sort((a, b) => a - b); allY.sort((a, b) => a - b);
  const q1x = allX[Math.floor(allX.length * 0.05)], q3x = allX[Math.floor(allX.length * 0.95)];
  const q1y = allY[Math.floor(allY.length * 0.05)], q3y = allY[Math.floor(allY.length * 0.95)];
  const iqrX = q3x - q1x, iqrY = q3y - q1y;
  const clipMinX = q1x - iqrX * 0.5, clipMaxX = q3x + iqrX * 0.5;
  const clipMinY = q1y - iqrY * 0.5, clipMaxY = q3y + iqrY * 0.5;

  const clipped = allLines.filter(l =>
    l.start[0] >= clipMinX && l.start[0] <= clipMaxX && l.end[0] >= clipMinX && l.end[0] <= clipMaxX &&
    l.start[1] >= clipMinY && l.start[1] <= clipMaxY && l.end[1] >= clipMinY && l.end[1] <= clipMaxY
  );

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of clipped) {
    minX = Math.min(minX, l.start[0], l.end[0]); minY = Math.min(minY, l.start[1], l.end[1]);
    maxX = Math.max(maxX, l.start[0], l.end[0]); maxY = Math.max(maxY, l.start[1], l.end[1]);
  }

  const rawW = maxX - minX, rawH = maxY - minY;
  const scale = rawW > 50 ? 0.001 : 1;

  const normalized = clipped.map(l => ({
    start: [(l.start[0] - minX) * scale, (l.start[1] - minY) * scale],
    end: [(l.end[0] - minX) * scale, (l.end[1] - minY) * scale],
    thickness: 0.15
  }));

  const totalW = rawW * scale, totalH = rawH * scale;
  const filtered = normalized.filter(l => {
    const dx = l.end[0] - l.start[0], dy = l.end[1] - l.start[1];
    return Math.sqrt(dx * dx + dy * dy) > 0.3;
  });

  console.log('DXF result:', filtered.length, 'walls,', totalW.toFixed(1), 'x', totalH.toFixed(1), 'm');

  return {
    rooms: [{ name: 'Plan', points: [[0, 0], [totalW, 0], [totalW, totalH], [0, totalH]], floor_material: 'wood', color: '#d4c4a8' }],
    walls: filtered,
    doors: [],
    windows: [],
    dimensions: { width: totalW, height: totalH }
  };
}
