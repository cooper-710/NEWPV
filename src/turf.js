// Procedural, PBR turf using MeshStandardMaterial + safe shader injection.
// - Triplanar mow stripes in WORLD space (no UV blur/stretch)
// - Micro-fiber normals via fbm noise
// - Subtle roughness variation for organic specular
// No external textures. Works sharp at any zoom.

import * as THREE from 'three';

export function createTurfMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0
  });

  mat.onBeforeCompile = (shader) => {
    // Uniforms for look tuning
    shader.uniforms.turfDark   = { value: new THREE.Color('#0a140e') };
    shader.uniforms.turfLight  = { value: new THREE.Color('#12251a') };
    shader.uniforms.stripeScale= { value: 0.22 };  // smaller = wider stripes
    shader.uniforms.noiseScale = { value: 1.8 };
    shader.uniforms.bumpAmp    = { value: 0.12 };
    shader.uniforms.roughAmp   = { value: 0.07 };
    shader.uniforms.seed       = { value: Math.random() * 1000.0 };

    // ---- Add varying for world position (both shaders) ----
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosition;
      `)
      .replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    // ---- Utilities + uniforms + varying in fragment ----
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosition;

        uniform vec3 turfDark;
        uniform vec3 turfLight;
        uniform float stripeScale;
        uniform float noiseScale;
        uniform float bumpAmp;
        uniform float roughAmp;
        uniform float seed;

        float hash(vec3 p){
          p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
          p += dot(p, p.yzx+19.19);
          return fract((p.x+p.y)*p.z);
        }
        float noise3(vec3 p){
          vec3 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          float n000 = hash(i+vec3(0,0,0));
          float n100 = hash(i+vec3(1,0,0));
          float n010 = hash(i+vec3(0,1,0));
          float n110 = hash(i+vec3(1,1,0));
          float n001 = hash(i+vec3(0,0,1));
          float n101 = hash(i+vec3(1,0,1));
          float n011 = hash(i+vec3(0,1,1));
          float n111 = hash(i+vec3(1,1,1));
          float nx00 = mix(n000,n100,f.x);
          float nx10 = mix(n010,n110,f.x);
          float nx01 = mix(n001,n101,f.x);
          float nx11 = mix(n011,n111,f.x);
          float nxy0 = mix(nx00,nx10,f.y);
          float nxy1 = mix(nx01,nx11,f.y);
          return mix(nxy0,nxy1,f.z);
        }
        float fbm(vec3 p){
          float a=0.5, s=0.0;
          s += a*noise3(p); p*=2.02; a*=0.5;
          s += a*noise3(p); p*=2.03; a*=0.5;
          s += a*noise3(p); p*=2.01; a*=0.5;
          s += a*noise3(p);
          return s;
        }
        vec3 triWeights(vec3 n){
          n = abs(n);
          n = max(n, 1e-5);
          return n / (n.x + n.y + n.z);
        }
        float stripes(vec2 uv, float scale){
          // Soft sine bands + a touch of anti-banding from floating-point noise downstream
          return 0.5 + 0.45 * sin(uv.y * 3.14159 / max(1e-4, scale));
        }
      `)
      // Inject our turf logic AFTER the engine computes base "normal"
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>

        // ----- WORLD-SPACE turf shading -----
        vec3 wp  = vWorldPosition * 0.5;              // world scale control
        vec3 nrm = normalize( geometryNormal );       // base geometric normal
        vec3 w   = triWeights( nrm );                 // triplanar weights

        // Axis-aligned UVs
        vec2 uvx = wp.zy;
        vec2 uvy = wp.xz;
        vec2 uvz = wp.xy;

        float sx = stripes(uvx, stripeScale);
        float sy = stripes(uvy, stripeScale);
        float sz = stripes(uvz, stripeScale);
        float sMix = sx*w.x + sy*w.y + sz*w.z;

        // Albedo: dark<->light blend, then micro variation
        vec3 baseCol = mix(turfDark, turfLight, sMix);
        float n = fbm(wp * noiseScale + seed);
        baseCol *= 0.92 + 0.08 * n;

        // Write to diffuseColor (pre-PBR)
        diffuseColor.rgb = baseCol;

        // Micro-fiber normal perturbation using noise derivatives (tangent proxy)
        vec3 t = normalize(vec3(0.0, 1.0, 0.0));
        vec3 b = normalize(cross(nrm, t)); t = normalize(cross(b, nrm));
        float n1 = fbm(wp * (noiseScale*2.2) + 13.7);
        float n2 = fbm(wp * (noiseScale*2.2) -  9.2);
        vec3 micro = normalize(nrm + bumpAmp * ((n1-0.5)*t + (n2-0.5)*b));
        normal = micro;

        // Roughness modulation for organic specular response
        roughnessFactor = clamp( roughnessFactor + (n-0.5)*roughAmp, 0.2, 1.0 );
      `);

    // keep a handle for live tweaking if desired later
    mat.userData.shader = shader;
  };

  return mat;
}
