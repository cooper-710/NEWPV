import * as THREE from 'three';

export function createTurfMaterial() {
  // Much darker, saturated ballpark green (solid).
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0B2A1B'),
    roughness: 0.92,
    metalness: 0.0
  });
}
