import * as THREE from 'three';
import { resolveCollision } from './world.js';
import { dist2, angleDiff, clamp, mulberry32 } from './util.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const NAMES = {
  ash: ['Flint', 'Cinder', 'Ember', 'Pyre', 'Soot'],
  coil: ['Brine', 'Reef', 'Gull', 'Wake', 'Marlin'],
};

function makeBody(color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.75, 0.32),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.32, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.65 }),
  );
  head.position.y = 1.72;
  head.castShadow = true;
  head.name = 'head';
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 }),
  );
  legs.position.y = 0.4;
  g.add(torso, head, legs);
  g.userData.head = head;
  g.userData.torso = torso;
  return g;
}

export function createBots(scene, world, random = Math.random) {
  const bots = [];
  const rng = typeof random === 'function' ? random : Math.random;

  function spawnTeam(team, count, weaponId) {
    const color = team === 'ash' ? PALETTE.ash : PALETTE.coil;
    const spots = world.spawns[team];
    for (let i = 0; i < count; i++) {
      const mesh = makeBody(color);
      const s = spots[i % spots.length];
      mesh.position.set(s.x + (rng() - 0.5), 0, s.z + (rng() - 0.5));
      scene.add(mesh);
      const bot = {
        mesh,
        team,
        name: NAMES[team][i % NAMES[team].length],
        health: 100,
        armor: 50,
        helmet: true,
        alive: true,
        yaw: s.yaw,
        weaponId: weaponId || (team === 'ash' ? 'tern_ar' : 'pike_r4'),
        mag: 30,
        cooldown: rng() * 0.5,
        state: 'hold', // hold | push | plant | hunt | retreat
        targetSite: rng() < 0.55 ? 'A' : 'B',
        routeT: rng(),
        aimErr: 0,
        lastHeard: null,
        kills: 0, assists: 0, deaths: 0, dmg: 0, hs: 0, shots: 0,
      };
      bots.push(bot);
    }
  }

  function resetRound(attacker = 'ash') {
    for (const b of bots) {
      scene.remove(b.mesh);
    }
    bots.length = 0;
    const defTeam = attacker === 'ash' ? 'coil' : 'ash';
    spawnTeam(attacker, 4, attacker === 'ash' ? 'tern_ar' : 'gadfly');
    spawnTeam(defTeam, 5, 'tern_ar');
  }

  function hitMeshes() {
    return bots.filter((b) => b.alive).flatMap((b) => [b.mesh.userData.torso, b.mesh.userData.head]);
  }

  function applyDamage(bot, amount, head, attackerName) {
    if (!bot.alive) return 0;
    let dmg = amount;
    if (head && bot.helmet) dmg *= 0.7;
    bot.health -= dmg;
    bot.dmgTaken = (bot.dmgTaken || 0) + dmg;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.deaths += 1;
      bot.mesh.visible = false;
      return { killed: true, head, name: bot.name, team: bot.team };
    }
    bot.lastHeard = { x: bot.mesh.position.x, z: bot.mesh.position.z, t: 2 };
    return { killed: false, head, name: bot.name, team: bot.team };
  }

  function update(dt, player, effects, onBotShot) {
    const playerPos = player.state.pos;
    for (const b of bots) {
      if (!b.alive) continue;
      const site = world.sites[b.targetSite];
      const alliesAlive = bots.filter((x) => x.alive && x.team === b.team).length;
      const enemies = bots.filter((x) => x.alive && x.team !== b.team);

      // Perception: see player / enemies if LOS not smoked and in cone
      let focus = null;
      if (player.state.alive && player.state.team !== b.team) {
        const d = dist2(b.mesh.position.x, b.mesh.position.z, playerPos.x, playerPos.z);
        if (d < 38 && !effects.blocksSight(b.mesh.position.x, b.mesh.position.z, playerPos.x, playerPos.z)) {
          focus = { x: playerPos.x, y: playerPos.y, z: playerPos.z, isPlayer: true, d };
        }
      }
      for (const e of enemies) {
        const d = dist2(b.mesh.position.x, b.mesh.position.z, e.mesh.position.x, e.mesh.position.z);
        if (d < 35 && (!focus || d < focus.d) && !effects.blocksSight(b.mesh.position.x, b.mesh.position.z, e.mesh.position.x, e.mesh.position.z)) {
          focus = { x: e.mesh.position.x, y: 1.4, z: e.mesh.position.z, bot: e, d };
        }
      }

      // Role: attackers push site, defenders hold
      let tx = site.x, tz = site.z;
      if (b.team === player.state.team || b.team === 'ash') {
        // mix mid control
        if (b.routeT < 0.35) { tx = 2; tz = 0; }
      } else {
        if (b.routeT < 0.4) { tx = site.x * 0.5; tz = site.z * 0.5; }
      }
      if (focus) { tx = focus.x; tz = focus.z; }

      const dx = tx - b.mesh.position.x;
      const dz = tz - b.mesh.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const desiredYaw = Math.atan2(-dx, -dz);
      b.yaw += angleDiff(b.yaw, desiredYaw) * Math.min(1, dt * 4);

      const speed = focus && focus.d < 12 ? 2.2 : 3.6;
      if (!focus || focus.d > 8) {
        b.mesh.position.x += (-Math.sin(b.yaw)) * speed * dt;
        b.mesh.position.z += (-Math.cos(b.yaw)) * speed * dt;
        resolveCollision(b.mesh.position, 0.35, world.colliders);
      }
      b.mesh.rotation.y = b.yaw;

      // Shoot
      b.cooldown -= dt;
      if (focus && b.cooldown <= 0 && focus.d < 32) {
        const def = WEAPONS[b.weaponId];
        b.cooldown = 60 / def.rpm * (1.1 + rng() * 0.4);
        b.shots += 1;
        // accuracy: worse while moving / far
        const err = 0.02 + focus.d * 0.0015 + rng() * 0.02;
        const aim = new THREE.Vector3(focus.x - b.mesh.position.x, (focus.y || 1.4) - 1.4, focus.z - b.mesh.position.z).normalize();
        aim.x += (rng() - 0.5) * err;
        aim.y += (rng() - 0.5) * err * 0.5;
        aim.z += (rng() - 0.5) * err;
        aim.normalize();
        const origin = b.mesh.position.clone(); origin.y = 1.45;
        const end = origin.clone().addScaledVector(aim, 50);
        effects.tracer(origin, end, b.team === 'ash' ? 0xffb080 : 0xa0ffe8);
        onBotShot?.(b, origin, aim, def);
      }
    }
  }

  function alive(team) {
    return bots.filter((b) => b.alive && b.team === team);
  }

  return { bots, resetRound, hitMeshes, applyDamage, update, alive };
}
