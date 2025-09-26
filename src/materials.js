import * as THREE from 'three';

/**
 * Baseball material with ultra-smooth parallel seams baked in spherical space.
 * - Two parallel bands: φ_center = π/2 ± offset + amp * sin(2θ)
 * - SDF computed in radians (no UV-row distortion; no wrinkling)
 * - High-res albedo + bump; embossed seam for specular catch
 */

// Texture resolution (high to keep specular clean)
const TEX_W = 4096, TEX_H = 2048;

// Leather base
const LEATHER_RGB = [242, 242, 242];

// Seam parameters (radians for geometry-true edges)
const SEAM_COLOR_RGB = [201, 31, 36]; // #C91F24
const SEAM_HALF_WIDTH_RAD = 0.16;     // ~9° half-width (bold; bump to 0.18 if you want even thicker)
const SEAM_SOFT_EDGE_RAD  = 0.010;    // ~0.6° feather for AA (keeps edges razor but stable)
const SEAM_OFFSET_RAD     = 0.45;     // distance above/below equator (0..~0.6)
const SEAM_AMP            = 0.22;     // sine “wobble” amplitude (0..~0.3)

// Bump/pores
const BUMP_PORE_JITTER = 18;          // 128 ± jitter
const BUMP_SEAM_HEIGHT = 22;          // seam emboss intensity (0..255)

/* ---------- spherical helpers ---------- */
// Map (u∈[0,1], v∈[0,1]) -> spherical angles
// θ: longitude in [-π, π], φ: colatitude in [0, π] (φ=0 is +Y)
function uvToAngles(u, v) {
  const theta = (u * 2.0 - 1.0) * Math.PI; // [-π, π]
  const phi   = v * Math.PI;               // [0, π]
  return { theta, phi };
}

// Signed angular distance from φ to the centerline φc(θ)
function bandDistRad(theta, phi, phiCenter, amp) {
  const center = phiCenter + amp * Math.sin(theta * 2.0);
  return Math.abs(phi - center);
}

// SDF → 1 inside, 0 outside, smooth over ±soft
function bandMask(distRad, halfWidthRad, softRad) {
  // 1.0 when |dist| <= halfWidthRad, smooth transition in [W-soft, W+soft]
  const a = halfWidthRad - softRad;
  const b = halfWidthRad + softRad;
  if (distRad <= a) return 1.0;
  if (distRad >= b) return 0.0;
  const t = (distRad - a) / (b - a);
  return 1.0 - (t * t * (3.0 - 2.0 * t)); // smoothstep mirrored
}

/* ---------- texture builders (albedo + bump) ---------- */
function buildAlbedoTexture(w = TEX_W, h = TEX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  const [lr, lg, lb] = LEATHER_RGB;
  const [sr, sg, sb] = SEAM_COLOR_RGB;

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const { theta, phi } = uvToAngles(u, v);

      // Two parallel bands, above and below equator
      const dUp = bandDistRad(theta, phi, (Math.PI * 0.5) - SEAM_OFFSET_RAD, SEAM_AMP);
      const dDn = bandDistRad(theta, phi, (Math.PI * 0.5) + SEAM_OFFSET_RAD, SEAM_AMP);

      const mUp = bandMask(dUp, SEAM_HALF_WIDTH_RAD, SEAM_SOFT_EDGE_RAD);
      const mDn = bandMask(dDn, SEAM_HALF_WIDTH_RAD, SEAM_SOFT_EDGE_RAD);
      const m = Math.min(1.0, mUp + mDn);

      // Gentle vignette so ball doesn’t read flat
      const vign = 1.0 - 0.05 * Math.pow(2.0 * Math.abs(v - 0.5), 2.0);

      let r = lr * vign, g = lg * vign, b = lb * vign;
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
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
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
      const { theta, phi } = uvToAngles(u, v);

      const dUp = bandDistRad(theta, phi, (Math.PI * 0.5) - SEAM_OFFSET_RAD, SEAM_AMP);
      const dDn = bandDistRad(theta, phi, (Math.PI * 0.5) + SEAM_OFFSET_RAD, SEAM_AMP);

      const mUp = bandMask(dUp, SEAM_HALF_WIDTH_RAD, SEAM_SOFT_EDGE_RAD);
      const mDn = bandMask(dDn, SEAM_HALF_WIDTH_RAD, SEAM_SOFT_EDGE_RAD);
      const m = Math.min(1.0, mUp + mDn);

      // pores around mid-gray
      let val = 128 + (Math.random() * (BUMP_PORE_JITTER * 2) - BUMP_PORE_JITTER);

      // embossed ridge on seam
      val = Math.min(255, val + m * BUMP_SEAM_HEIGHT);

      const i = (y * w + x) << 2;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val | 0;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}

/* ---------- exported API ---------- */
export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const accent = {
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30';

  const map  = buildAlbedoTexture();
  const bump = buildBumpTexture();

  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.040,                 // seam ridge strength
    color: new THREE.Color('#ffffff'),
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.012
  });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
