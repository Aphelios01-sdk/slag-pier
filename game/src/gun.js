import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { clamp } from './util.js';

export function createGun(audio, effects, viewmodel) {
  const state = {
    id: 'spar_p9',
    mag: 13,
    reserve: 52,
    cooldown: 0,
    reloading: 0,
    heat: 0,
  };

  function equip(id) {
    const def = WEAPONS[id];
    if (!def) return;
    state.id = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloading = 0;
    state.heat = 0;
    viewmodel.setWeapon(id);
  }

  function refillFromDef() {
    const def = WEAPONS[state.id];
    state.mag = def.mag;
    state.reserve = def.reserve;
  }

  function tryReload() {
    const def = WEAPONS[state.id];
    if (state.reloading > 0 || state.mag >= def.mag || state.reserve <= 0) return;
    state.reloading = def.reload;
    audio.reload();
  }

  function fire(camera, moving, crouch, hitTest) {
    const def = WEAPONS[state.id];
    if (state.reloading > 0 || state.cooldown > 0 || state.mag <= 0) {
      if (state.mag <= 0) tryReload();
      return null;
    }
    state.mag -= 1;
    state.cooldown = 60 / def.rpm;
    state.heat = Math.min(1, state.heat + 0.08);
    audio.fire(def.kind);
    viewmodel.punch(def.kind === 'shotgun' ? 2.2 : 1);

    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const muzzle = new THREE.Vector3();
    viewmodel.muzzleWorld(muzzle);
    effects.muzzle(muzzle);

    const pellets = def.pellets || 1;
    const results = [];
    for (let i = 0; i < pellets; i++) {
      const dir = forward.clone();
      let spread = def.spread + state.heat * 0.02;
      if (moving) spread += def.moveSpread;
      if (crouch) spread *= 0.65;
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();

      // recoil punch on camera handled by caller via recoil vector
      const hit = hitTest(origin, dir, def.range);
      const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, def.range);
      effects.tracer(muzzle, end);
      if (hit) results.push(hit);
    }
    return {
      results,
      recoil: { x: def.recoil[0] * (0.7 + Math.random() * 0.6), y: (Math.random() - 0.5) * def.recoil[1] },
      def,
    };
  }

  function update(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const def = WEAPONS[state.id];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.reloading = 0;
      }
    }
    state.heat = Math.max(0, state.heat - dt * 0.35);
  }

  return { state, equip, fire, tryReload, update, refillFromDef, get def() { return WEAPONS[state.id]; } };
}
