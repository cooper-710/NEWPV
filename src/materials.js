import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';

export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const hexMap = {
    FF:'#FF0000', SL:'#0000FF', CH:'#008000', KC:'#4B0082',
    SI:'#FFA500', CU:'#800080', FC:'#808080', ST:'#008080',
    FS:'#00CED1', EP:'#FF69B4', KN:'#A9A9A9', SC:'#708090',
    SV:'#000000', CS:'#A52A2A', FO:'#DAA520'
  };
  const hex = hexMap[base] || '#888888';

  const c = document.createElement('canvas');
  c.width = 2; c.height = 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex;       ctx.fillRect(0,0,2,1);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,1,2,1);

  const texture = new THREE.CanvasTexture(c);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;

  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4, metalness: 0.1 });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
