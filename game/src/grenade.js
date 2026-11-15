/**
 * Frag / flare / smoke projectiles with fuse and area effects.
 */
import * as THREE from 'three';

export function createGrenades(scene, effects, audio) {
  const live = [];

  function throwOne(type, origin, dir) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({
        color: type === 'smoke' ? 0xd0d0d0 : type === 'flare' ? 0xf0e060 : 0x4a3a2a,
        roughness: 0.5, metalness: 0.3,
      }),
    );
    mesh.position.copy(origin);
    scene.add(mesh);
    const vel = dir.clone().normalize().multiplyScalar(16);
    vel.y += 4.5;
    live.push({ type, mesh, vel, fuse: type === 'smoke' ? 1.1 : 1.35, done: false });
  }

  function update(dt, onFrag, onFlare, onSmoke) {
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.12) {
        g.mesh.position.y = 0.12;
        g.vel.y *= -0.25;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        const p = g.mesh.position;
        if (g.type === 'frag') { audio.explode(); onFrag?.(p.x, p.z); }
        else if (g.type === 'flare') { onFlare?.(p.x, p.z); }
        else { effects.smokeCloud(p.x, p.z); onSmoke?.(p.x, p.z); }
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }
  }

  return { throwOne, update, live };
}
