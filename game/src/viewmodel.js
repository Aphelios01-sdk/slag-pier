import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

function buildGun(kind) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.55, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8e96, metalness: 0.85, roughness: 0.28 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb84a18, metalness: 0.15, roughness: 0.6 });
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function cyl(r, len, mat, x, y, z, rx = 0, ry = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.rotation.z = Math.PI / 2;
    m.rotation.x = rx; m.rotation.y = ry;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  if (kind === 'pistol') {
    box(0.22, 0.1, 0.08, steel, 0.05, 0.04, -0.15);
    box(0.14, 0.18, 0.07, dark, -0.02, -0.06, -0.05);
    cyl(0.02, 0.16, steel, 0.16, 0.04, -0.2);
  } else if (kind === 'smg') {
    box(0.28, 0.12, 0.1, dark, 0.05, 0.02, -0.2);
    box(0.1, 0.16, 0.08, accent, -0.06, -0.06, -0.08);
    box(0.06, 0.18, 0.07, dark, 0.02, -0.12, -0.15);
    cyl(0.025, 0.28, steel, 0.28, 0.03, -0.28);
  } else if (kind === 'shotgun') {
    box(0.34, 0.12, 0.1, dark, 0.08, 0.02, -0.22);
    box(0.22, 0.1, 0.08, accent, -0.18, 0.0, -0.1);
    box(0.14, 0.08, 0.09, accent, 0.18, -0.05, -0.18);
    cyl(0.035, 0.42, steel, 0.4, 0.04, -0.35);
  } else {
    // rifle
    box(0.42, 0.12, 0.1, dark, 0.1, 0.02, -0.25);
    box(0.22, 0.1, 0.08, dark, -0.22, 0.0, -0.12);
    box(0.08, 0.2, 0.07, dark, 0.02, -0.12, -0.18);
    box(0.14, 0.07, 0.08, accent, 0.2, -0.04, -0.2);
    cyl(0.028, 0.45, steel, 0.45, 0.04, -0.4);
    box(0.1, 0.06, 0.05, dark, 0.05, 0.1, -0.22);
  }
  g.rotation.set(0.08, Math.PI, 0.02);
  return g;
}

export function createViewmodel(camera) {
  const root = new THREE.Group();
  root.position.set(0.28, -0.26, -0.48);
  camera.add(root);
  let kick = 0;
  let sway = 0;

  async function setWeapon(weaponId) {
    while (root.children.length) root.remove(root.children[0]);
    const def = WEAPONS[weaponId];
    if (!def) return;
    const model = buildGun(def.kind);
    root.add(model);
  }

  function punch(amount = 1) {
    kick = Math.min(0.16, kick + 0.032 * amount);
  }

  function update(dt, moving) {
    sway += dt * (moving ? 10 : 3.2);
    const bob = moving ? Math.sin(sway) * 0.01 : 0;
    root.position.x = 0.28 + bob;
    root.position.y = -0.26 + Math.abs(Math.sin(sway * 0.5)) * (moving ? 0.008 : 0) + kick;
    root.rotation.x = kick * 0.7;
    kick = Math.max(0, kick - dt * 0.55);
  }

  function muzzleWorld(out) {
    out.set(0.12, -0.08, -0.95);
    camera.localToWorld(out);
    return out;
  }

  return { setWeapon, punch, update, muzzleWorld, root };
}
