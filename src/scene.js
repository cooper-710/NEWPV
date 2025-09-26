import * as THREE from 'three';
import { createTurfMaterial } from './turf.js';

let _refs = null; // singleton cache

function _buildScene(canvas, { useShadows = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0f11');

  // Camera
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 12, 36);

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

  // Turf — exact solid green
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 1, 1),
    createTurfMaterial()
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0;
  turf.receiveShadow = true;
  scene.add(turf);

  // Mound — vibrant brown
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 9.0, 2.0, 64),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7A4A2F'),
      roughness: 0.98,
      metalness: 0.0
    })
  );
  mound.position.set(0, 0.0, -60); // adjust if your world origin differs
  mound.receiveShadow = true;
  scene.add(mound);

  // Resize
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    lights: { hemi, sun },
    field: { turf, mound }
  };
}

/**
 * Explicit builder if you call it from main.ts/js
 */
export function createScene({ canvas, useShadows = true } = {}) {
  _refs = _buildScene(canvas, { useShadows });
  return _refs;
}

/**
 * Backward-compatible accessor used by your existing modules (e.g., balls.js).
 * If nothing was built yet, it finds #three-canvas and builds the scene.
 */
export function getRefs() {
  if (_refs) return _refs;

  const canvas =
    document.getElementById('three-canvas') ||
    document.querySelector('canvas');

  if (!canvas) {
    throw new Error(
      'getRefs(): no canvas found. Ensure <canvas id="three-canvas"> exists or call createScene({ canvas }) first.'
    );
  }
  _refs = _buildScene(canvas, { useShadows: true });
  return _refs;
}
