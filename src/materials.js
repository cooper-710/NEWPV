import * as THREE from 'three';

/**
 * Baseball material with ultra-smooth parallel seams using SDF:
 * - Two sine-offset parallel bands; per-pixel distance -> smoothstep edge
 * - High-res albedo + bump built on CPU (no shader hacks)
 * - Proper mipmaps & anisotropy to stay crisp at grazing angles
 */

const TEX = { w: 4096, h: 2048 };         // ↑ res to kill shimmer
const LEATHER = [242, 242, 242];

const SEAM = {
  rgb: [201, 31, 36],   // #C91F24
  widthPx: 30,          // core thickness (~5x). bump to 34–38 if you want more
  softPx: 3.0,          // edge feather in pixels (anti-aliased edge)
  ampFrac: 0.20,        // sine amplitude as fraction of height
  offsetFrac: 0.22      // distance from midline for each parallel band (0..0.5)
};

const BUMP = {
  poresJitter: 18,      // leather grain variance around 128
  seamHeight: 22        // emboss height to catch specular
};

// -------- distance helpers (in texture pixel space) ----------
function seamCenterY(x, w, h, upper) {
  const A = SEAM.ampFrac * h;
  const y0 = 0.5 * h + (upper ? -SEAM.offsetFrac * h : +SEAM.offsetFrac * h);
  return y0 + A * Math.sin((2 * Math.PI * x) / w);
}
function seamMaskSDF(distPx, halfWidth, soft) {
  // 1.0 inside the band; 0.0 outside; smooth over 'soft' pixels
  return 1.0 - THREE.MathUtils.smoothstep(distPx, halfWidth - soft, halfWidth + soft);
}

// ---------------- build Albedo (SDF) ----------------
function buildAlbedoTexture(w = TEX.w, h = TEX.h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  const [lr, lg, lb] = LEATHER;
  const [sr, sg, sb] = SEAM.rgb;

  const half = SEAM.widthPx * 0.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // distance to each seam centerline (in pixels)
      const yUp = seamCenterY(x, w, h, true);
      const yDn = seamCenterY(x, w, h, false);
      const dUp = Math.abs(y - yUp);
      const dDn = Math.abs(y - yDn);

      // seam coverage via SDF
      const mUp = seamMaskSDF(dUp, half, SEAM.softPx);
      const mDn = seamMaskSDF(dDn, half, SEAM.softPx);
      const m = Math.min(1.0, mUp + mDn);

      // subtle vignette to avoid flat look
      const v = y / (h - 1);
      const vign = 1.0 - 0.05 * Math.pow(2.0 * Math.abs(v - 0.5), 2.0);

      let r = lr * vign, g = lg * vign, b = lb * vign;
      r = r * (1 - m) + sr * m;
      g = g * (1 - m) + sg * m;
      b = b * (1 - m) + sb * m;

      const i = (y * w + x) << 2;
      img.data[i] = r | 0;
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

// ---------------- build Bump (SDF) ----------------
function buildBumpTexture(w = TEX.w, h = TEX.h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  const half = SEAM.widthPx * 0.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const yUp = seamCenterY(x, w, h, true);
      const yDn = seamCenterY(x, w, h, false);
      const dUp = Math.abs(y - yUp);
      const dDn = Math.abs(y - yDn);

      // seam coverage via SDF (match albedo)
      const mUp = seamMaskSDF(dUp, half, SEAM.softPx);
      const mDn = seamMaskSDF(dDn, half, SEAM.softPx);
      const m = Math.min(1.0, mUp + mDn);

      // pores around mid-gray
      let val = 128 + (Math.random() * (BUMP.poresJitter * 2) - BUMP.poresJitter);

      // emboss the seam so specular highlights catch it
      val = Math.min(255, val + m * BUMP.seamHeight);

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
    bumpScale: 0.040,                         // seam ridge strength
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
