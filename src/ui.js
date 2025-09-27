import { clearBalls, addBall, removeBallByType, setTrailVisible, replayAll } from './balls.js';
import { setCameraView } from './scene.js';
import { Bus } from './data.js';

let _state = { team: null, pitcher: null };

export function buildPitchCheckboxes(pitcherData) {
  const container = document.getElementById('pitchCheckboxes');
  container.innerHTML = '';

  const pitchGroups = {};
  for (const key in pitcherData) {
    const [type, zoneStr] = key.split(' ');
    const zone = Number(zoneStr);
    (pitchGroups[type] ||= {})[zone] = pitcherData[key];
  }

  Object.keys(pitchGroups).forEach(type => {
    const group = document.createElement('div');
    group.className = 'pitch-type-group';

    const head = document.createElement('div');
    head.className = 'pitch-type-title';
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';

    const title = document.createElement('span');
    title.textContent = type;

    const master = document.createElement('input');
    master.type = 'checkbox';
    master.title = 'Toggle all zones';

    head.appendChild(title);
    head.appendChild(master);

    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';

    const zoneBoxes = [];

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
      zoneBoxes.push(cb);
    }

    master.addEventListener('change', () => {
      const want = master.checked;
      zoneBoxes.forEach(cb => {
        if (cb.checked !== want) {
          cb.checked = want;
          cb.dispatchEvent(new Event('change'));
        }
      });
    });

    group.appendChild(head);
    group.appendChild(grid);
    container.appendChild(group);
  });

  // Clear All
  const clr = document.createElement('button');
  clr.textContent = 'Clear All';
  clr.addEventListener('click', () => {
    document.querySelectorAll('#pitchCheckboxes input[type="checkbox"]').forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      }
    });
  });
  container.appendChild(clr);
}

export function initControls(data, setPlaying) {
  const teamSelect    = document.getElementById('teamSelect');
  const pitcherSelect = document.getElementById('pitcherSelect');
  const cameraSelect  = document.getElementById('cameraSelect');
  const replayBtn     = document.getElementById('replayBtn');
  const toggleBtn     = document.getElementById('toggleBtn');
  const trailToggle   = document.getElementById('trailToggle');
  const metricsPanel  = document.getElementById('metricsPanel');

  // teams
  for (const team in data) {
    const opt = document.createElement('option');
    opt.value = team; opt.textContent = team;
    teamSelect.appendChild(opt);
  }

  teamSelect.addEventListener('change', () => {
    pitcherSelect.innerHTML = '';
    _state.team = teamSelect.value;
    for (const p in data[_state.team]) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      pitcherSelect.appendChild(opt);
    }
    pitcherSelect.dispatchEvent(new Event('change'));
    _writeUrl();
  });

  pitcherSelect.addEventListener('change', () => {
    _state.pitcher = pitcherSelect.value;
    clearBalls();
    buildPitchCheckboxes(data[_state.team][_state.pitcher]);
    _writeUrl();
  });

  cameraSelect.addEventListener('change', (e) => { setCameraView(e.target.value); _writeUrl(); });

  replayBtn.addEventListener('click', replayAll);

  toggleBtn.addEventListener('click', () => {
    const next = setPlaying(prev => !prev);
    toggleBtn.textContent = next ? 'Pause' : 'Play';
  });

  trailToggle.addEventListener('change', e => { setTrailVisible(e.target.checked); _writeUrl(); });

  // live metrics (no FPS)
  metricsPanel.style.display = 'block';
  Bus.on('frameStats', (s) => {
    metricsPanel.innerHTML =
      `<b>Metrics</b><br>
       Velo: ${s.last.mph} mph 
       Spin: ${s.last.spin} rpm
       IVB: ${s.last.ivb} in
       HB: ${s.last.hb} in`
       ;
  });

  // init from URL (if present), else defaults
  const params = new URLSearchParams(location.search);
  const wantTeam = params.get('team');
  const wantPitcher = params.get('pitcher');
  const wantView = params.get('view');
  const wantTrail = params.get('trail');

  if (wantTeam && data[wantTeam]) {
    teamSelect.value = wantTeam;
    teamSelect.dispatchEvent(new Event('change'));
    if (wantPitcher && data[wantTeam][wantPitcher]) {
      pitcherSelect.value = wantPitcher;
      pitcherSelect.dispatchEvent(new Event('change'));
    }
  } else {
    teamSelect.selectedIndex = 0;
    teamSelect.dispatchEvent(new Event('change'));
  }

  if (wantView) {
    cameraSelect.value = wantView;
    cameraSelect.dispatchEvent(new Event('change'));
  }
  if (wantTrail) {
    trailToggle.checked = (wantTrail === '1' || wantTrail === 'true');
    trailToggle.dispatchEvent(new Event('change'));
  }

  function _writeUrl() {
    const q = new URLSearchParams({
      team: _state.team || '',
      pitcher: _state.pitcher || '',
      view: cameraSelect.value || '',
      trail: trailToggle.checked ? '1' : '0'
    });
    const newUrl = `${location.pathname}?${q.toString()}`;
    history.replaceState(null, '', newUrl);
  }
}
