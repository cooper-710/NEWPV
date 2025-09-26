import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let scene, camera, renderer;
const clock = new THREE.Clock();

/* --------- Procedural grass helpers (no external textures) --------- */
function makeGrassAlbedo(size = 1024, stripes = 20) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');

  // base gradient (darker, neutral green)
  const g = ctx.createRadialGradient(size*0.5, size*0.4, size*0.05, size*0.5, size*0.5, size*0.7);
  g.addColorStop(0,  '#1f3a28');
  g.addColorStop(1,  '#0f2a1a');
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);

  // mow stripes
  const stripeH = size / stripes;
  for (let i=0;i<stripes;i++){
    const y = i*stripeH;
    ctx.fillStyle = (i%2===0) ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, y, size, stripeH);
  }

  // sparse speckle for organic variation
  const img = ctx.getImageData(0,0,size,size);
  for (let p=0; p<img.data.length; p+=4){
    const r = Math.random();
    const d = (r<0.015) ? 10 : (r<0.03 ? -10 : 0);
    img.data[p]   = Math.min(255, Math.max(0, img.data[p]   + d));
    img.data[p+1] = Math.min(255, Math.max(0, img.data[p+1] + d));
    img.data[p+2] = Math.min(255, Math.max(0, img.data[p+2] + d));
  }
  ctx.putImageData(img,0,0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrassBump(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size,size);

  // fine noise + a few longer “fiber” strokes
  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      const i = (y*size + x)*4;
      const n = 128 + (Math.random()*40 - 20); // tight
      img.data[i]=img.data[i+1]=img.data[i+2]=n; img.data[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);

  // directional streaks
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#ffffff';
  for (let k=0;k<500;k++){
    const x = Math.random()*size, y = Math.random()*size;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + Math.random()*12, y + (Math.random()-0.5)*2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}
/* ------------------------------------------------------------------- */

export function initScene() {
  const canvas = document.getElementById('three-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16171a);
  scene.fog = new THREE.Fog(0x16171a, 80, 160);

  // Image-based lighting
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.12).texture;

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2.6, -65);
  camera.lookAt(0, 2.5, 0);
  scene.add(camera);

  // Lights
  const key = new THREE.DirectionalLight(0xffe7d1, 2.0);
  key.position.set(6, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  scene.add(key);

  const fill = new THREE.HemisphereLight(0xa7c8ff, 0x3f2e16, 0.6);
  scene.add(fill);

  const plateLight = new THREE.PointLight(0xffffff, 0.9, 120);
  plateLight.position.set(0, 3.2, -60.5);
  scene.add(plateLight);

  // Mound
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 9, 2.0, 64),
    new THREE.MeshStandardMaterial({ color: 0x8c6239, roughness: 0.9, metalness: 0.0 })
  );
  mound.position.y = 0.0;
  mound.receiveShadow = true;
  scene.add(mound);

  // Rubber
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.05, 0.18),
    new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.5, transmission: 0, clearcoat: 0.1 })
  );
  rubber.position.set(0, 1.05, 0);
  rubber.castShadow = true; rubber.receiveShadow = true;
  scene.add(rubber);

  // Ground: realistic turf/grass
  const grassMap  = makeGrassAlbedo();
  const grassBump = makeGrassBump();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240, 1, 1),
    new THREE.MeshStandardMaterial({
      map: grassMap,
      bumpMap: grassBump,
      bumpScale: 0.06,
      roughness: 1.0,
      metalness: 0.0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0;
  ground.receiveShadow = true;
  scene.add(ground);

  // Strike zone
  const zone = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0)),
    new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent:true, opacity:0.9 })
  );
  zone.position.set(0, 2.5, -60.5);
  scene.add(zone);

  // Plate
  const shape = new THREE.Shape();
  shape.moveTo(-0.85,0); shape.lineTo(0.85,0); shape.lineTo(0.85,0.5);
  shape.lineTo(0,1.0);   shape.lineTo(-0.85,0.5); shape.lineTo(-0.85,0);
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, clearcoat: 0.2 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.011, -60.5);
  plate.receiveShadow = true;
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
    case 'catcher':  camera.position.set(0, 2.6, -65); camera.lookAt(0, 2.5, 0); break;
    case 'pitcher':  camera.position.set(0, 6.2, 5.5); camera.lookAt(0, 2, -60.5); break;
    case 'rhh':      camera.position.set(1.2, 4.1, -65); camera.lookAt(0, 1.5, 0); break;
    case 'lhh':      camera.position.set(-1.2, 4.1, -65); camera.lookAt(0, 1.5, 0); break;
    case '1b':       camera.position.set(50, 4.8, -30); camera.lookAt(0, 5, -30); break;
    case '3b':       camera.position.set(-50, 4.8, -30); camera.lookAt(0, 5, -30); break;
  }
}

export function getRefs(){ return { scene, camera, renderer, clock }; }
