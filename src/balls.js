import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';
import { createHalfColorMaterial, getSpinAxisVector } from './materials.js';
import { pitchColorMap } from './constants.js';
import { getRefs } from './scene.js';
import { Bus } from './data.js';

let balls = [];
let trailDots = [];
let showTrail = false;

export function clearBalls() {
  const { scene } = getRefs();
  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];
  for (const b of balls) scene.remove(b);
  balls = [];
}

export function setTrailVisible(on) {
  showTrail = !!on;
  if (!showTrail) {
    const { scene } = getRefs();
    for (const d of trailDots) scene.remove(d.mesh);
    trailDots = [];
  }
}

export function addBall(pitch, pitchType) {
  const { scene, clock } = getRefs();

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 32, 32),
    createHalfColorMaterial(pitchType)
  );
  ball.castShadow = true;

  // Prefer dataset's average velocity if provided (Statcast-style: mph)
  // Fallback: derive from initial velocity vector (ft/s -> mph)
  const v3dFtPerS = Math.sqrt((pitch.vx0||0)**2 + (pitch.vy0||0)**2 + (pitch.vz0||0)**2);
  const mphFallback = v3dFtPerS * 0.681818; // 1 mph = 1.46667 ft/s
  const mphDisplay = (typeof pitch.release_speed === 'number' && isFinite(pitch.release_speed))
    ? pitch.release_speed
    : mphFallback;

  const t0 = clock.getElapsedTime();
  ball.userData = {
    type: pitchType,
    t0,
    mphDisplay, // store once, use for metrics
    release:  { x: -pitch.release_pos_x, y: pitch.release_pos_z, z: -pitch.release_extension },
    velocity: { x: -pitch.vx0, y: pitch.vz0, z: pitch.vy0 },
    accel:    { x: -pitch.ax,  y: pitch.az,  z: pitch.ay  },
    spinRate: pitch.release_spin_rate || 0,
    spinAxis: getSpinAxisVector(pitch.spin_axis || 0),
  };

  ball.position.set(ball.userData.release.x, ball.userData.release.y, ball.userData.release.z);
  balls.push(ball);
  scene.add(ball);
}

export function removeBallByType(pitchType) {
  const { scene } = getRefs();
  balls = balls.filter(ball => {
    if (ball.userData.type === pitchType) {
      scene.remove(ball);
      trailDots = trailDots.filter(d => {
        const keep = d.mesh.userData?.type !== pitchType;
        if (!keep) scene.remove(d.mesh);
        return keep;
      });
      return false;
    }
    return true;
  });
}

export function replayAll() {
  const { clock } = getRefs();
  const now = clock.getElapsedTime();
  for (const b of balls) {
    b.userData.t0 = now;
    b.position.set(b.userData.release.x, b.userData.release.y, b.userData.release.z);
  }
  setTrailVisible(showTrail);
}

export function animateBalls(delta) {
  const { scene, renderer, camera, clock } = getRefs();
  const now = clock.getElapsedTime();

  for (const ball of balls) {
    const { t0, release, velocity, accel, spinRate, spinAxis } = ball.userData;
    const t = now - t0;
    const z = release.z + velocity.z * t + 0.5 * accel.z * t * t;
    if (z <= -60.5) continue;

    ball.position.x = release.x + velocity.x * t + 0.5 * accel.x * t * t;
    ball.position.y = release.y + velocity.y * t + 0.5 * accel.y * t * t;
    ball.position.z = z;

    if (showTrail) {
      const baseType = (ball.userData.type || '').split(' ')[0];
      const color = pitchColorMap[baseType] || 0x888888;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      dot.position.copy(ball.position);
      dot.userData = { type: ball.userData.type };
      scene.add(dot);
      trailDots.push({ mesh: dot, t0: now });
    }

    if (spinRate > 0) {
      const radPerSec = (spinRate / 60) * 2 * Math.PI;
      ball.rotateOnAxis(spinAxis.clone().normalize(), radPerSec * delta);
    }
  }

  // Cull old trail dots
  trailDots = trailDots.filter(d => {
    if (now - d.t0 > 9.5) { scene.remove(d.mesh); return false; }
    return true;
  });

  // Emit telemetry: use the last ball's stored average mph
  const last = balls[balls.length - 1];
  if (last) {
    Bus.emit('frameStats', {
      nBalls: balls.length,
      last: { mph: +last.userData.mphDisplay.toFixed(1), spin: Math.round(last.userData.spinRate || 0) }
    });
  }

  renderer.render(scene, camera);
}
