import * as THREE from 'three';

/**
 * Physically-based baseball with shader-drawn seams:
 * - Two tilted great-circle seams (accurate spherical paths)
 * - Thick seam bands (tweak SEAM_WIDTH_RAD)
 * - Leather pores via procedural bump (no external images)
 */

const SEAM_WIDTH_RAD = 0.14;                       // ~8° half-width (bold)
const SEAM_COLOR     = new THREE.Color('#C91F24'); // seam red

// Two seam plane normals (tilted so the paths look like real seams)
const P1 = new THREE.Vector3(0.0,  0.62,  0.78).normalize();
const P2 = new THREE.Vector3(0.0, -0.62,  0.78).normalize();

/* -------- Leather bump (procedural) -------- */
function makeLeatherBump(w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random()*36 - 18); // pores
    img.data[i] = img.data[i+1] = img.data[i+2] = n;
    img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* -------- Exported API -------- */
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
    emissiveIntensity: 0.02
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.seamColor   = { value: SEAM_COLOR.clone() };
    shader.uniforms.seamWidth   = { value: SEAM_WIDTH_RAD };
    shader.uniforms.p1          = { value: P1.clone() };
    shader.uniforms.p2          = { value: P2.clone() };

    // pass world normal
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vNormalWorld;
      `)
      .replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        vNormalWorld = normalize( mat3( modelMatrix ) * objectNormal );
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vNormalWorld;
        uniform vec3 seamColor;
        uniform float seamWidth;
        uniform vec3 p1;
        uniform vec3 p2;

        // Angular distance from point on unit sphere to a great circle (plane pn)
        float angDistToGreatCircle(vec3 n, vec3 pn) {
          return asin( abs( dot(n, pn) ) ); // radians
        }
      `)
      .replace('#include <output_fragment>', `
        vec3 n = normalize(vNormalWorld);

        float a1 = angDistToGreatCircle(n, normalize(p1));
        float a2 = angDistToGreatCircle(n, normalize(p2));

        // derivative AA so edges stay crisp
        float aa1 = fwidth(a1);
        float aa2 = fwidth(a2);
        float m1 = 1.0 - smoothstep(seamWidth - aa1, seamWidth + aa1, a1);
        float m2 = 1.0 - smoothstep(seamWidth - aa2, seamWidth + aa2, a2);
        float seamMask = clamp(m1 + m2, 0.0, 1.0);

        // color mix
        diffuseColor.rgb = mix(diffuseColor.rgb, seamColor, seamMask);

        // spec tweak on seams so highlights read
        roughnessFactor = clamp( roughnessFactor + mix(0.0, -0.08, seamMask), 0.2, 1.0 );

        #include <output_fragment>
      `);
  };

  return mat;
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
