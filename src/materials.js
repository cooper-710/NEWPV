import * as THREE from 'three';

/**
 * Physically-based baseball with shader-drawn seams:
 * - Two tilted great-circle seams (accurate spherical paths)
 * - Thick seams (tune SEAM_WIDTH_RAD)
 * - Leather pores via procedural bump (no external images)
 */

const SEAM_WIDTH_RAD = 0.14;                       // ~8° half-width (bold; ~5×)
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

    // Pass world-space position of the vertex AND the ball center to fragment.
    // Using world position ensures seams render correctly even when ball moves.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPos;
        varying vec3 vBallCenter;
      `)
      .replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vBallCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPos;
        varying vec3 vBallCenter;
        uniform vec3 seamColor;
        uniform float seamWidth;
        uniform vec3 p1;
        uniform vec3 p2;

        // Angular distance from a point on the unit sphere (dir) to a great circle
        // defined by plane normal 'pn'. Great circle => all points where dot(dir, pn)==0.
        float angDistToGreatCircle(vec3 dir, vec3 pn) {
          return asin( abs( dot(dir, pn) ) );
        }
      `)
      .replace('#include <output_fragment>', `
        // Direction from ball center to this fragment, normalized (unit sphere param)
        vec3 dir = normalize(vWorldPos - vBallCenter);

        // Distance (radians) to each seam orbit
        float a1 = angDistToGreatCircle(dir, normalize(p1));
        float a2 = angDistToGreatCircle(dir, normalize(p2));

        // Derivative AA so edges stay crisp across distances/angles
        float aa1 = fwidth(a1);
        float aa2 = fwidth(a2);
        float m1 = 1.0 - smoothstep(seamWidth - aa1, seamWidth + aa1, a1);
        float m2 = 1.0 - smoothstep(seamWidth - aa2, seamWidth + aa2, a2);
        float seamMask = clamp(m1 + m2, 0.0, 1.0);

        // Color blend
        diffuseColor.rgb = mix(diffuseColor.rgb, seamColor, seamMask);

        // Slight spec tweak on seams so highlights read
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
