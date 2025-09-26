/* main.js — NEWPV P0 patch
   - perf trails (instanced-ish via shared geo/material reuse + throttle)
   - camera presets + persistence
   - legend
   - hotkeys
   - bugfix: ball.userData.type now set to pitchType (not undefined var)
*/

// ---------- config ----------
const TRAIL_DROP_MS = 60;              // ms between trail dots per ball
const TRAIL_LIFETIME_S = 9.5;          // seconds before trail dots auto-remove
const CAMERA_PRESETS = ['catcher', 'pitcher', 'rhh', 'lhh', '1b', '3b'];

// Locked pitch colors (keep these consistent everywhere)
const pitchColorMap = {
  'FF': 0x1f6aff, // blue
  'SI': 0xf2b01e, // yellow
  'FT': 0xf2b01e, // alias to SI color if present
  'CUT': 0xff3b30, // red
  'SL': 0x8a2be2,  // purple
  'CH': 0x26a641,  // green
  'CU': 0x13b5b1,  // teal
  'ST': 0x9aa0a6,  // gray / other
  'OTHER': 0x9aa0a6
};

// ---------- globals ----------
let scene, camera, renderer, clock;
let ground, mound, plateLight, zoneFrame;

let playing = true;
let showTrail = false;

let data = {};                       // loaded JSON
let currentTeam = null;
let currentPitcher = null;

// active balls and their meta
const balls = [];                    // { mesh, pathFn, speed, startTime, userData: { type, lastTrailAt } }
const trailDots = [];                // { mesh, t0 }

// shared resources for trail dots
const trailGeo = new THREE.SphereGeometry(0.04, 8, 8);
const trailMats = {}; // per base pitch type

// ---------- DOM ----------
const teamSelect = document.getElementById('teamSelect');
const pitcherSelect = document.getElementById('pitcherSelect');
const cameraSelect = document.getElementById('cameraSelect');
const trailToggle = document.getElementById('trailToggle');

const replayBtn = document.getElementById('replayBtn');
const toggleBtn = document.getElementById('toggleBtn'); // shows "Pause"/"Play"
const pitchCheckboxes = document.getElementById('pitchCheckboxes');
const legendEl = document.getElementById('legend');

// ---------- utils ----------
function getTrailMat(baseType){
  const key = baseType || 'OTHER';
  if (!trailMats[key]) {
    trailMats[key] = new THREE.MeshBasicMaterial({ color: pitchColorMap[key] || pitchColorMap.OTHER });
  }
  return trailMats[key];
}

function colorForPitchType(pitchType) {
  const base = (pitchType || '').split(' ')[0]; // 'CH 5' -> 'CH'
  const hex = pitchColorMap[base] || pitchColorMap.OTHER;
  return new THREE.Color(hex);
}

function clearBallsAndTrails() {
  for (const b of balls) scene.remove(b.mesh);
  balls.length = 0;

  for (const d of trailDots) scene.remove(d.mesh);
  trailDots.length = 0;
}

function updateLegend(pitcherData){
  if (!legendEl) return;
  const present = new Set(
    Object.keys(pitcherData || {}).map(k => (k.split(' ')[0]))
  );
  if (!present.size) { legendEl.style.display = 'none'; return; }

  const rows = [...present].sort().map(t=>{
    const hex = '#' + (pitchColorMap[t] || pitchColorMap.OTHER).toString(16).padStart(6, '0');
    return `<span style="display:inline-flex;align-items:center;gap:8px;margin-right:10px;">
      <span style="width:12px;height:12px;border-radius:50%;background:${hex};display:inline-block;"></span>${t}
    </span>`;
  });
  legendEl.innerHTML = rows.join(' ');
  legendEl.style.display = 'block';
}

// Build 3×3 checkbox grid per pitch type (keys like "CH 5", "SL 7", etc.)
function addCheckboxes(pitcherData) {
  pitchCheckboxes.innerHTML = ''; // wipe

  // Group keys by base type
  const byType = {};
  Object.keys(pitcherData || {}).forEach(k=>{
    const [base, zone] = k.split(' ');
    if (!byType[base]) byType[base] = [];
    byType[base].push(Number(zone));
  });

  // Render groups in alphabetical order
  Object.keys(byType).sort().forEach(base=>{
    const group = document.createElement('div');
    group.className = 'pitch-group';

    const header = document.createElement('div');
    header.className = 'pitch-group-title';
    header.innerText = base;
    group.appendChild(header);

    // 1..9 grid
    const grid = document.createElement('div');
    grid.className = 'zone-grid';
    for (let z = 1; z <= 9; z++) {
      const label = document.createElement('label');
      label.className = 'zone-cell';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `${base} ${z}`;
      cb.dataset.base = base;
      cb.dataset.zone = z;
      cb.checked = (byType[base].indexOf(z) !== -1); // default on if present

      cb.addEventListener('change', (e)=>{
        const id = `${base} ${z}`;
        if (cb.checked) {
          spawnPitch(id, pitcherData[id]);
        } else {
          removePitch(id);
        }
      });

      label.appendChild(cb);
      label.appendChild(document.createTextNode(z.toString()));
      grid.appendChild(label);

      // initial spawn if present + default on
      if (cb.checked && pitcherData[`${base} ${z}`]) {
        spawnPitch(`${base} ${z}`, pitcherData[`${base} ${z}`]);
      }
    }
    group.appendChild(grid);
    pitchCheckboxes.appendChild(group);
  });
}

function removePitch(pitchType) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b.mesh.userData && b.mesh.userData.type === pitchType) {
      scene.remove(b.mesh);
      balls.splice(i, 1);
    }
  }
  // also remove associated trail dots
  for (let i = trailDots.length - 1; i >= 0; i--) {
    const d = trailDots[i];
    if (d.mesh.userData && d.mesh.userData.type === pitchType) {
      scene.remove(d.mesh);
      trailDots.splice(i, 1);
    }
  }
}

function spawnPitch(pitchType, pitchObj) {
  if (!pitchObj) return;

  // Ball
  const geom = new THREE.SphereGeometry(0.12, 16, 16);
  const mat = new THREE.MeshPhongMaterial({ color: colorForPitchType(pitchType) });
  const ball = new THREE.Mesh(geom, mat);
  ball.castShadow = true;

  // Start at release (assumes object has release_pos_x/y/z)
  const rx = Number(pitchObj['release_pos_x_ft'] ?? pitchObj['release_pos_x'] ?? -2.0);
  const ry = Number(pitchObj['release_pos_y_ft'] ?? pitchObj['release_pos_y'] ?? 6.0);
  const rz = Number(pitchObj['release_pos_z_ft'] ?? pitchObj['release_pos_z'] ?? -54.0);

  ball.position.set(rx, ry, rz);
  scene.add(ball);

  // Path function: simple parameterization using provided approach vector / polyline if present.
  // Expect an array `path` of {x,y,z,t}. If not, fall back to linear to plate.
  const path = Array.isArray(pitchObj.path) ? pitchObj.path.slice().sort((a,b)=>a.t-b.t) : null;

  const plateX = Number(pitchObj['plate_x_ft'] ?? pitchObj['plate_x'] ?? 0);
  const plateY = Number(pitchObj['plate_y_ft'] ?? pitchObj['plate_y'] ?? 2.5);
  const plateZ = Number(pitchObj['plate_z_ft'] ?? pitchObj['plate_z'] ?? -60.5);

  const travelS = Number(pitchObj['time_to_plate_s'] ?? 0.45);

  function lerp(a,b,t){ return a+(b-a)*t; }
  function pathFn(t){ // t in [0,1]
    if (path && path.length >= 2) {
      const T = t * (path[path.length-1].t - path[0].t) + path[0].t;
      // find segment
      let i = 0;
      while (i < path.length-1 && path[i+1].t < T) i++;
      const p0 = path[i], p1 = path[Math.min(i+1, path.length-1)];
      const u = (T - p0.t) / Math.max(1e-6, (p1.t - p0.t));
      return { x: lerp(p0.x, p1.x, u), y: lerp(p0.y, p1.y, u), z: lerp(p0.z, p1.z, u) };
    } else {
      return { x: lerp(rx, plateX, t), y: lerp(ry, plateY, t), z: lerp(rz, plateZ, t) };
    }
  }

  balls.push({
    mesh: ball,
    pathFn,
    startTime: clock.getElapsedTime(),
    duration: Math.max(0.15, travelS || 0.45),
    userData: { type: pitchType, lastTrailAt: 0 }
  });

  // IMPORTANT: store the type correctly (bugfix vs old code)
  ball.userData.type = pitchType;
}

// ---------- scene ----------
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181a1b);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 6, 16);
  camera.lookAt(0, 2.5, -60.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // lights
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  dir.castShadow = true;
  scene.add(dir);

  plateLight = new THREE.PointLight(0xffffff, 0.6, 50, 2.0);
  plateLight.position.set(0, 3.0, -60.5);
  scene.add(plateLight);

  // ground
  const g = new THREE.PlaneGeometry(300, 300);
  const gMat = new THREE.MeshPhongMaterial({ color: 0x2e7d53, shininess: 10 });
  ground = new THREE.Mesh(g, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // mound (simple)
  const moundGeo = new THREE.CylinderGeometry(0.8, 2.0, 0.25, 24);
  const moundMat = new THREE.MeshPhongMaterial({ color: 0xcd7f32 });
  mound = new THREE.Mesh(moundGeo, moundMat);
  mound.position.set(0, 0.125, -54.5);
  mound.castShadow = true;
  scene.add(mound);

  // strike zone frame (clear, bright)
  const zoneGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0));
  const zoneMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
  zoneFrame = new THREE.LineSegments(zoneGeom, zoneMat);
  zoneFrame.position.set(0, 2.5, -60.5);
  scene.add(zoneFrame);

  // viewport
  window.addEventListener('resize', onResize, false);

  clock = new THREE.Clock();
}

function onResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- camera presets ----------
function applyCameraPreset(view){
  switch (view) {
    case 'catcher':
      camera.position.set(0, 6, 16);
      camera.lookAt(0, 2.5, -60.5);
      break;
    case 'pitcher':
      camera.position.set(0, 5.0, -52);
      camera.lookAt(0, 2.4, -60.5);
      break;
    case 'rhh':
      camera.position.set(1.6, 4.2, -64);
      camera.lookAt(0, 2.4, -60.5);
      break;
    case 'lhh':
      camera.position.set(-1.6, 4.2, -64);
      camera.lookAt(0, 2.4, -60.5);
      break;
    case '1b':
      camera.position.set(28, 9, -46);
      camera.lookAt(0, 2.5, -60.5);
      break;
    case '3b':
      camera.position.set(-28, 9, -46);
      camera.lookAt(0, 2.5, -60.5);
      break;
    default:
      camera.position.set(0, 6, 16);
      camera.lookAt(0, 2.5, -60.5);
  }
  // persist
  try { localStorage.setItem('newpv_camera', view); } catch {}
}

// ---------- data load + UI ----------
async function loadData() {
  // Expect a global window.pitchData OR fetch from ./pitch_data.json
  if (window.pitchData) {
    data = window.pitchData;
  } else {
    // Adjust the URL to your actual large JSON path
    const res = await fetch('./pitch_data.json', { cache: 'no-store' });
    data = await res.json();
  }

  // Populate team select
  teamSelect.innerHTML = '';
  Object.keys(data).sort().forEach(team=>{
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    teamSelect.appendChild(opt);
  });

  // restore saved camera preset
  try {
    const saved = localStorage.getItem('newpv_camera');
    cameraSelect.value = (saved && CAMERA_PRESETS.includes(saved)) ? saved : cameraSelect.value;
  } catch {}

  // Set initial team/pitcher
  currentTeam = teamSelect.value;
  populatePitchers(currentTeam);

  // start with first pitcher
  currentPitcher = pitcherSelect.value;
  refreshPitcher();
}

function populatePitchers(team) {
  pitcherSelect.innerHTML = '';
  const list = Object.keys(data[team] || {}).sort();
  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    pitcherSelect.appendChild(opt);
  }
}

function refreshPitcher() {
  clearBallsAndTrails();
  const pitcherData = (data[currentTeam] && data[currentTeam][currentPitcher]) || {};
  addCheckboxes(pitcherData);
  updateLegend(pitcherData);
}

// ---------- animate loop ----------
function animate() {
  requestAnimationFrame(animate);

  const now = clock.getElapsedTime();

  // minor specular hint
  if (plateLight) plateLight.position.y = 2.8 + 0.2 * Math.sin(now * 0.6);

  // move balls
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    const t = playing ? (now - b.startTime) / b.duration : Math.min(1, (balls[i]._lastT || 0));
    balls[i]._lastT = t;

    const pos = b.pathFn(Math.min(1, Math.max(0, t)));
    b.mesh.position.set(pos.x, pos.y, pos.z);

    // drop trail dot (throttled)
    if (showTrail) {
      const last = b.userData.lastTrailAt || 0;
      const msNow = now * 1000;
      if (msNow - last >= TRAIL_DROP_MS) {
        const baseType = (b.mesh.userData.type || 'OTHER').split(' ')[0];
        const dot = new THREE.Mesh(trailGeo, getTrailMat(baseType));
        dot.position.copy(b.mesh.position);
        dot.userData = { type: b.mesh.userData.type, born: now };
        scene.add(dot);
        trailDots.push({ mesh: dot, t0: now });
        b.userData.lastTrailAt = msNow;
      }
    }

    // if finished, loop (for continuous demo)
    if (t >= 1.0) {
      b.startTime = now;
    }
  }

  // clean up old trail dots
  for (let i = trailDots.length - 1; i >= 0; i--) {
    if (now - trailDots[i].t0 > TRAIL_LIFETIME_S) {
      scene.remove(trailDots[i].mesh);
      trailDots.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

// ---------- event wiring ----------
teamSelect.addEventListener('change', ()=>{
  currentTeam = teamSelect.value;
  populatePitchers(currentTeam);
  currentPitcher = pitcherSelect.value;
  refreshPitcher();
});

pitcherSelect.addEventListener('change', ()=>{
  currentPitcher = pitcherSelect.value;
  refreshPitcher();
});

cameraSelect.addEventListener('change', ()=>{
  applyCameraPreset(cameraSelect.value);
});

trailToggle.addEventListener('change', ()=>{
  showTrail = !!trailToggle.checked;
  if (!showTrail) {
    // clear existing dots when user disables trail
    for (const d of trailDots) scene.remove(d.mesh);
    trailDots.length = 0;
  }
});

// Replay: reset all balls' start times (keeps selections intact)
if (replayBtn) {
  replayBtn.addEventListener('click', ()=>{
    const now = clock.getElapsedTime();
    balls.forEach(b => { b.startTime = now; b._lastT = 0; });
    // clear trails on replay for clarity
    for (const d of trailDots) scene.remove(d.mesh);
    trailDots.length = 0;
  });
}

// Toggle play/pause
if (toggleBtn) {
  toggleBtn.addEventListener('click', ()=>{
    playing = !playing;
    toggleBtn.textContent = playing ? 'Pause' : 'Play';
  });
}

// Hotkeys: Space (play/pause), T (trail), C (camera cycle), 1–9 (toggle zone)
window.addEventListener('keydown', (e)=>{
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

  if (e.code === 'Space') {
    playing = !playing;
    if (toggleBtn) toggleBtn.textContent = playing ? 'Pause' : 'Play';
    e.preventDefault();
    return;
  }
  if (e.key === 't' || e.key === 'T') {
    trailToggle.checked = !trailToggle.checked;
    trailToggle.dispatchEvent(new Event('change'));
    return;
  }
  if (e.key === 'c' || e.key === 'C') {
    const order = CAMERA_PRESETS;
    const i = order.indexOf(cameraSelect.value);
    cameraSelect.value = order[(i + 1) % order.length];
    cameraSelect.dispatchEvent(new Event('change'));
    return;
  }
  if (e.key >= '1' && e.key <= '9') {
    const z = e.key;
    // toggle any checkbox ending with " z"
    const boxes = pitchCheckboxes.querySelectorAll(`input[type="checkbox"][id$=" ${z}"]`);
    if (boxes.length) {
      boxes.forEach(cb=>{
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });
    }
    return;
  }
});

// ---------- boot ----------
(async function main(){
  setupScene();

  // apply saved or default camera
  const saved = (()=>{ try { return localStorage.getItem('newpv_camera'); } catch { return null; } })();
  applyCameraPreset(saved && CAMERA_PRESETS.includes(saved) ? saved : cameraSelect.value);

  await loadData();
  animate();
})();
