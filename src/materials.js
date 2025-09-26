import * as THREE from 'three';

/**
 * Baseball material with two thick, parallel seam bands (no cross).
 * - High-res CPU-baked map (no shader injection)
 * - Gentle sine curvature so seams feel like laces as the ball turns
 * - Leather pores + slight embossed ridge on seams via bump map
 */

const TEX = { w: 2048, h: 1024 };          // high-res equirect map
const LEATHER = '#f2f2f2';
const SEAM = {
  color: '#C91F24',
  widthPx: 28,           // << thicker seam band (~5x). Try 24–36 to taste.
  amp: 0.20,             // sine amplitude as fraction of texture height
  softPx: 6,             // edge softness in pixels
  offsetFrac: 0.22       // seam vertical offset from midline (0..0.5)
};
// If you want stitches later, we can add them; keeping clean bands per request.

function drawSeamBand(ctx, w, h, upper=true) {
  // Centerline: y = y0 +/- A*sin(2πx/w)
  const A = SEAM.amp * h;
  const y0 = 0.5 * h + (upper ? -SEAM.offsetFrac*h : +SEAM.offsetFrac*h);

  // We’ll stroke a wide path with soft edge by painting multiple passes
  const passes = Math.max(1, Math.floor(SEAM.softPx / 2));
  for (let p = passes; p >= 0; p--) {
    const lw = SEAM.widthPx + p * 2;         // thicker to thinner
    const alpha = 0.22 + 0.78 * (1 - p / (passes + 1));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = SEAM.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw;

    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = y0 + A * Math.sin((2 * Math.PI * x) / w);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function makeAlbedo(w=TEX.w, h=TEX.h) {
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d');

  // Base leather
  ctx.fillStyle = LEATHER; ctx.fillRect(0,0,w,h);
  const g = ctx.createRadialGradient(w*0.5,h*0.5,h*0.12, w*0.5,h*0.5,h*0.70);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba(0,0,0,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  // Two parallel seam bands (upper & lower), no crossing
  drawSeamBand(ctx, w, h, true);
  drawSeamBand(ctx, w, h, false);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeBump(w=TEX.w, h=TEX.h) {
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d');

  // Fine leather pores
  const img = ctx.createImageData(w,h);
  for (let i=0;i<img.data.length;i+=4){
    const n = 128 + (Math.random()*36 - 18);
    img.data[i]=img.data[i+1]=img.data[i+2]=n; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);

  // Emboss the seam bands slightly so specular catches
  ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round'; ctx.lineJoin='round';
  // smaller core ridge
  ctx.lineWidth = Math.max(1, SEAM.widthPx * 0.7);
  drawSeamBand(ctx, w, h, true);
  drawSeamBand(ctx, w, h, false);
  // softer outer ridge
  ctx.globalAlpha = 0.18; ctx.lineWidth = Math.max(1, SEAM.widthPx * 1.1);
  drawSeamBand(ctx, w, h, true);
  drawSeamBand(ctx, w, h, false);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
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

  const map  = makeAlbedo();
  const bump = makeBump();

  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.040,           // seam ridge strength
    color: new THREE.Color('#ffffff'),
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.015    // tiny lift; keeps seams natural
  });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
