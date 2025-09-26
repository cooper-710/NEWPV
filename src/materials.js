import * as THREE from 'three';

/* ------------ Canvas helpers to draw seams + stitches ------------ */

function drawSeamPaths(ctx, w, h, color, seamWidth = 10, amplitude = 0.22) {
  // Two mirrored sinusoidal seams in equirectangular space
  // y = 0.5h ± A*h*sin(2πx/w)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = seamWidth;

  const A = amplitude * h;
  // main seam
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = 0.5 * h + A * Math.sin((2 * Math.PI * x) / w);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // mirrored seam
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = 0.5 * h - A * Math.sin((2 * Math.PI * x) / w);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawStitches(ctx, w, h, color, seamWidth = 10, amplitude = 0.22, spacing = 26) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, seamWidth * 0.28);
  ctx.lineCap = 'round';

  const A = amplitude * h;

  function seg(x) {
    const y = 0.5 * h + A * Math.sin((2 * Math.PI * x) / w);
    const dx = 1;
    const dy = A * ((2 * Math.PI) / w) * Math.cos((2 * Math.PI * x) / w);
    // normal direction to seam curve
    const nx = -dy;
    const ny = dx;
    const len = Math.hypot(nx, ny) || 1;
    const ux = (nx / len) * seamWidth * 0.55;
    const uy = (ny / len) * seamWidth * 0.55;

    ctx.beginPath();
    ctx.moveTo(x - ux, y - uy);
    ctx.lineTo(x + ux, y + uy);
    ctx.stroke();
  }

  // stitches along both seams
  for (let x = 0; x <= w; x += spacing) seg(x);
  for (let x = spacing / 2; x <= w + spacing / 2; x += spacing) {
    const xm = x % w; // wrap
    const y = 0.5 * h - A * Math.sin((2 * Math.PI * xm) / w);
    const dx = 1;
    const dy = -A * ((2 * Math.PI) / w) * Math.cos((2 * Math.PI * xm) / w);
    const nx = -dy, ny = dx;
    const len = Math.hypot(nx, ny) || 1;
    const ux = (nx / len) * seamWidth * 0.55;
    const uy = (ny / len) * seamWidth * 0.55;

    ctx.beginPath();
    ctx.moveTo(xm - ux, y - uy);
    ctx.lineTo(xm + ux, y + uy);
    ctx.stroke();
  }

  ctx.restore();
}

function makeSeamAlbedo(w = 1024, h = 512, stitchColor = '#d1342f') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Leather base (slightly warm white)
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(0, 0, w, h);

  // Slight radial shade to avoid flatness
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.15, w * 0.5, h * 0.5, h * 0.65);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Seams + stitches
  drawSeamPaths(ctx, w, h, stitchColor, 12, 0.24);
  drawStitches(ctx, w, h, stitchColor, 12, 0.24, 26);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeLeatherBump(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);

  // Fine leather pores
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random() * 40 - 20);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Embossed seam ridge (soften with blur-like passes)
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  drawSeamPaths(ctx, w, h, '#ffffff', 10, 0.24);
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 18;
  drawSeamPaths(ctx, w, h, '#ffffff', 18, 0.24);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

/* ------------------- Public API ------------------- */

export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];

  // Slight accent glow tied to pitch type (kept subtle)
  const accent = {
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30';

  const map  = makeSeamAlbedo(1024, 512);
  const bump = makeLeatherBump(512, 512);

  const mat = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.5,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    reflectivity: 0.35,
    bumpMap: bump,
    bumpScale: 0.035,          // emboss seams/stitches
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.06    // subtle seam pop
  });

  return mat;
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
