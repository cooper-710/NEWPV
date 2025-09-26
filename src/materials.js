import * as THREE from 'three';

/**
 * Baseball leather with long, smooth “figure-8” seams rendered in object space.
 * - Two sinusoidal latitude bands, π phase-shifted → classic figure-8 wrap.
 * - Edges use fwidth AA → razor clean at any zoom.
 * - Seam thickness ≈5× (tweak SEAMS.widthRad).
 */

// Seam look
const SEAMS = {
  color: new THREE.Color('#C91F24'), // rich red
  widthRad: 0.16,    // ~9° half-width (bold). 0.12 thinner, 0.18 thicker.
  amp: 0.28,         // larger amplitude → longer path (more “figure-8”)
  offsetRad: 0.18    // small offset from equator so bands meet nicely
};

// Leather pores via canvas bump (lightweight, no external assets)
function makeLeatherBump(w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random() * 36 - 18); // subtle grain
    img.data[i] = img.data[i+1] = img.data[i+2] = n;
    img.data[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const accentHex = ({
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30');

  const bump = makeLeatherBump();

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f2f2f2'), // leather
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    bumpMap: bump,
    bumpScale: 0.03,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.012
  });

  mat.onBeforeCompile = (shader) => {
    // uniforms
    shader.uniforms.seamColor  = { value: SEAMS.color.clone() };
    shader.uniforms.seamWidth  = { value: SEAMS.widthRad };
    shader.uniforms.seamAmp    = { value: SEAMS.amp };
    shader.uniforms.seamOffset = { value: SEAMS.offsetRad };

    // pass object-space position (sphere centered at origin)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vObjPos = position;
      `);

    // figure-8 seams in object-space spherical coords
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
        uniform vec3  seamColor;
        uniform float seamWidth;
        uniform float seamAmp;
        uniform float seamOffset;

        // angular distance (radians) from a latitude band centerline
        // dir: unit vector; band: phi_c(theta) = phi0 + amp * sin(2*theta + phase)
        float latBandDist(vec3 dir, float phi0, float amp, float phase) {
          vec3 n = normalize(dir);
          float phi   = acos(clamp(n.y, -1.0, 1.0)); // [0, π]
          float theta = atan(n.z, n.x);              // [-π, π]
          float center = phi0 + amp * sin(2.0*theta + phase);
          return abs(phi - center);
        }
      `)
      .replace('#include <output_fragment>', `
        vec3 dir = normalize(vObjPos);

        // Two long bands, π phase-shifted → figure-8 around the sphere
        float d1 = latBandDist(dir, (3.14159265 * 0.5) - seamOffset, seamAmp, 0.0);
        float d2 = latBandDist(dir, (3.14159265 * 0.5) + seamOffset, seamAmp, 3.14159265);

        // derivative AA for crisp edges
        float aa1 = max(1e-6, fwidth(d1));
        float aa2 = max(1e-6, fwidth(d2));

        float m1 = 1.0 - smoothstep(seamWidth - aa1, seamWidth + aa1, d1);
        float m2 = 1.0 - smoothstep(seamWidth - aa2, seamWidth + aa2, d2);
        float seamMask = clamp(m1 + m2, 0.0, 1.0);

        // color + slight roughness reduction on seams to catch highlight
        diffuseColor.rgb = mix(diffuseColor.rgb, seamColor, seamMask);
        roughnessFactor = clamp( roughnessFactor + mix(0.0, -0.07, seamMask), 0.2, 1.0 );

        #include <output_fragment>
      `);
  };

  mat.needsUpdate = true;
  return mat;
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
