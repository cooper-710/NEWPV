import * as THREE from 'three';

export function createTurfMaterial() {
  // Solid deep green with subtle micro variation and nice specular
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0f3a2b'), // darker + more saturated
    roughness: 0.92,
    metalness: 0.0
  });

  // Tiny organic variation to avoid being “flat”
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = { value: new THREE.Color('#0f3a2b') };
    shader.uniforms.uNoiseAmp = { value: 0.03 };

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uTint;
        uniform float uNoiseAmp;

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
      `)
      .replace('#include <output_fragment>', `
        // base color from material
        vec3 base = diffuseColor.rgb;

        // world-ish scale micro-shade using view-space pos (good enough)
        float n = noise3(vec3(gl_FragCoord.xy*0.002, 0.0));
        base = mix(base, base*1.06, n*uNoiseAmp);

        diffuseColor.rgb = base;
        #include <output_fragment>
      `);
  };

  return mat;
}
