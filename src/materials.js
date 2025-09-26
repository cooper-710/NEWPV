import * as THREE from 'three';

/**
 * Materials: leather texture (for pores) + procedural object-space seams.
 * - Two parallel, sine-offset bands drawn in shader (no UV distortion)
 * - Thick seams (SEAM_WIDTH_RAD)
 * - fwidth() AA edges keep them crisp at any zoom
 */

const SEAM = {
  color: new THREE.Color('#C91F24'),
  widthRad: 0.16,     // ~9° half-width (bold; raise to 0.18 for thicker)
  amp: 0.22,          // sine amplitude around the equator (0..~0.3 looks natural)
  offsetRad: 0.45     // how far each band sits from equator, in radians (0..~0.6)
};

/* -------- Leather bump (small pores) via canvas -------- */
function makeLeatherBump(w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random() * 36 - 18);
    img.data[i] = img.data[i+1] = img.data[i+2] = n;
    img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* ---------------- Exported API ---------------- */
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
    color: new THREE.Color('#f2f2f2'),
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
    // uniforms to control seam look
    shader.uniforms.seamColor   = { value: SEAM.color.clone() };
    shader.uniforms.seamWidth   = { value: SEAM.widthRad };
    shader.uniforms.seamAmp     = { value: SEAM.amp };
    shader.uniforms.seamOffset  = { value: SEAM.offsetRad };

    // pass object-space position (centered) to fragment
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vObjPos = position; // object space; ball is centered at origin
      `);

    // inject seam logic; draw in object space so no UV distortion
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
        uniform vec3  seamColor;
        uniform float seamWidth;
        uniform float seamAmp;
        uniform float seamOffset;

        // Signed angular distance (radians) from a direction to a latitude band centerline
        // dir: normalized object-space position; band defined by latitude phi0 with sine wobble.
        float latBandDist(vec3 dir, float phi0, float amp) {
          // spherical coords from dir (y = up)
          float phi   = acos(clamp(dir.y, -1.0, 1.0));        // [0, pi]
          float theta = atan(dir.z, dir.x);                   // [-pi, pi]
          float center = phi0 + amp * sin(theta * 2.0);       // wavy centerline
          return abs(phi - center);
        }
      `)
      .replace('#include <output_fragment>', `
        // unit direction on sphere from object-space
        vec3 dir = normalize(vObjPos);

        // two parallel bands: above and below equator
        float dUp = latBandDist(dir, (3.14159265 * 0.5) - seamOffset, seamAmp);
        float dDn = latBandDist(dir, (3.14159265 * 0.5) + seamOffset, seamAmp);

        // fwidth-based AA for razor edges
        float aaUp = max(1e-6, fwidth(dUp));
        float aaDn = max(1e-6, fwidth(dDn));
        float mUp = 1.0 - smoothstep(seamWidth - aaUp, seamWidth + aaUp, dUp);
        float mDn = 1.0 - smoothstep(seamWidth - aaDn, seamWidth + aaDn, dDn);
        float seamMask = clamp(mUp + mDn, 0.0, 1.0);

        // color blend + tiny roughness tweak on seams for highlight pop
        diffuseColor.rgb = mix(diffuseColor.rgb, seamColor, seamMask);
        roughnessFactor = clamp( roughnessFactor + mix(0.0, -0.07, seamMask), 0.2, 1.0 );

        #include <output_fragment>
      `);
  };

  // ensure recompilation with our injection
  mat.needsUpdate = true;
  return mat;
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
