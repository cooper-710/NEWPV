import { clearBalls, addBall, removeBallByType, replayAll, setTrailVisible } from './balls.js';
import { setCameraView } from './scene.js';

let _state = { team: null, pitcher: null };

// ---------- Metrics ----------
const metricsPanel = document.getElementById('metricsPanel');
metricsPanel.style.display = 'block';
metricsPanel.classList.add('panel');

const fmt = (v, d = 1) => {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(d);
};
const ftpsToMph = (ftps) => Number(ftps) / 1.4666667;

function renderMetrics(raw) {
  if (!raw) return;

  const spinRaw = raw.release_spin_rate ?? raw.spin_rate ?? raw.spin ?? null;
  const speedRaw = raw.release_speed ?? raw.mph ?? raw.velo ?? raw.velocity ?? null;
  const mph = speedRaw != null
    ? (Number(speedRaw) > 120 ? ftpsToMph(speedRaw) : Number(speedRaw))
    : null;

  const hMove = raw.movement_horizontal ?? raw.hmov ?? raw.hb ?? raw.horizontal_break ?? null;
  const vMove = raw.movement_vertical   ?? raw.vmov ?? raw.ivb ?? raw.vertical_break ?? null;

  metricsPanel.innerHTML = `
    <div class="metrics-header">Metrics</div>
    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-label">Velo</div>
        <div class="metric-value">${fmt(mph, 1)}<span class="metric-unit"> mph</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">Spin</div>
        <div class="metric-value">${fmt(spinRaw, 0)}<span class="metric-unit"> rpm</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">Horiz. Move</div>
        <div class="metric-value">${fmt(hMove, 1)}<span class="metric-unit"> in</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">Vert. Move</div>
        <div class="metric-value">${fmt(vMove, 1)}<span class="metric-unit"> in</span></div>
      </div>
    </div>
  `;
}

// Public helper so other modules can push a pitch object
export function setMetricsFromPitch(raw) { renderMetrics(raw); }

// Try to subscribe if a Bus is available (non-fatal if not)
(async () => {
  try {
    const mod = await import('./data.js');
    const Bus = mod?.Bus;
    if (Bus && typeof Bus.on === 'function') {
      Bus.on('frameStats', (s) => renderMetrics(s?.last || s));
    }
  } catch (_) {}
})();

// ---------- Pitch Checkbox Builder ----------
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
        if (cb.checked) {
          const sample = pitchGroups[type][zone];
          addBall(sample, combo);
          setMetricsFromPitch(sample); // show metrics immediately
        } else {
          removeBallByType(combo);
        }
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

// ---------- Controls ----------
export function initControls(data, setPlaying) {
  const teamSelect    = document.getElementById('teamSelect');
  const pitcherSelect = document.getElementById('pitcherSelect');
  const cameraSelect  = document.getElementById('cameraSelect');
  const replayBtn     = document.getElementById('replayBtn');
  const toggleBtn     = document.getElementById('toggleBtn');
  const trailToggle   = document.getElementById('trailToggle');

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

    const firstKey = Object.keys(data[_state.team][_state.pitcher])[0];
    if (firstKey) renderMetrics(data[_state.team][_state.pitcher][firstKey]);
  });

  cameraSelect.addEventListener('change', (e) => {
    setCameraView(e.target.value);
    _writeUrl();
  });

  replayBtn.addEventListener('click', replayAll);

  toggleBtn.addEventListener('click', () => {
    const next = setPlaying(prev => !prev);
    toggleBtn.textContent = next ? 'Pause' : 'Play';
  });

  trailToggle.addEventListener('change', e => {
    setTrailVisible(e.target.checked);
    _writeUrl();
  });

  const params = new URLSearchParams(location.search);
  const wantTeam    = params.get('team');
  const wantPitcher = params.get('pitcher');
  const wantView    = params.get('view');
  const wantTrail   = params.get('trail');

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
