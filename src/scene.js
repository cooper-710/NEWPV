import * as THREE from 'three';
import { createTurfMaterial } from './turf.js';

let _refs = null;
let _raf = null;

function _buildScene(canvas, { useShadows = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0f11');

  // Clock (so main.js can call refs.clock.getElapsedTime())
  const clock = new THREE.Clock();

  // Camera
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 12, 36);
  camera.lookAt(0, 3, -60);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (useShadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // Lights
  const hemi = new THREE.HemisphereLight('#dfe7ff', '#1a1f1a', 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffffff', 0.9);
  sun.position.set(20, 40, 15);
  sun.castShadow = useShadows;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  scene.add(sun);

  // Turf (solid exact green)
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), createTurfMaterial());
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0;
  turf.receiveShadow = true;
  scene.add(turf);

  // Mound (vibrant brown)
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 9.0, 2.0, 64),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#7A4A2F'), roughness: 0.98, metalness: 0.0 })
  );
  mound.position.set(0, 0.0, -60);
  mound.receiveShadow = true;
  scene.add(mound);

  // Resize
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // Camera presets for UI
  const lookTarget = new THREE.Vector3(0, 3, -60);
  const presets = {
    'Home Plate View': () => { camera.position.set(0, 12, 36);   camera.lookAt(lookTarget); },
    'Centerfield View': () => { camera.position.set(0, 18, -110); camera.lookAt(lookTarget); },
    'Pitcher View': () => { camera.position.set(0, 7, -48);      camera.lookAt(lookTarget); },
    'Umpire View': () => { camera.position.set(0, 9, 8);         camera.lookAt(lookTarget); },
    'Broadcast High': () => { camera.position.set(36, 32, 52);   camera.lookAt(lookTarget); },
  };
  function setCameraView(name) {
    (presets[name] || presets['Home Plate View'])();
  }

  return {
    scene,
    camera,
    renderer,
    clock,                 // <-- expose the clock
    lights: { hemi, sun },
    field: { turf, mound },
    setCameraView,
  };
}

/* Explicit builder */
export function createScene({ canvas, useShadows = true } = {}) {
  _refs = _buildScene(canvas, { useShadows });
  return _refs;
}

/* Back-compat accessor */
export function getRefs() {
  if (_refs) return _refs;
  const canvas = document.getElementById('three-canvas') || document.querySelector('canvas');
  if (!canvas) throw new Error('getRefs(): no canvas found. Ensure <canvas id="three-canvas"> exists or call createScene({ canvas }) first.');
  _refs = _buildScene(canvas, { useShadows: true });
  return _refs;
}

/* For ui.js */
export function setCameraView(name) {
  const refs = getRefs();
  refs.setCameraView(name);
}

/* For main.js legacy import */
export function initScene(arg) {
  let canvas = null, useShadows = true, startLoop = false;
  if (!arg) {
    canvas = document.getElementById('three-canvas') || document.querySelector('canvas');
  } else if (arg instanceof HTMLCanvasElement) {
    canvas = arg;
  } else if (typeof arg === 'object') {
    canvas = arg.canvas || document.getElementById('three-canvas') || document.querySelector('canvas');
    if (typeof arg.useShadows === 'boolean') useShadows = arg.useShadows;
    if (arg.startLoop === true) startLoop = true;
  }
  if (!canvas) throw new Error('initScene(): no canvas found or provided.');

  const refs = createScene({ canvas, useShadows });

  if (startLoop) {
    if (_raf) cancelAnimationFrame(_raf);
    const tick = () => {
      _raf = requestAnimationFrame(tick);
      // example usage of clock here (harmless if main.js also uses it)
      const _t = refs.clock.getElapsedTime();
      refs.renderer.render(refs.scene, refs.camera);
    };
    tick();
  }

  return refs;
}
