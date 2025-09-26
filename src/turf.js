import * as THREE from 'three';

export function createTurfMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.0
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.turfDark    = { value: new THREE.Color('#0a140e') }; // deep green
    shader.uniforms.turfLight   = { value: new THREE.Color('#152a1d') }; // light stripe
    shader.uniforms.stripeScale = { value: 0.55 };   // STRIPE WIDTH (bigger = wider)
    shader.uniforms.noiseScale  = { value: 1.6 };    // fiber density
    shader.uniforms.bumpAmp     = { value: 0.10 };   // normal intensity
    shader.uniforms.roughAmp    = { value: 0.06 };   // roughness modulation
    shader.uniforms.seed        = { value: Math.random() * 1000.0 };

    // world position varying
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosition;
      `)
      .replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vWorldPosition;

        uniform vec3  turfDark, turfLight;
        uniform float stripeScale, noiseScale, bumpAmp, roughAmp, seed;

        float hash(vec3 p){
          p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
          p += dot(p, p.yzx+19.19);
          return fract((p.x+p.y)*p.z);
        }
        float noise3(vec3 p){
          vec3 i=floor(p), f=fract(p);
          f=f*f*(3.0-2.0*f);
          float n000=hash(i+vec3(0,0,0));
          float n100=hash(i+vec3(1,0,0));
          float n010=hash(i+vec3(0,1,0));
          float n110=hash(i+vec3(1,1,0));
          float n001=hash(i+vec3(0,0,1));
          float n101=hash(i+vec3(1,0,1));
          float n011=hash(i+vec3(0,1,1));
          float n111=hash(i+vec3(1,1,1));
          float nx00=mix(n000,n100,f.x);
          float nx10=mix(n010,n110,f.x);
          float nx01=mix(n001,n101,f.x);
          float nx11=mix(n011,n111,f.x);
          float nxy0=mix(nx00,nx10,f.y);
          float nxy1=mix(nx01,nx11,f.y);
          return mix(nxy0,nxy1,f.z);
        }
        float fbm(vec3 p){
          float a=0.5, s=0.0;
          s+=a*noise3(p); p*=2.02; a*=0.5;
          s+=a*noise3(p); p*=2.03; a*=0.5;
          s+=a*noise3(p); p*=2.01; a*=0.5;
          s+=a*noise3(p);
          return s;
        }

        // derivative-antialiased stripe (crisp at distance)
        float stripeAA(vec2 uv, float scale){
          // world-space coordinate along stripe direction
          float coord = uv.y / max(scale, 1e-4);
          float fw = fwidth(coord);                 // screen-space derivative
          float cell = fract(coord);                // 0..1 within a stripe
          // 0.5 = boundary; smoothstep with fw makes a crisp but stable edge
          return smoothstep(0.5 - fw, 0.5 + fw, cell);
        }

        vec3 triWeights(vec3 n){
          n = abs(n); n = max(n, 1e-5);
          return n / (n.x + n.y + n.z);
        }
      `)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>

        // ---- WORLD-SPACE triplanar turf ----
        vec3 wp  = vWorldPosition * 0.5;          // world scale control
        vec3 nrm = normalize( geometryNormal );
        vec3 w   = triWeights( nrm );

        // Axis UVs
        vec2 uvx = wp.zy;
        vec2 uvy = wp.xz;
        vec2 uvz = wp.xy;

        // Combine three directions
        float sx = stripeAA(uvx, stripeScale);
        float sy = stripeAA(uvy, stripeScale);
        float sz = stripeAA(uvz, stripeScale);
        float sMix = sx*w.x + sy*w.y + sz*w.z;    // 0..1

        // Base color: light/dark blend + tiny variation
        vec3 baseCol = mix(turfLight, turfDark, sMix);
        float n = fbm(wp * noiseScale + seed);
        baseCol *= 0.93 + 0.07 * n;
        diffuseColor.rgb = baseCol;

        // Micro-fiber normal from noise (tangent proxy)
        vec3 t = normalize(vec3(0.0, 1.0, 0.0));
        vec3 b = normalize(cross(nrm, t)); t = normalize(cross(b, nrm));
        float n1 = fbm(wp * (noiseScale*2.2) + 13.7);
        float n2 = fbm(wp * (noiseScale*2.2) -  9.2);
        vec3 micro = normalize(nrm + bumpAmp * ((n1-0.5)*t + (n2-0.5)*b));
        normal = micro;

        // Organic specular
        roughnessFactor = clamp( roughnessFactor + (n-0.5)*roughAmp, 0.18, 1.0 );
      `);

    mat.userData.shader = shader;
  };

  return mat;
}
