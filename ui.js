import { clearBalls, addBall, removeBallByType, setTrailVisible, replayAll } from './balls.js';
import { setCameraView } from './scene.js';

export function buildPitchCheckboxes(pitcherData) {
  const container = document.getElementById('pitchCheckboxes');
  container.innerHTML = '';

  const pitchGroups = {};
  for (const key in pitcherData) {
    const [type, zoneStr] = key.split(' ');
    const zone = Number(zoneStr);
    if (!pitchGroups[type]) pitchGroups[type] = {};
    pitchGroups[type][zone] = pitcherData[key];
  }

  Object.keys(pitchGroups).forEach(type => {
    const group = document.createElement('div');
    group.className = 'pitch-type-group';

    const title = document.createElement('div');
    title.className = 'pitch-type-title';
    title.textContent = type;

    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';

    for (let zone = 1; zone <= 9; zone++) {
      if (!pitchGroups[type][zone]) continue;
      const combo = `${type} ${zone}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = combo;
      cb.addEventListener('change', () => {
        if (cb.checked) addBall(pitchGroups[type][zone], combo);
        else removeBallByType(combo);
      });

      const label = document.createElement('label');
      label.htmlFor = combo; label.textContent = zone;

      const wrap = document.createElement('div');
      wrap.className = 'checkbox-group';
      wrap.appendChild(cb); wrap.appendChild(label);
      grid.appendChild(wrap);
    }

    group.appendChild(title);
    group.appendChild(grid);
    container.appendChild(group);
  });
}

export function initControls(data, setPlaying) {
  const teamSelect    = document.getElementById('teamSelect');
  const pitcherSelect = document.getElementById('pitcherSelect');
  const cameraSelect  = document.getElementById('cameraSelect');
  const replayBtn     = document.getElementById('replayBtn');
  const toggleBtn     = document.getElementById('toggleBtn');
  const trailToggle   = document.getElementById('trailToggle');

  // teams
  for (const team in data) {
    const opt = document.createElement('option');
    opt.value = team; opt.textContent = team;
    teamSelect.appendChild(opt);
  }

  teamSelect.addEventListener('change', () => {
    pitcherSelect.innerHTML = '';
    const team = teamSelect.value;
    for (const p in data[team]) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      pitcherSelect.appendChild(opt);
    }
    pitcherSelect.dispatchEvent(new Event('change'));
  });

  pitcherSelect.addEventListener('change', () => {
    clearBalls();
    const team = teamSelect.value;
    const pitcher = pitcherSelect.value;
    buildPitchCheckboxes(data[team][pitcher]);
  });

  cameraSelect.addEventListener('change', (e) => setCameraView(e.target.value));

  replayBtn.addEventListener('click', replayAll);

  toggleBtn.addEventListener('click', () => {
    const next = setPlaying(prev => !prev);
    toggleBtn.textContent = next ? 'Pause' : 'Play';
  });

  trailToggle.addEventListener('change', e => setTrailVisible(e.target.checked));

  teamSelect.selectedIndex = 0;
  teamSelect.dispatchEvent(new Event('change'));
}
