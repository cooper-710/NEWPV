let trailDots = []; // holds {mesh, t0}
let expiredTrailDots = [];
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';



// === UI Styling (Professional + Mobile-Responsive) ===

const style = document.createElement('style');

style.innerHTML = `

  #pitchCheckboxes {

    display: grid;

    grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));

    gap: 6px;

    margin-bottom: 12px;

  }

  .checkbox-group {

    display: flex;

    align-items: center;

    gap: 6px;

    background: rgba(255, 255, 255, 0.05);

    padding: 4px 8px;

    border-radius: 6px;

  }

  .checkbox-group label {

    font-size: 13px;

  }

  label {

    font-size: 14px;

    display: block;

    margin-bottom: 4px;

  }

  select, button {

    width: 100%;

    padding: 6px 10px;

    margin-bottom: 12px;

    border-radius: 6px;

    border: none;

    font-size: 14px;

    background: #333;

    color: white;

    font-family: 'Segoe UI', sans-serif;

  }

  #controls {

    position: absolute;

    top: 12px;

    left: 12px;

    background: rgba(0, 0, 0, 0.4);

    padding: 16px;

    border-radius: 12px;

    z-index: 100;

    max-width: 90vw;

    color: white;

    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);

  }

  @media (max-width: 600px) {

    #controls {

      font-size: 12px;

      padding: 12px;

      top: auto;

      bottom: 12px;

      left: 12px;

      right: 12px;

    }

    select, button {

      font-size: 13px;

    }

  }

`;

document.head.appendChild(style);



let scene, camera, renderer, pitchData = {}, balls = [];

let activeTypes = new Set(), playing = true;
let showTrail = false;

const pitchColorMap = {
  FF: 0xff0000, SL: 0x0000ff, CH: 0x008000, KC: 0x4B0082,
  SI: 0xFFA500, CU: 0x800080, FC: 0x808080, ST: 0x008080,
  FS: 0x00CED1, EP: 0xFF69B4, KN: 0xA9A9A9, SC: 0x708090,
  SV: 0x000000, CS: 0xA52A2A, FO: 0xDAA520
};


let lastTime = 0;

const clock = new THREE.Clock();



async function loadPitchData() {

  const res = await fetch('./pitch_data.json');

  return await res.json();

}

function createHalfColorMaterial(pitchType) {

  const colorMap = {

    FF: '#FF0000', SL: '#0000FF', CH: '#008000', KC: '#4B0082',

    SI: '#FFA500', CU: '#800080', FC: '#808080', ST: '#008080',

    FS: '#00CED1', EP: '#FF69B4', KN: '#A9A9A9', SC: '#708090',

    SV: '#000000', CS: '#A52A2A', FO: '#DAA520'

  };



  const baseType = pitchType.split(' ')[0];
  const hex = colorMap[baseType] || '#888888';



  const canvas = document.createElement('canvas');

  canvas.width = 2;

  canvas.height = 2;

  const ctx = canvas.getContext('2d');



  ctx.fillStyle = hex;

  ctx.fillRect(0, 0, 2, 1);

  ctx.fillStyle = '#FFFFFF';

  ctx.fillRect(0, 1, 2, 1);



  const texture = new THREE.CanvasTexture(canvas);

  texture.minFilter = THREE.NearestFilter;

  texture.magFilter = THREE.NearestFilter;



  return new THREE.MeshStandardMaterial({

    map: texture,

    roughness: 0.4,

    metalness: 0.1

  });

}



function getSpinAxisVector(degrees) {

  const radians = THREE.MathUtils.degToRad(degrees);

  return new THREE.Vector3(Math.cos(radians), 0, Math.sin(radians)).normalize();

}



function setupScene() {

  const canvas = document.getElementById('three-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.shadowMap.enabled = true;

  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // enables soft shadowing



  scene = new THREE.Scene();

  scene.background = new THREE.Color(0x222222);



  // === Mound ===

  const moundGeometry = new THREE.CylinderGeometry(2.0, 9, 2.0, 64);

  const moundMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown

  const mound = new THREE.Mesh(moundGeometry, moundMaterial);

  mound.position.set(0, 0, 0);  // Just beneath the pitch release point

  scene.add(mound);

  mound.receiveShadow = true;

  mound.castShadow = false;





  // === Pitcher's Rubber ===

  const rubberGeometry = new THREE.BoxGeometry(1, 0.05, 0.18); // Width, height, depth in feet

  const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const rubber = new THREE.Mesh(rubberGeometry, rubberMaterial);

  rubber.position.set(0, 1.05, 0);

  scene.add(rubber);

  rubber.castShadow = true;

  rubber.receiveShadow = true;





  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

  camera.position.set(0, 2.5, -65);

  camera.lookAt(0, 2.5, 0);

  scene.add(camera);

  

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));



  const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x8b4513, 0.4); 

// Sky blue tint from above, dirt brown bounce from below

  scene.add(hemiLight);



  

  const dirLight = new THREE.DirectionalLight(0xfff0e5, 1.0); // warm sunlight

  dirLight.position.set(5, 10, 5);

  dirLight.castShadow = true;



  dirLight.shadow.mapSize.width = 1024;

  dirLight.shadow.mapSize.height = 1024;

  dirLight.shadow.camera.near = 1;

  dirLight.shadow.camera.far = 100;

  dirLight.shadow.camera.left = -20;

  dirLight.shadow.camera.right = 20;

  dirLight.shadow.camera.top = 20;

  dirLight.shadow.camera.bottom = -20;



  const dirTarget = new THREE.Object3D();

  dirTarget.position.set(0, 0, 0);

  scene.add(dirTarget);

  dirLight.target = dirTarget;



  scene.add(dirLight);







  const plateLight = new THREE.PointLight(0xffffff, 0.6, 100);

  plateLight.position.set(0, 3, -60.5);

  scene.add(plateLight);



  const ground = new THREE.Mesh(

    new THREE.PlaneGeometry(200, 200),

    new THREE.MeshStandardMaterial({ color: 0x1e472d, roughness: 1 })

  );

  ground.rotation.x = -Math.PI / 2;

  scene.add(ground);

  ground.receiveShadow = true;



  const zone = new THREE.LineSegments(

    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0)),

    new THREE.LineBasicMaterial({ color: 0xffffff })

  );

  zone.position.set(0, 2.5, -60.5);

  scene.add(zone);



  const shape = new THREE.Shape();

  shape.moveTo(-0.85, 0);

  shape.lineTo(0.85, 0);

  shape.lineTo(0.85, 0.5);

  shape.lineTo(0, 1.0);

  shape.lineTo(-0.85, 0.5);

  shape.lineTo(-0.85, 0);

  const plate = new THREE.Mesh(

    new THREE.ShapeGeometry(shape),

    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })

  );

  plate.rotation.x = -Math.PI / 2;

  plate.position.set(0, 0.011, -60.5);

  scene.add(plate);



  window.addEventListener('resize', () => {

    camera.aspect = window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

  });

}



function clearBalls() {
  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];

  for (let ball of balls) scene.remove(ball);
  balls = [];

  activeTypes.clear();
  document.getElementById('pitchCheckboxes').innerHTML = '';
}




function addCheckboxes(pitcherData) {
  const container = document.getElementById('pitchCheckboxes');
  container.innerHTML = '';

  const pitchGroups = {};

  for (const key in pitcherData) {
    const [pitchType, zone] = key.split(' ');
    if (!pitchGroups[pitchType]) pitchGroups[pitchType] = {};
    pitchGroups[pitchType][Number(zone)] = pitcherData[key];
  }

  Object.keys(pitchGroups).forEach(pitchType => {
    const group = document.createElement('div');
    group.className = 'pitch-type-group';
    group.style.display = 'block'; // guaranteed block layout

    const title = document.createElement('div');
    title.className = 'pitch-type-title';
    title.textContent = pitchType;

    const grid = document.createElement('div');
    grid.className = 'checkbox-grid';

    for (let zone = 1; zone <= 9; zone++) {
      const combo = `${pitchType} ${zone}`;
      if (!pitchGroups[pitchType][zone]) continue;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = combo;

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          throwBall(pitchGroups[pitchType][zone], combo);
        } else {
          removeBallByType(combo);
        }
      });

      const label = document.createElement('label');
      label.htmlFor = combo;
      label.textContent = zone;

      const wrapper = document.createElement('div');
      wrapper.className = 'checkbox-group';
      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);

      grid.appendChild(wrapper);
    }

    group.appendChild(title);
    group.appendChild(grid);
    container.appendChild(group); // this matters most
  });
}
function populateDropdowns(data) {

  const teamSelect = document.getElementById('teamSelect');

  const pitcherSelect = document.getElementById('pitcherSelect');



  for (let team in data) {

    const option = document.createElement('option');

    option.value = team;

    option.textContent = team;

    teamSelect.appendChild(option);

  }



  teamSelect.addEventListener('change', () => {

    pitcherSelect.innerHTML = '';

    const team = teamSelect.value;

    for (let pitcher in data[team]) {

      const opt = document.createElement('option');

      opt.value = pitcher;

      opt.textContent = pitcher;

      pitcherSelect.appendChild(opt);

    }

    pitcherSelect.dispatchEvent(new Event('change'));

  });



  pitcherSelect.addEventListener('change', () => {

    clearBalls();

    const team = teamSelect.value;

    const pitcher = pitcherSelect.value;

    addCheckboxes(data[team][pitcher]);

  });



  teamSelect.selectedIndex = 0;

  teamSelect.dispatchEvent(new Event('change'));

}




function throwBall(pitch, pitchType) {
  addBall(pitch, pitchType);
}

function addBall(pitch, pitchType) {

  const ballGeo = new THREE.SphereGeometry(0.145, 32, 32);

  const mat = createHalfColorMaterial(pitchType);

  const ball = new THREE.Mesh(ballGeo, mat);

  ball.castShadow = true;



  const t0 = clock.getElapsedTime();



  ball.userData = {

    type: pitchType,

    t0: t0,

    release: {
      x: -pitch.release_pos_x,
      y: pitch.release_pos_z,
      z: -pitch.release_extension
    },

    velocity: {

      x: -pitch.vx0,

      y: pitch.vz0,

      z: pitch.vy0

    },

    accel: {

      x: -pitch.ax,

      y: pitch.az,

      z: pitch.ay

    },

    spinRate: pitch.release_spin_rate || 0,

    spinAxis: getSpinAxisVector(pitch.spin_axis || 0)

  };



  ball.position.set(

    ball.userData.release.x,

    ball.userData.release.y,

    ball.userData.release.z

  );



  balls.push(ball);

  scene.add(ball);
    ball.userData.type = pitchTypeLabel;

}



function removeBall(pitchType) {

  balls = balls.filter(ball => {

    if (ball.userData.type === pitchType) {

      scene.remove(ball);
      const type = ball.userData.type.split(' ')[0];
      trailDots = trailDots.filter(dotObj => {
        const keep = dotObj.mesh.userData?.type !== ball.userData.type;
        if (!keep) scene.remove(dotObj.mesh);
        return keep;
      });

      return false;

    }

    return true;

  });

}



function animate() {

  requestAnimationFrame(animate);



  const now = clock.getElapsedTime();

  const delta = now - lastTime;

  lastTime = now;



  if (playing) {

    for (let ball of balls) {

      const { t0, release, velocity, accel, spinRate, spinAxis } = ball.userData;

      const t = now - t0;



      const z = release.z + velocity.z * t + 0.5 * accel.z * t * t;

      if (z <= -60.5) continue;



      ball.position.x = release.x + velocity.x * t + 0.5 * accel.x * t * t;

      ball.position.y = release.y + velocity.y * t + 0.5 * accel.y * t * t;

      ball.position.z = z;

      if (showTrail) {
      const baseType = ball.userData.type.split(' ')[0];
      const color = pitchColorMap[baseType] || 0x888888;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      dot.position.set(ball.position.x, ball.position.y, ball.position.z);
      scene.add(dot);
      dot.userData = { type: ball.userData.type };
      trailDots.push({ mesh: dot, t0: now });
    }



      if (spinRate > 0) {

        const radPerSec = (spinRate / 60) * 2 * Math.PI;

        const angleDelta = radPerSec * delta;

        ball.rotateOnAxis(spinAxis.clone().normalize(), angleDelta);

      }

    }

  }



  
  // Remove trail dots that have existed longer than 10 seconds
  const currentTime = clock.getElapsedTime();
  trailDots = trailDots.filter(dotObj => {
    if (currentTime - dotObj.t0 > 9.5) {
      scene.remove(dotObj.mesh);
      return false;
    }
    return true;
  });

  renderer.render(scene, camera);

}



// === UI Buttons ===

document.getElementById('toggleBtn').addEventListener('click', () => {

  playing = !playing;

  document.getElementById('toggleBtn').textContent = playing ? 'Pause' : 'Play';

});



document.getElementById('replayBtn').addEventListener('click', () => {

  const now = clock.getElapsedTime();

  for (let ball of balls) {

    ball.userData.t0 = now;

    ball.position.set(

      ball.userData.release.x,

      ball.userData.release.y,

      ball.userData.release.z

    );

  }

  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];

});



// === Init ===

(async () => {

  setupScene();
  // === Camera View Dropdown Logic (Refined Positions) ===
document.getElementById("cameraSelect").addEventListener("change", (e) => {
  const view = e.target.value;
  switch(view) {
    case "catcher":
      camera.position.set(0, 2.5, -65);
      camera.lookAt(0, 2.5, 0);
      break;
    case "pitcher":
      camera.position.set(0, 6.0, 5);  // slightly higher pitcher view
      camera.lookAt(0, 2, -60.5);
      break;
    case "rhh":
      camera.position.set(1, 4, -65);  // higher right-handed hitter view
      camera.lookAt(0, 1.5, 0);           // look at pitcher
      break;
    case "lhh":
      camera.position.set(-1, 4, -65); // higher left-handed hitter view
      camera.lookAt(0, 1.5, 0);           // look at pitcher
      break;
    case "1b":
      camera.position.set(50, 4.5, -30);
      camera.lookAt(0, 5, -30);
      break;
    case "3b":
      camera.position.set(-50, 4.5, -30);
      camera.lookAt(0, 5, -30);
      break;
  }
});

  pitchData = await loadPitchData();

  populateDropdowns(pitchData);

  animate();

})();


function removeBallByType(pitchType) {
  balls = balls.filter(ball => {
    if (ball.userData.type === pitchType) {
      scene.remove(ball);
      const type = ball.userData.type.split(' ')[0];
      trailDots = trailDots.filter(dotObj => {
        const keep = dotObj.mesh.userData?.type !== ball.userData.type;
        if (!keep) scene.remove(dotObj.mesh);
        return keep;
      });
      return false;
    }
    return true;
  });
}

document.getElementById('trailToggle').addEventListener('change', e => {
  showTrail = e.target.checked;
  if (!showTrail) {
    for (const d of trailDots) scene.remove(d.mesh);
    trailDots = [];
  }
});
