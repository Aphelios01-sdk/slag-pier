import * as THREE from 'three';

export function createEffects(scene) {
  const tracers = [];
  const smokes = [];
  const flashes = [];
  const decals = [];
  const muzzleMats = [];

  function tracer(from, to, color = 0xffe0a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    scene.add(line);
    tracers.push({ mesh: line, t: 0.08 });
  }

  function muzzle(pos) {
    const light = new THREE.PointLight(0xffcc66, 1.4, 6);
    light.position.copy(pos);
    scene.add(light);
    const sprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    sprite.position.copy(pos);
    scene.add(sprite);
    muzzleMats.push({ light, sprite, t: 0.05 });
  }

  function smokeCloud(x, z, color = 0xd8d0c8) {
    const group = new THREE.Group();
    group.position.set(x, 1.2, z);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.9 + Math.random() * 0.7, 8, 8),
        new THREE.MeshStandardMaterial({
          color, transparent: true, opacity: 0.55, depthShading: true, depthWrite: false,
        }),
      );
      s.position.set((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2);
      group.add(s);
    }
    scene.add(group);
    smokes.push({ group, life: 15, x, z, r: 4.5 });
  }

  function flashBang(x, z, playerPos, lookDir) {
    flashes.push({ x, z, t: 0.05, peak: 1.8 });
    const to = new THREE.Vector3(x - playerPos.x, 0, z - playerPos.z).normalize();
    const facing = lookDir.dot(to);
    return facing > 0.15 ? Math.min(1, 0.35 + facing) : 0.15;
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].t -= dt;
      if (tracers[i].t <= 0) { scene.remove(tracers[i].mesh); tracers[i].mesh.geometry.dispose(); tracers.splice(i, 1); }
    }
    for (let i = muzzleMats.length - 1; i >= 0; i--) {
      muzzleMats[i].t -= dt;
      if (muzzleMats[i].t <= 0) {
        scene.remove(muzzleMats[i].light);
        scene.remove(muzzleMats[i].sprite);
        muzzleMats.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.life -= dt;
      s.group.children.forEach((c, n) => {
        c.position.y += dt * 0.15;
        c.material.opacity = Math.max(0, 0.55 * (s.life / 15));
      });
      if (s.life <= 0) { scene.remove(s.group); smokes.splice(i, 1); }
    }
  }

  function blocksSight(ax, az, bx, bz) {
    for (const s of smokes) {
      // segment vs circle approx
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / (len * len)));
      const px = ax + dx * t, pz = az + dz * t;
      if (Math.hypot(px - s.x, pz - s.z) < s.r) return true;
    }
    return false;
  }

  return { tracer, muzzle, smokeCloud, flashBang, update, blocksSight, smokes };
}
