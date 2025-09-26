import * as THREE from 'three';

/**
 * Baseball material with CPU-baked, accurate great-circle seams.
 * - Two tilted great circles (true spherical paths)
 * - Seam thickness ~5x (tweak SEAM_HALF_WIDTH_RAD)
 * - Leather pores + embossed seam ridge in bump map
 * - No fragile shader injection; works everywhere
 */

/* -------------------- Tunables -------------------- */
const TEX_W = 2048, TEX_H = 1024;                 // high-res equirect map
const SEAM_COLOR = [201, 31, 36];                 // #C91F24
const LEATHER_RGB = [242, 242, 242];              // warm white
const SEAM_HALF_WIDTH_RAD = 0.14;                 // ≈8° half-width (bold)
const SEAM_EDGE_SOFT_RAD  = 0.01;                 // soft edge (~0.6°)
const SEAM_BUMP_HEIGHT    = 22;                   // emboss intensity (0..255)
const PORES_JITTER        = 18;                   // leather pore variance

// seam plane normals (tilt so they look like real seams)
const P1 = new THREE.Vector3(0.0,  0.62,  0.78).normalize();
const P2 = new THREE.Vector3(0.0, -0.62,  0.78).normalize();

/* -------------------- Math helpers -------------------- */
// Convert (u in [0,1], v in [0,1]) to unit-sphere direction (x,y,z)
function uvToDir(u, v) {
  const theta = (u * 2.0 - 1.0) * Math.PI; // [-π, π]
  const phi   = v * Math.PI;               // [0, π]
  const st = Math.sin(theta), ct = Math.cos(theta);
  const sp = Math.sin(phi),   cp = Math.cos(phi);
  return new THREE.Vector3(ct * sp, cp, st * sp);
}

// Angular distance (radians) from dir to great circle defined by plane normal pn.
function angDistToGreatCircle(dir, pn) {
  // Great circle = { dir | dot(dir, pn) = 0 }. Distance = asin(|dot|).
  return Math.asin(Math.abs(dir.x * pn.x + dir.y * pn.y + dir.z * pn.z));
}

// Smooth mask 0..1 for seam band centered at distance 0 with half-width W and soft edge E.
function seamMask(dist, W, E) {
  // 1 inside band, fall off to 0 over +/-E via smoothstep
  const a = W - E;
  const b = W + E;
  if (dist <= a) return 1.0;
  if (dist >= b) return 0.0;
  const t = (dist - a) / (b - a);
  return 1.0 - (t * t * (3 - 2 * t)); // smoothstep mirrored
}

/* -------------------- Texture builders -------------------- */
function buildAlbedoTexture(w = TEX_W, h = TEX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);
  const [lr, lg, lb] = LEATHER_RGB;
  const [sr, sg, sb] = SEAM_COLOR;

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const dir = uvToDir(u, v);

      const d1 = angDistToGreatCircle(dir, P1);
      const d2 = angDistToGreatCircle(dir, P2);

      const m1 = seamMask(d1, SEAM_HALF_WIDTH_RAD, SEAM_EDGE_SOFT_RAD);
      const m2 = seamMask(d2, SEAM_HALF_WIDTH_RAD, SEAM_EDGE_SOFT_RAD);
      const m  = Math.min(1.0, m1 + m2); // combine seams

      // base leather with tiny radial vignette
      const vignette = 1.0 - 0.05 * Math.pow(2.0 * Math.abs(v - 0.5), 2.0);
      let r = lr * vignette, g = lg * vignette, b = lb * vignette;

      // mix in seam color
      r = r * (1 - m) + sr * m;
      g = g * (1 - m) + sg * m;
      b = b * (1 - m) + sb * m;

      const i = (y * w + x) << 2;
      img.data[i]     = r | 0;
      img.data[i + 1] = g | 0;
      img.data[i + 2] = b | 0;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildBumpTexture(w = TEX_W, h = TEX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const dir = uvToDir(u, v);

      const d1 = angDistToGreatCircle(dir, P1);
      const d2 = angDistToGreatCircle(dir, P2);
      const m1 = seamMask(d1, SEAM_HALF_WIDTH_RAD, SEAM_EDGE_SOFT_RAD);
      const m2 = seamMask(d2, SEAM_HALF_WIDTH_RAD, SEAM_EDGE_SOFT_RAD);
      const seam = Math.min(1.0, m1 + m2);

      // Base pores (mid-gray 128 +/- jitter)
      let val = 128 + (Math.random() * (PORES_JITTER * 2) - PORES_JITTER);

      // Emboss seam ridge (brighter = bumps outward)
      val = Math.min(255, val + seam * SEAM_BUMP_HEIGHT);

      const i = (y * w + x) << 2;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val | 0;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* -------------------- Exported API -------------------- */
export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const accentHex = ({
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30');

  const map  = buildAlbedoTexture();
  const bump = buildBumpTexture();

  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.035,                 // emboss strength
    color: new THREE.Color('#ffffff'),
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.02
  });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
