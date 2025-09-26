import * as THREE from 'three';

/**
 * Generates a tiny monochrome noise texture to mimic leather pores.
 * Used as a bump map so we avoid external assets.
 */
function makeLeatherBump(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i=0;i<img.data.length;i+=4){
    const n = 220 + Math.random()*35; // tight dynamic range
    img.data[i]=img.data[i+1]=img.data[i+2]=n; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4,4);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  return tex;
}

/**
 * Two thin red rings near the 'seams' + white leather base.
 * This preserves your half-color idea but looks more realistic.
 */
function makeSeamAlbedo() {
  const w=512,h=512;
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d');

  // base
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0,0,w,h);

  // two thin horizontal rings (pseudo seams)
  ctx.fillStyle = '#d1342f';
  const bandH = 10;
  const y1 = Math.floor(h*0.32), y2 = Math.floor(h*0.68);
  ctx.fillRect(0, y1, w, bandH);
  ctx.fillRect(0, y2, w, bandH);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1,1);
  tex.anisotropy = 4;
  return tex;
}

export function createHalfColorMaterial(pitchType) {
  // Map type to accent overlay color (subtle tint on the seams)
  const base = (pitchType || '').split(' ')[0];
  const accent = {
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30';

  const albedo = makeSeamAlbedo();
  const bump = makeLeatherBump();

  const mat = new THREE.MeshPhysicalMaterial({
    map: albedo,
    color: new THREE.Color('#ffffff'),
    roughness: 0.55,
    metalness: 0.0,
    sheen: 0.4,                 // subtle fabric-like sheen
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    reflectivity: 0.3,
    bumpMap: bump,
    bumpScale: 0.015
  });

  // slight seam tint via vertex colors trick: add a small emissive term
  mat.emissive = new THREE.Color(accent);
  mat.emissiveIntensity = 0.03;

  return mat;
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
