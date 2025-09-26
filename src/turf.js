import * as THREE from 'three';

export function createTurfMaterial() {
  // Exact green from your swatch (solid).
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2E7B4F'),
    roughness: 0.92,
    metalness: 0.0
  });
}
