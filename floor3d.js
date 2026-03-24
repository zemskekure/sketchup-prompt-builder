import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let floorImgData = null;
let scene3d, camera3d, renderer3d, controls3d;

// Upload
const drop = document.getElementById('floorDrop');
const fileIn = document.getElementById('floorFile');
drop.addEventListener('click', () => fileIn.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--olive)'; });
drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = ''; if (e.dataTransfer.files.length) loadFloor(e.dataTransfer.files[0]); });
fileIn.addEventListener('change', () => { if (fileIn.files.length) loadFloor(fileIn.files[0]); });

function loadFloor(f) {
  if (!f.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = e => {
    floorImgData = e.target.result;
    drop.classList.add('has');
    document.getElementById('floorHint').style.display = 'none';
    const old = drop.querySelector('img'); if (old) old.remove();
    const img = document.createElement('img'); img.src = floorImgData; drop.appendChild(img);
    document.getElementById('floor3dBtn').disabled = false;
  };
  r.readAsDataURL(f);
}

// Analyze + generate
document.getElementById('floor3dBtn').addEventListener('click', analyze3D);

async function analyze3D() {
  if (!floorImgData) return;
  const btn = document.getElementById('floor3dBtn');
  const st = document.getElementById('floorSt');
  const loader = document.getElementById('floorLoader');
  btn.disabled = true;
  loader.innerHTML = '<div class="loader-dots"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div><div class="loader-track"><div class="loader-bar"></div></div><div class="loader-msg">Analyzuji pudorys...</div>';
  loader.classList.add('on');
  st.textContent = '';

  const b64 = floorImgData.split(',')[1];
  const mime = floorImgData.split(';')[0].split(':')[1];
  const height = parseFloat(document.getElementById('floorHeight').value) || 2.8;
  const ctx = document.getElementById('floorContext').value.trim();
  const ctxLine = ctx ? ` This is: ${ctx}.` : '';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: `Analyze this architectural floor plan image.${ctxLine}

Extract ALL rooms and walls. Output ONLY valid JSON (no markdown, no explanation) in this exact format:

{
  "rooms": [
    {
      "name": "Living Room",
      "points": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
      "floor_material": "wood|tile|carpet|concrete",
      "color": "#rrggbb"
    }
  ],
  "walls": [
    {"start":[x1,y1],"end":[x2,y2],"thickness":0.15},
  ],
  "doors": [
    {"position":[x,y],"width":0.9}
  ],
  "windows": [
    {"start":[x1,y1],"end":[x2,y2]}
  ],
  "dimensions": {"width": total_width_meters, "height": total_height_meters}
}

Rules:
- All coordinates in METERS, origin at top-left corner
- Estimate real-world dimensions from the floor plan proportions and any dimension labels visible
- Points for rooms should be a closed polygon (list of [x,y] vertices)
- Wall thickness is typically 0.15-0.25m
- Include ALL walls, interior and exterior
- Include doors and windows if visible
- floor_material: guess based on room type (kitchen=tile, bedroom=wood, bathroom=tile, living=wood)
- color: a subtle pastel color for each room (different colors for different rooms)
- Output ONLY the JSON object, nothing else` }
          ]
        }]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    let text = d.content[0].text.trim();
    // Strip markdown code block if present
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    const data = JSON.parse(text);
    document.getElementById('floorJson').style.display = '';
    document.getElementById('floorJsonWrap').textContent = JSON.stringify(data, null, 2);

    loader.querySelector('.loader-msg').textContent = 'Generuji 3D model...';
    build3D(data, height);
    st.textContent = `${data.rooms?.length || 0} mistnosti, ${data.walls?.length || 0} sten`;
    st.className = 'st ld';
  } catch (e) {
    st.textContent = e.message;
    st.className = 'st er';
  }
  loader.classList.remove('on');
  btn.disabled = false;
}

// Three.js
function build3D(data, ceilingH) {
  const container = document.getElementById('floor3dCanvas');
  document.getElementById('floor3dEmpty').style.display = 'none';

  // Clean previous
  if (renderer3d) { renderer3d.dispose(); container.querySelector('canvas')?.remove(); }

  const w = container.clientWidth, h = container.clientHeight;
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0xf4f1ea);

  camera3d = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
  renderer3d = new THREE.WebGLRenderer({ antialias: true });
  renderer3d.setSize(w, h);
  renderer3d.setPixelRatio(window.devicePixelRatio);
  renderer3d.shadowMap.enabled = true;
  container.appendChild(renderer3d.domElement);

  controls3d = new OrbitControls(camera3d, renderer3d.domElement);
  controls3d.enableDamping = true;
  controls3d.dampingFactor = 0.08;
  controls3d.maxPolarAngle = Math.PI / 2.05;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene3d.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff5e6, 0.8);
  sun.position.set(10, 15, 10);
  sun.castShadow = true;
  scene3d.add(sun);
  const fill = new THREE.DirectionalLight(0xe6f0ff, 0.3);
  fill.position.set(-5, 10, -5);
  scene3d.add(fill);

  const dims = data.dimensions || { width: 10, height: 10 };
  const cx = dims.width / 2, cy = dims.height / 2;

  // Floor materials
  const floorMats = {
    wood: new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.7 }),
    tile: new THREE.MeshStandardMaterial({ color: 0xd4cfc8, roughness: 0.4 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0xa0a090, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.6 }),
  };

  // Rooms (floors)
  if (data.rooms) {
    for (const room of data.rooms) {
      if (!room.points || room.points.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(room.points[0][0] - cx, -(room.points[0][1] - cy));
      for (let i = 1; i < room.points.length; i++) {
        shape.lineTo(room.points[i][0] - cx, -(room.points[i][1] - cy));
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mat = room.color
        ? new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.6 })
        : (floorMats[room.floor_material] || floorMats.wood);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.01;
      mesh.receiveShadow = true;
      scene3d.add(mesh);

      // Room label
      addLabel(room.name, centroid(room.points, cx, cy), 0.05);
    }
  }

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width + 4, dims.height + 4),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene3d.add(ground);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.5 });
  if (data.walls) {
    for (const wall of data.walls) {
      const sx = wall.start[0] - cx, sy = wall.start[1] - cy;
      const ex = wall.end[0] - cx, ey = wall.end[1] - cy;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const thick = wall.thickness || 0.15;
      const geo = new THREE.BoxGeometry(len, ceilingH, thick);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(sx + dx / 2, ceilingH / 2, -(sy + dy / 2));
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene3d.add(mesh);
    }
  }

  // Ceiling (semi-transparent)
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width + 2, dims.height + 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = ceilingH;
  scene3d.add(ceiling);

  // Windows (blue glass in walls)
  if (data.windows) {
    const winMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.4, roughness: 0.1 });
    for (const win of data.windows) {
      const sx = win.start[0] - cx, sy = win.start[1] - cy;
      const ex = win.end[0] - cx, ey = win.end[1] - cy;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const geo = new THREE.BoxGeometry(len, ceilingH * 0.5, 0.05);
      const mesh = new THREE.Mesh(geo, winMat);
      mesh.position.set(sx + dx / 2, ceilingH * 0.6, -(sy + dy / 2));
      mesh.rotation.y = -Math.atan2(dy, dx);
      scene3d.add(mesh);
    }
  }

  // Doors (gap indicators)
  if (data.doors) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.6 });
    for (const door of data.doors) {
      const geo = new THREE.BoxGeometry(door.width || 0.9, ceilingH * 0.85, 0.06);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(door.position[0] - cx, ceilingH * 0.425, -(door.position[1] - cy));
      scene3d.add(mesh);
    }
  }

  // Camera position
  camera3d.position.set(cx * 0.8, dims.width * 0.7, cy * 1.5);
  camera3d.lookAt(0, 0, 0);
  controls3d.target.set(0, ceilingH / 3, 0);

  // Animate
  function animate() {
    requestAnimationFrame(animate);
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
}

function centroid(pts, cx, cy) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0] - cx; z += -(p[1] - cy); }
  return { x: x / pts.length, z: z / pts.length };
}

function addLabel(text, pos, y) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(pos.x, y, pos.z);
  sprite.scale.set(2, 0.5, 1);
  scene3d.add(sprite);
}
