import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';

let scene, camera, renderer;
const clock = new THREE.Clock();

export function initScene() {
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // mound
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 9, 2.0, 64),
    new THREE.MeshStandardMaterial({ color: 0x8B4513 })
  );
  mound.receiveShadow = true;
  scene.add(mound);

  // rubber
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.05, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  rubber.position.set(0, 1.05, 0);
  rubber.castShadow = true; rubber.receiveShadow = true;
  scene.add(rubber);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2.5, -65);
  camera.lookAt(0, 2.5, 0);
  scene.add(camera);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x8b4513, 0.4));

  const sun = new THREE.DirectionalLight(0xfff0e5, 1.0);
  sun.position.set(5,10,5);
  sun.castShadow = true;
  const target = new THREE.Object3D(); scene.add(target);
  sun.target = target;
  scene.add(sun);

  const plateLight = new THREE.PointLight(0xffffff, 0.6, 100);
  plateLight.position.set(0, 3, -60.5);
  scene.add(plateLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1e472d, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const zone = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0)),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  zone.position.set(0, 2.5, -60.5);
  scene.add(zone);

  const shape = new THREE.Shape();
  shape.moveTo(-0.85,0); shape.lineTo(0.85,0); shape.lineTo(0.85,0.5);
  shape.lineTo(0,1.0);   shape.lineTo(-0.85,0.5); shape.lineTo(-0.85,0);
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape),
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

  return { scene, camera, renderer, clock };
}

export function setCameraView(view) {
  switch(view) {
    case 'catcher':  camera.position.set(0, 2.5, -65); camera.lookAt(0, 2.5, 0); break;
    case 'pitcher':  camera.position.set(0, 6.0, 5);   camera.lookAt(0, 2, -60.5); break;
    case 'rhh':      camera.position.set(1, 4, -65);   camera.lookAt(0, 1.5, 0); break;
    case 'lhh':      camera.position.set(-1, 4, -65);  camera.lookAt(0, 1.5, 0); break;
    case '1b':       camera.position.set(50, 4.5, -30); camera.lookAt(0, 5, -30); break;
    case '3b':       camera.position.set(-50, 4.5, -30); camera.lookAt(0, 5, -30); break;
  }
}

export function getRefs() { return { scene, camera, renderer, clock }; }
