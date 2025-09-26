import * as THREE from 'three';

/**
 * Baseball with solid leather + procedural cross-section seams (two great circles).
 * Seam edges are SDF + fwidth AA, so they stay razor-clean at any zoom.
 */

const LACES = {
  color: new THREE.Color('#C91F24'),
  widthRad: 0.16,  // ~9° half-width (bold). 0.12 thinner, 0.18 thicker.
};

// Leather pores via canvas bump
function makeLeatherBump(w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 210 + (Math.random() * 36 - 18);
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
    shader.uniforms.seamColor = { value: LACES.color.clone() };
    shader.uniforms.seamWidth = { value: LACES.widthRad };

    // pass object position (centered sphere) to fragment
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vObjPos = position; // sphere centered at origin
      `);

    // draw two great circles: XY-plane (equator) and YZ-plane (90° rotated)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vObjPos;
        uniform vec3  seamColor;
        uniform float seamWidth;

        float distToGreatCircle(vec3 dir, vec3 planeN){
          return asin( abs( dot(dir, planeN) ) );
        }
      `)
      .replace('#include <output_fragment>', `
        vec3 dir = normalize(vObjPos);

        vec3 pn1 = vec3(0.0, 0.0, 1.0); // XY-plane circle
        vec3 pn2 = vec3(1.0, 0.0, 0.0); // YZ-plane circle

        float d1 = distToGreatCircle(dir, pn1);
        float d2 = distToGreatCircle(dir, pn2);

        float aa1 = max(1e-6, fwidth(d1));
        float aa2 = max(1e-6, fwidth(d2));

        float m1 = 1.0 - smoothstep(seamWidth - aa1, seamWidth + aa1, d1);
        float m2 = 1.0 - smoothstep(seamWidth - aa2, seamWidth + aa2, d2);
        float seamMask = clamp(m1 + m2, 0.0, 1.0);

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
