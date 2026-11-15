/**
 * Team AI for Slag Pier: roles (entry/mid/anchor/flank), nav routes, hearing reactions,
 * site holds, and plant/defuse awareness. ~line-heavy on purpose for clear tactics.
 */
import * as THREE from 'three';
import { resolveCollision } from './world.js';
import { dist2, angleDiff } from './util.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { createNavigator, siteTarget, holdTarget } from './nav.js';

const NAMES = {
  ash: ['Flint', 'Cinder', 'Ember', 'Pyre', 'Soot', 'Kiln'],
  coil: ['Brine', 'Reef', 'Gull', 'Wake', 'Marlin', 'Tide'],
};
const ROLES = ['entry', 'mid', 'anchor', 'flank', 'support'];

function makeBody(color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.78, 0.34),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08 }),
  );
  torso.position.y = 1.18; torso.castShadow = true; torso.receiveShadow = true;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.6 }),
  );
  head.position.y = 1.76; head.castShadow = true; head.name = 'head';
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.72, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8 }),
  );
  legs.position.y = 0.4; legs.castShadow = true;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.5, roughness: 0.4 }),
  );
  gun.position.set(0.28, 1.15, -0.25);
  g.add(torso, head, legs, gun);
  g.userData.head = head;
  g.userData.torso = torso;
  return g;
}

export function createBots(scene, world, random = Math.random, hearing = null) {
  const bots = [];
  const rng = typeof random === 'function' ? random : Math.random;
  const nav = createNavigator();

  function spawnTeam(team, count, weaponId) {
    const color = team === 'ash' ? PALETTE.ash : PALETTE.coil;
    const spots = world.spawns[team];
    for (let i = 0; i < count; i++) {
      const mesh = makeBody(color);
      const s = spots[i % spots.length];
      mesh.position.set(s.x + (rng() - 0.5) * 0.8, 0, s.z + (rng() - 0.5) * 0.8);
      scene.add(mesh);
      const role = ROLES[i % ROLES.length];
      const site = rng() < 0.55 ? 'A' : 'B';
      const bot = {
        mesh, team, role, name: NAMES[team][i % NAMES[team].length],
        health: 100, armor: 60, helmet: true, alive: true,
        yaw: s.yaw,
        weaponId: weaponId || (role === 'entry' ? 'gadfly' : 'tern_ar'),
        mag: 30, cooldown: rng() * 0.6,
        targetSite: site,
        state: 'rotate', // rotate | hold | push | hunt | plant | defuse | investigate
        route: [], routeIndex: 0, goal: null,
        aimErr: 0.02 + rng() * 0.02,
        lastHeard: null,
        investigate: null,
        holdT: 0,
        kills: 0, assists: 0, deaths: 0, dmg: 0, hs: 0, shots: 0,
        radio: '',
      };
      const goal = team === 'ash'
        ? (role === 'mid' ? 'mid' : siteTarget(site))
        : holdTarget(site, team, role === 'entry' ? 'flank' : role);
      nav.assignRoute(bot, goal);
      bots.push(bot);
    }
  }

  function resetRound(attacker = 'ash') {
    for (const b of bots) scene.remove(b.mesh);
    bots.length = 0;
    const def = attacker === 'ash' ? 'coil' : 'ash';
    spawnTeam(attacker, 4, 'tern_ar');
    spawnTeam(def, 5, 'tern_ar');
  }

  function hitMeshes() {
    return bots.filter((b) => b.alive).flatMap((b) => [b.mesh.userData.torso, b.mesh.userData.head]);
  }

  function applyDamage(bot, amount, head) {
    if (!bot.alive) return { killed: false };
    let dmg = amount;
    if (head && bot.helmet) dmg *= 0.7;
    bot.health -= dmg;
    if (bot.health <= 0) {
      bot.alive = false; bot.health = 0; bot.deaths += 1;
      bot.mesh.visible = false;
      return { killed: true, head, name: bot.name, team: bot.team };
    }
    return { killed: false, head, name: bot.name, team: bot.team };
  }

  function pickFocus(bot, player, effects) {
    let focus = null;
    if (player.state.alive && player.state.team !== bot.team) {
      const d = dist2(bot.mesh.position.x, bot.mesh.position.z, player.state.pos.x, player.state.pos.z);
      if (d < 40 && !effects.blocksSight(bot.mesh.position.x, bot.mesh.position.z, player.state.pos.x, player.state.pos.z)) {
        focus = { x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z, isPlayer: true, d };
      }
    }
    for (const e of bots) {
      if (!e.alive || e.team === bot.team) continue;
      const d = dist2(bot.mesh.position.x, bot.mesh.position.z, e.mesh.position.x, e.mesh.position.z);
      if (d < 36 && (!focus || d < focus.d)
        && !effects.blocksSight(bot.mesh.position.x, bot.mesh.position.z, e.mesh.position.x, e.mesh.position.z)) {
        focus = { x: e.mesh.position.x, y: 1.45, z: e.mesh.position.z, bot: e, d };
      }
    }
    return focus;
  }

  function replan(bot, bomb, attacker) {
    const isAtk = bot.team === attacker;
    if (bomb?.planted) {
      if (isAtk) nav.assignRoute(bot, siteTarget(bomb.site));
      else nav.assignRoute(bot, siteTarget(bomb.site));
      bot.state = isAtk ? 'hold' : 'defuse';
      return;
    }
    if (isAtk) {
      const goal = bot.role === 'mid' ? 'mid' : siteTarget(bot.targetSite);
      nav.assignRoute(bot, goal);
      bot.state = bot.role === 'anchor' ? 'plant' : 'push';
    } else {
      nav.assignRoute(bot, holdTarget(bot.targetSite, bot.team, bot.role === 'entry' ? 'flank' : bot.role));
      bot.state = 'hold';
    }
  }

  function update(dt, player, effects, onBotShot, bomb, attacker = 'ash') {
    for (const b of bots) {
      if (!b.alive) continue;

      // Hearing: investigate gunfire we cannot see
      if (hearing) {
        const heard = hearing.poll(b);
        if (heard && !b.investigate) {
          b.investigate = { x: heard.x, z: heard.z, t: 4 };
          b.radio = `RADIO ${b.name}: Contact sound, checking.`;
          const wp = nav.nearestWaypoint(heard.x, heard.z);
          if (wp) nav.assignRoute(b, wp);
          b.state = 'investigate';
        }
      }
      if (b.investigate) {
        b.investigate.t -= dt;
        if (b.investigate.t <= 0) { b.investigate = null; replan(b, bomb?.state, attacker); }
      }

      // Occasional replan toward plant site when attacking
      b.holdT += dt;
      if (b.holdT > 6 + rng() * 4) {
        b.holdT = 0;
        if (!b.investigate) replan(b, bomb?.state, attacker);
      }

      const focus = pickFocus(b, player, effects);
      let tx, tz;
      if (focus) {
        tx = focus.x; tz = focus.z;
        b.state = 'hunt';
      } else {
        const np = nav.nextPoint(b);
        if (np) { tx = np.x; tz = np.z; }
        else {
          const site = world.sites[b.targetSite];
          tx = site.x; tz = site.z;
        }
      }

      const dx = tx - b.mesh.position.x;
      const dz = tz - b.mesh.position.z;
      const desiredYaw = Math.atan2(-dx, -dz);
      b.yaw += angleDiff(b.yaw, desiredYaw) * Math.min(1, dt * 4.5);

      const speed = focus && focus.d < 10 ? 2.0 : (b.state === 'hold' ? 2.4 : 3.8);
      if (!focus || focus.d > 7.5) {
        b.mesh.position.x += (-Math.sin(b.yaw)) * speed * dt;
        b.mesh.position.z += (-Math.cos(b.yaw)) * speed * dt;
        resolveCollision(b.mesh.position, 0.35, world.colliders);
      }
      b.mesh.rotation.y = b.yaw;

      // Shoot
      b.cooldown -= dt;
      if (focus && b.cooldown <= 0 && focus.d < 34) {
        const def = WEAPONS[b.weaponId] || WEAPONS.tern_ar;
        b.cooldown = 60 / def.rpm * (1.05 + rng() * 0.45);
        b.shots += 1;
        const err = b.aimErr + focus.d * 0.0012 + (focus.d < 8 ? 0 : 0.01);
        const aim = new THREE.Vector3(focus.x - b.mesh.position.x, (focus.y || 1.4) - 1.45, focus.z - b.mesh.position.z).normalize();
        aim.x += (rng() - 0.5) * err;
        aim.y += (rng() - 0.5) * err * 0.45;
        aim.z += (rng() - 0.5) * err;
        aim.normalize();
        const origin = b.mesh.position.clone(); origin.y = 1.45;
        const end = origin.clone().addScaledVector(aim, 55);
        effects.tracer(origin, end, b.team === 'ash' ? 0xffb080 : 0xa0ffe8);
        hearing?.emit('gun', origin.x, origin.z, 26, b.team);
        onBotShot?.(b, origin, aim, def);
        if (rng() < 0.08) b.radio = `RADIO ${b.name}: Engaging!`;
      }
    }
  }

  function alive(team) { return bots.filter((b) => b.alive && b.team === team); }
  function radioLine() {
    const talkers = bots.filter((b) => b.alive && b.radio);
    if (!talkers.length) return '';
    const t = talkers[Math.floor(rng() * talkers.length)];
    const line = t.radio; t.radio = '';
    return line;
  }

  return { bots, resetRound, hitMeshes, applyDamage, update, alive, nav, radioLine, replan };
}
