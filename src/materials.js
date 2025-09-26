import * as THREE from 'three';

/**
 * Parametric MLB-style seams on an equirectangular map:
 * - Two mirrored sinusoidal great-circle-ish paths around the ball.
 * - Thick red seam band for readability from distance.
 * - Angled stitch "bars" that cross the seam at ~35° and follow curvature.
 * This is an approximation that reads correctly in motion and at game zoom.
 */

const SEAM = {
  width: 20,         // <-- thickness of the main red seam (px)  (increase for thicker)
  amp:   0.24,       // seam amplitude as fraction of texture height
  color: '#C91F24',  // seam red
  stitch: {
    spacing: 26,     // distance between stitches along the seam (px)
    len:     36,     // total stitch length across the seam (px)
    thick:   8,      // stitch stroke width (px)
    angle:   35,     // angle (degrees) each stitch crosses the seam
    color:   '#C91F24',
  }
};

/* ---------------- Canvas drawing helpers ---------------- */

function seamY(x, w, h, amp = SEAM.amp) {
  // seam centerline y = 0.5h ± A * sin(2πx/w)
  const A = amp * h;
  return 0.5 * h + A * Math.sin((2 * Math.PI * x) / w);
}

function seamDyDx(x, w, h, amp = SEAM.amp) {
  // derivative dy/dx = A * (2π/w) * cos(2πx/w)
  const A = amp * h;
  return A * ((2 * Math.PI) / w) * Math.cos((2 * Math.PI * x) / w);
}

function drawSeamBand(ctx, w, h, mirror = false) {
  ctx.save();
  ctx.strokeStyle = SEAM.color;
  ctx.lineWidth = SEAM.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y0 = seamY(x, w, h, SEAM.amp);
    const y  = mirror ? (h - y0) : y0;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawStitch(ctx, x, y, dx, dy, mirror = false) {
  // Build a short angled "bar" (slightly curved) crossing the seam.
  // Tangent along seam is (1, dy/dx); normal is (-dy, 1). Rotate normal by ±angle.
  const tangent = new THREE.Vector2(1, dy).normalize();
  const normal  = new THREE.Vector2(-dy, 1).normalize();

  const ang = (SEAM.stitch.angle * Math.PI) / 180;
  // Flip direction every other stitch to get that alternating look
  const signedNormal = normal.clone().rotateAround(new THREE.Vector2(0,0), mirror ? -ang : ang);

  const half = SEAM.stitch.len * 0.5;
  const dir = signedNormal.clone().multiplyScalar(half);

  const p0 = new THREE.Vector2(x, y).sub(dir);
  const p1 = new THREE.Vector2(x, y).add(dir);

  // Slight bow along tangent to mimic thread curvature
  const bow = tangent.clone().multiplyScalar(half * 0.25);
  const c0 = p0.clone().add(bow);
  const c1 = p1.clone().sub(bow);

  ctx.save();
  ctx.strokeStyle = SEAM.stitch.color;
  ctx.lineWidth = SEAM.stitch.thick;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  // two quadratic segments for a clean bar with a hint of curve
  ctx.quadraticCurveTo(c0.x, c0.y, x, y);
  ctx.quadraticCurveTo(c1.x, c1.y, p1.x, p1.y);
  ctx.stroke();
  ctx.restore();
}

function drawStitches(ctx, w, h, mirror = false, phaseShift = 0) {
  // Step along x in stitch spacing, offset halves between the two seams
  for (let x = phaseShift; x <= w + SEAM.stitch.spacing; x += SEAM.stitch.spacing) {
    const xx = (x % w + w) % w; // wrap
    const y0 = seamY(xx, w, h, SEAM.amp);
    const y  = mirror ? (h - y0) : y0;
    const dydx = seamDyDx(xx, w, h, SEAM.amp);
    drawStitch(ctx, xx, y, 1, dydx, mirror);
  }
}

/* --------- Build textures: color map and bump map ---------- */

function makeSeamAlbedo(w = 2048, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Leather base (slightly warm white) + very gentle vignette so sphere doesn't look flat
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w*0.5, h*0.5, h*0.1, w*0.5, h*0.5, h*0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  // Main seam bands (thicker)
  drawSeamBand(ctx, w, h, false);
  drawSeamBand(ctx, w, h, true);

  // Stitches (angled bars crossing the seam, alternating)
  drawStitches(ctx, w, h, false, 0);
  drawStitches(ctx, w, h, true, SEAM.stitch.spacing * 0.5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeLeatherBump(w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Fine leather pores
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random() * 36 - 18);
    img.data[i] = img.data[i+1] = img.data[i+2] = n;
    img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Emboss the seam slightly so light catches it (two passes for soft ridge)
  ctx.globalAlpha = 0.40; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, SEAM.width * 0.70);
  drawSeamBand(ctx, w, h, false); drawSeamBand(ctx, w, h, true);
  ctx.globalAlpha = 0.20; ctx.lineWidth = Math.max(1, SEAM.width * 1.10);
  drawSeamBand(ctx, w, h, false); drawSeamBand(ctx, w, h, true);

  // Give the stitches a touch of extra height
  ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(1, SEAM.stitch.thick * 1.1);
  drawStitches(ctx, w, h, false, 0);
  drawStitches(ctx, w, h, true, SEAM.stitch.spacing * 0.5);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

/* ------------------- Exported API ------------------- */

export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const accent = {
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30';

  const map  = makeSeamAlbedo();
  const bump = makeLeatherBump();

  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    bumpMap: bump,
    bumpScale: 0.045,           // stronger emboss so seams read at distance
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.04     // tiny lift; seams stay natural, not neon
  });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
