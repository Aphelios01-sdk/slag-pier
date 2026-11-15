import * as THREE from 'three';
import { resolveCollision } from './world.js';
import { clamp } from './util.js';

const WALK = 5.2;
const RUN = 6.4;
const CROUCH = 2.6;
const ACCEL = 28;
const FRICTION = 14;
const JUMP = 6.8;
const GRAVITY = 22;

export function createPlayer(colliders) {
  const state = {
    pos: new THREE.Vector3(0, 1.7, 18),
    vel: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    standing: true,
    crouch: false,
    onGround: true,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
    team: 'ash',
    name: 'You',
    eye: 1.7,
  };

  function spawnAt(s, team) {
    state.pos.set(s.x, 1.7, s.z);
    state.vel.set(0, 0, 0);
    state.yaw = s.yaw;
    state.pitch = 0;
    state.health = 100;
    state.alive = true;
    state.team = team;
    state.crouch = false;
    state.eye = 1.7;
  }

  function applyDamage(amount, head) {
    if (!state.alive) return 0;
    let dmg = amount;
    if (head && state.helmet) dmg *= 0.75;
    else if (!head && state.armor > 0) {
      const soak = Math.min(state.armor, dmg * 0.5);
      state.armor -= soak;
      dmg -= soak;
    }
    state.health = Math.max(0, state.health - dmg);
    if (state.health <= 0) { state.alive = false; state.health = 0; }
    return dmg;
  }

  function update(dt, input, camera) {
    if (!state.alive) return;
    const look = input.consumeMouse();
    state.yaw -= look.dx * 0.0022;
    state.pitch -= look.dy * 0.0022;
    state.pitch = clamp(state.pitch, -1.45, 1.45);

    state.crouch = input.pressed('ControlLeft') || input.pressed('ControlRight');
    const targetEye = state.crouch ? 1.15 : 1.7;
    state.eye = THREE.MathUtils.lerp(state.eye, targetEye, 1 - Math.pow(0.001, dt));

    const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    let wish = new THREE.Vector3();
    if (input.pressed('KeyW')) wish.add(forward);
    if (input.pressed('KeyS')) wish.sub(forward);
    if (input.pressed('KeyD')) wish.add(right);
    if (input.pressed('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const speed = state.crouch ? CROUCH : (input.pressed('ShiftLeft') ? RUN : WALK);
    const wishVel = wish.multiplyScalar(speed);
    const horiz = new THREE.Vector3(state.vel.x, 0, state.vel.z);
    const diff = wishVel.sub(horiz);
    const maxDelta = ACCEL * dt;
    if (diff.length() > maxDelta) diff.setLength(maxDelta);
    state.vel.x += diff.x;
    state.vel.z += diff.z;

    if (!wish.lengthSq()) {
      const h = Math.hypot(state.vel.x, state.vel.z);
      const drop = Math.max(0, h - FRICTION * dt);
      if (h > 1e-4) {
        state.vel.x *= drop / h;
        state.vel.z *= drop / h;
      } else { state.vel.x = 0; state.vel.z = 0; }
    }

    if (state.onGround && input.pressed('Space')) {
      state.vel.y = JUMP;
      state.onGround = false;
    }
    state.vel.y -= GRAVITY * dt;
    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;
    state.pos.y += state.vel.y * dt;
    if (state.pos.y <= state.eye) {
      state.pos.y = state.eye;
      state.vel.y = 0;
      state.onGround = true;
    } else state.onGround = false;

    resolveCollision(state.pos, 0.35, colliders);

    camera.position.copy(state.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
  }

  function moving() {
    return Math.hypot(state.vel.x, state.vel.z) > 0.6;
  }

  return { state, spawnAt, update, applyDamage, moving };
}
