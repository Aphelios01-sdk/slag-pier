/**
 * Slag Pier — round-based tactical FPS (three.js 0.187).
 * Fixed-step sim at 60 Hz; render at display rate. Original map/art/names.
 */
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createViewmodel } from './viewmodel.js';
import { createGun } from './gun.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createMatch } from './match.js';
import { createBuyMenu, applyPurchase } from './buy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { WEAPONS, DEFAULT_LOADOUT } from './weapons.js';
import { mulberry32, dist2 } from './util.js';
import { createBomb } from './bomb.js';
import { createHearing } from './hearing.js';
import { createGrenades } from './grenade.js';
import { createPostfx } from './postfx.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 160);

const audio = createAudio();
const hud = createHud();
const match = createMatch();
const buy = createBuyMenu();
const effects = createEffects(scene);
const viewmodel = createViewmodel(camera);
const gun = createGun(audio, effects, viewmodel);
const input = createInput(renderer.domElement, onLock);
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

let world, player, bots, bomb, grenades, postfx;
let loadout = structuredClone(DEFAULT_LOADOUT);
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let plantProgress = 0;
let activeSlot = 'primary';
let killMoney = 0;
let stats = { kills: 0, assists: 0, deaths: 0, hs: 0, dmg: 0, shots: 0 };
let chargeMesh = null;
let nadeCooldown = 0;
let fireHeld = false;
let shotReadyFrames = 0;

function onLock(locked) {
  if (locked) {
    hud.hideOverlay();
    if (!started) beginMatch();
  } else if (started && match.state.phase !== 'matchend' && !shot) {
    hud.showOverlay('Paused', 'Click to resume. B opens requisition in buy time.');
  }
}

async function boot() {
  world = await createWorld(scene);
  player = createPlayer(world.colliders);
  const hearing = createHearing();
  window.__hearing = hearing;
  bots = createBots(scene, world, random, hearing);
  gun.equip('spar_p9');
  loadout.secondary = 'spar_p9';
  bomb = createBomb(scene, world.sites);
  grenades = createGrenades(scene, effects, audio);
  postfx = createPostfx(renderer, scene, camera);

  // charge prop
  try {
    const { loadGlb } = await import('./world.js');
    chargeMesh = await loadGlb('./assets/charge.glb');
    chargeMesh.visible = false;
    scene.add(chargeMesh);
    bomb.attachCharge(chargeMesh);
  } catch {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, metalness: 0.45, roughness: 0.35, emissive: 0x0a4020, emissiveIntensity: 0.3 });
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.38, 12), mat);
    a.position.set(-0.14, 0.2, 0); g.add(a);
    const b = a.clone(); b.position.x = 0.14; g.add(b);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6 }));
    pad.position.y = 0.42; g.add(pad);
    chargeMesh = g; scene.add(chargeMesh);
    bomb.attachCharge(chargeMesh);
  }

  buy.onPick((id) => {
    if (match.state.phase !== 'buy') return;
    const before = match.economy.player;
    match.economy.player = applyPurchase(id, loadout, match.economy.player, player.state.team, gun);
    if (match.economy.player !== before) audio.buy();
    syncLoadoutToPlayer();
    refreshBuy();
  });

  hud.onPlay(() => {
    if (shot) return;
    audio.resume();
    input.requestLock();
  });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    postfx?.resize(innerWidth, innerHeight);
  });

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.code === 'KeyB' && match.state.phase === 'buy') {
      buy.setOpen(!buy.open);
      refreshBuy();
    }
    if (e.code === 'KeyR') gun.tryReload();
    if (e.code === 'Digit1' && loadout.primary) { gun.equip(loadout.primary); activeSlot = 'primary'; }
    if (e.code === 'Digit2') { gun.equip(loadout.secondary); activeSlot = 'secondary'; }
    if (e.code === 'Digit3') throwNade('frag');
    if (e.code === 'Digit4') throwNade('flare');
    if (e.code === 'Digit5') throwNade('smoke');
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Enter' && match.state.phase === 'matchend') restartMatch();
  });

  if (shot) await setupShot();
  else hud.showOverlay('Slag Pier', '5v5 plant/defuse on an industrial pier. ASH attacks, COIL holds. Click to play.');

  requestAnimationFrame(frame);
}

function syncLoadoutToPlayer() {
  player.state.armor = loadout.armor;
  player.state.helmet = loadout.helmet;
  const id = (activeSlot === 'primary' && loadout.primary) ? loadout.primary : loadout.secondary;
  if (gun.state.id !== id) gun.equip(id);
}

function refreshBuy() {
  buy.render(loadout, match.economy.player, player.state.team, match.state.time);
  hud.setCash(match.economy.player);
  hud.setNades(loadout.nades, loadout.kit);
}

function beginMatch() {
  started = true;
  match.economy.player = 800;
  match.state.round = 1;
  match.state.score.ash = 0;
  match.state.score.coil = 0;
  match.state.attacker = 'ash';
  player.state.team = 'ash';
  startRound();
}

function restartMatch() {
  stats = { kills: 0, assists: 0, deaths: 0, hs: 0, dmg: 0, shots: 0 };
  beginMatch();
  hud.showScoreboard(false);
  input.requestLock();
}

function startRound() {
  killMoney = 0;
  loadout = structuredClone(DEFAULT_LOADOUT);
  loadout.secondary = 'spar_p9';
  match.economy.player = Math.min(16000, match.economy.player);
  // spawn
  const team = player.state.team;
  const spots = world.spawns[team];
  player.spawnAt(spots[0], team);
  player.state.armor = 0;
  player.state.helmet = false;
  gun.equip('spar_p9');
  bots.resetRound(match.state.attacker);
  if (chargeMesh) chargeMesh.visible = false;
  bomb?.reset();
  match.startBuy();
  buy.setOpen(true);
  refreshBuy();
  audio.round();
  hud.setRadio(`RADIO Round ${match.state.round} — ${match.state.attacker === player.state.team ? 'You attack' : 'You defend'}`);
}

function throwNade(type) {
  if (nadeCooldown > 0 || match.state.phase === 'buy') return;
  if (!loadout.nades[type]) return;
  loadout.nades[type] -= 1;
  nadeCooldown = 0.8;
  hud.setNades(loadout.nades, loadout.kit);
  camera.getWorldDirection(tmpV);
  const origin = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(tmpV, 0.6);
  origin.y -= 0.15;
  grenades.throwOne(type, origin, tmpV);
  window.__hearing?.emit('nade', origin.x, origin.z, 18, player.state.team);
}

function hitTest(origin, dir, range) {
  raycaster.set(origin, dir);
  raycaster.far = range;
  const targets = bots.hitMeshes().concat(world.shootables);
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0] || null;
}

function onKill(name, weaponName, head, team) {
  const tag = head ? ' (HS)' : '';
  hud.addKill(`You [${weaponName}] ${name}${tag}`);
  stats.kills += 1;
  if (head) stats.hs += 1;
  killMoney += head ? 400 : 300;
  audio.headshot();
}

function processPlayerShot(shotResult) {
  if (!shotResult) return;
  player.state.pitch += shotResult.recoil.x;
  player.state.yaw += shotResult.recoil.y;
  stats.shots += 1;
  for (const hit of shotResult.results) {
    const obj = hit.object;
    const head = obj.name === 'head';
    // find bot
    const bot = bots.bots.find((b) => b.mesh.userData.head === obj || b.mesh.userData.torso === obj);
    if (!bot || bot.team === player.state.team) continue;
    const dmg = shotResult.def.dmg * (head ? shotResult.def.headMul : 1);
    const res = bots.applyDamage(bot, dmg, head);
    stats.dmg += dmg;
    hud.hitmarker(head);
    audio.hit();
    if (res.killed) onKill(bot.name, shotResult.def.name, head, bot.team);
  }
}

function processBotShots() {
  // handled in bots.update callback
}

function checkElim() {
  if (match.state.phase !== 'live' && match.state.phase !== 'bomb') return;
  const ashAlive = bots.alive('ash').length + (player.state.team === 'ash' && player.state.alive ? 1 : 0);
  const coilAlive = bots.alive('coil').length + (player.state.team === 'coil' && player.state.alive ? 1 : 0);
  if (ashAlive === 0) match.award('coil', 'ASH eliminated');
  else if (coilAlive === 0) match.award('ash', 'COIL eliminated');
}

function sim(dt) {
  if (frozen) return;
  gun.update(dt);
  effects.update(dt);
  window.__hearing?.update(dt);
  grenades?.update(dt,
    (x, z) => {
      if (player.state.alive && dist2(player.state.pos.x, player.state.pos.z, x, z) < 9) {
        player.applyDamage(55 * (1 - dist2(player.state.pos.x, player.state.pos.z, x, z) / 9), false);
      }
      for (const b of bots.bots) {
        if (!b.alive) continue;
        const d = dist2(b.mesh.position.x, b.mesh.position.z, x, z);
        if (d < 9) {
          const res = bots.applyDamage(b, 85 * (1 - d / 9), false);
          if (res.killed) onKill(b.name, 'Frag', false, b.team);
        }
      }
    },
    (x, z) => {
      const look = new THREE.Vector3();
      camera.getWorldDirection(look);
      hud.setFlash(effects.flashBang(x, z, player.state.pos, look));
      for (const b of bots.bots) {
        if (b.alive && dist2(b.mesh.position.x, b.mesh.position.z, x, z) < 12) b.cooldown += 2.8;
      }
    },
    () => {},
  );
  hud.update(dt);
  const radio = bots?.radioLine?.();
  if (radio) hud.setRadio(radio);
  nadeCooldown = Math.max(0, nadeCooldown - dt);

  if (!started) return;

  const phaseBefore = match.state.phase;
  const boom = match.update(dt);
  if (boom === 'explode') audio.explode();

  if (match.state.phase === 'buy') {
    refreshBuy();
  } else if (buy.open) buy.setOpen(false);

  if (match.state.phase === 'end' && phaseBefore !== 'end') {
    match.payoutPlayer(player.state.team, killMoney);
    hud.setRadio(`RADIO ${match.state.roundWinner === player.state.team ? 'Round won' : 'Round lost'} — ${match.state.reason}`);
    if (!player.state.alive) stats.deaths += 1;
  }

  if (match.state.phase === 'buy' && phaseBefore === 'end') {
    // sides / attacker may have swapped inside nextRound
    if (match.state.round === 7) {
      player.state.team = match.state.attacker; // after swap attacker flipped; player stays ash by name but roles flip via attacker flag
    }
    respawnForBuy();
  }

  if (started && (match.state.phase === 'live' || match.state.phase === 'bomb' || match.state.phase === 'buy')) {
    if (match.state.phase !== 'buy') {
      player.update(dt, input, camera);
      viewmodel.update(dt, player.moving());
      bots.update(dt, player, effects, (bot, origin, aim, def) => {
        // bot bullet vs player
        raycaster.set(origin, aim);
        raycaster.far = def.range;
        // simple player hit capsule
        if (!player.state.alive) return;
        const toPlayer = player.state.pos.clone().sub(origin);
        const dist = toPlayer.length();
        if (dist > def.range) return;
        const dir = toPlayer.clone().normalize();
        if (dir.dot(aim) < 0.992) return;
        if (effects.blocksSight(origin.x, origin.z, player.state.pos.x, player.state.pos.z)) return;
        const head = Math.abs((origin.y + aim.y * dist) - player.state.pos.y) < 0.2;
        const dealt = player.applyDamage(def.dmg * (head ? 2.5 : 1) * 0.45, head);
        if (dealt && !player.state.alive) {
          stats.deaths += 1;
          hud.addKill(`${bot.name} [${def.name}] You`);
          hud.setRadio('RADIO You are down — spectating');
        }
      }, bomb, match.state.attacker);
      checkElim();

      // plant / defuse via bomb.js
      const holding = input.pressed('KeyE');
      const isAtk = player.state.team === match.state.attacker;
      if (holding && player.state.alive) {
        const pp = bomb.tryPlant(player.state, dt, true, isAtk);
        if (pp === 1) {
          audio.plant();
          match.state.phase = 'bomb';
          hud.setRadio(`RADIO Charge planted — SITE ${bomb.state.site} (${world.sites[bomb.state.site].name} PLANT ZONE)`);
        } else if (pp > 0) hud.setProgress(`Arming charge — SITE ${bomb.nearSite(player.state.pos) || ''} PLANT ZONE`, pp);
        else {
          const dp = bomb.tryDefuse(player.state, dt, true, !isAtk, loadout.kit);
          if (dp === 1) {
            audio.defuse();
            match.award(player.state.team, 'Bomb defused');
            bomb.reset();
            hud.setRadio('RADIO Charge defused — round secured');
          } else if (dp > 0) hud.setProgress('Defusing charge', dp);
          else hud.setProgress('', 0);
        }
      } else {
        bomb.state.planting = 0;
        bomb.state.defusing = 0;
        hud.setProgress('', 0);
      }
      const boom = bomb.tick(dt);
      if (boom === 'explode') {
        audio.explode();
        match.award(match.state.attacker, 'Bomb detonated');
        bomb.reset();
      }
      if (bomb.state.planted) {
        match.state.phase = 'bomb';
        match.state.time = bomb.state.timer;
        // keep match.bomb.planted false so match.update does not double-tick the fuse
        match.state.bomb.site = bomb.state.site;
      }

      // fire
      if (player.state.alive && input.mouse.down && !buy.open) {
        const edge = !fireHeld;
        fireHeld = true;
        if (gun.def.auto || edge) {
          const result = gun.fire(camera, player.moving(), player.state.crouch, hitTest);
          processPlayerShot(result);
          if (result) window.__hearing?.emit('gun', player.state.pos.x, player.state.pos.z, 28, player.state.team);
        }
      } else {
        fireHeld = false;
      }
    } else {
      // buy phase: still allow look
      player.update(dt, input, camera);
      viewmodel.update(dt, false);
    }
  }

  // HUD sync
  hud.setHealth(player.state.health, player.state.armor, player.state.helmet);
  hud.setAmmo(gun.state.mag, gun.state.reserve, gun.def.name);
  hud.setCash(match.economy.player);
  hud.setScore(match.state.score.ash, match.state.score.coil, match.state.round, match.state.maxRounds, match.state.time, match.state.phase);
  hud.setNades(loadout.nades, loadout.kit);
  hud.setMinimap(player.state, bots.bots, world.sites, match.state.bomb);

  if (match.state.phase === 'matchend') {
    const win = match.state.winner === player.state.team;
    const title = win ? 'VICTORY' : (match.state.winner === 'draw' ? 'DRAW' : 'DEFEAT');
    const rows = buildScoreboardRows();
    hud.showScoreboard(true, rows, `${title} · Slag Pier · ${match.state.score.ash} : ${match.state.score.coil} · Enter for a new match.`);
    buy.setOpen(false);
  }

}

function respawnForBuy() {
  killMoney = 0;
  const team = player.state.team;
  player.spawnAt(world.spawns[team][0], team);
  loadout = structuredClone(DEFAULT_LOADOUT);
  loadout.secondary = 'spar_p9';
  loadout.armor = 0;
  loadout.helmet = false;
  loadout.kit = false;
  gun.equip('spar_p9');
  activeSlot = 'secondary';
  bots.resetRound(match.state.attacker);
  if (chargeMesh) chargeMesh.visible = false;
  bomb?.reset();
  buy.setOpen(true);
  refreshBuy();
  hud.showScoreboard(false);
  audio.round();
}

function buildScoreboardRows() {
  const all = [
    { name: 'You', team: player.state.team, ...stats, cash: match.economy.player },
    ...bots.bots.map((b) => ({
      name: b.name, team: b.team, kills: b.kills, assists: b.assists, deaths: b.deaths,
      hs: b.shots ? Math.round((b.hs / Math.max(1, b.kills)) * 100) : 0,
      dmg: Math.round(b.dmg), cash: 2000 + b.kills * 300,
    })),
  ];
  const side = (t) => all.filter((r) => r.team === t).sort((a, b) => b.kills - a.kills);
  function table(team, label, color) {
    const rows = side(team).map((r) => `<tr><td>${r.name}</td><td>${r.kills||0}</td><td>${r.assists||0}</td><td>${r.deaths||0}</td><td>${r.hs||0}%</td><td>${r.dmg||0}</td><td>$${r.cash||0}</td></tr>`).join('');
    return `<div class="sb-team"><h4 style="color:${color}">${label}</h4>
      <table><thead><tr><th></th><th>K</th><th>A</th><th>D</th><th>HS</th><th>DMG</th><th>Cash</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return table('ash', `ASH (${match.state.score.ash})`, '#e07038') + table('coil', `COIL (${match.state.score.coil})`, '#3ab0a0');
}

async function setupShot() {
  started = true;
  frozen = false;
  match.economy.player = 4050;
  match.state.score.ash = 3;
  match.state.score.coil = 2;
  match.state.round = 4;
  player.state.team = 'ash';
  loadout.primary = 'tern_ar';
  loadout.armor = 100;
  loadout.helmet = true;
  loadout.nades = { frag: 1, flare: 2, smoke: 1 };
  gun.equip('tern_ar');
  await viewmodel.setWeapon('tern_ar');
  bots.resetRound('ash');
  if (shot === 'start') {
    match.state.phase = 'buy';
    match.state.time = 5;
    player.spawnAt({ x: 2, z: 10, yaw: Math.PI * 1.05 }, 'ash');
    buy.setOpen(true);
    refreshBuy();
    player.state.yaw = Math.PI * 1.05;
    player.state.pitch = -0.08;
    camera.position.copy(player.state.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
  } else if (shot === 'play') {
    match.state.phase = 'live';
    match.state.time = 82;
    // Look into Hopper SITE A plant zone with enemies + smoke + cover
    player.spawnAt({ x: -14, z: -7, yaw: Math.PI + 0.15 }, 'ash');
    player.state.pitch = -0.05;
    camera.position.copy(player.state.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
    const enemy = bots.bots.find((b) => b.team === 'coil');
    if (enemy) {
      enemy.mesh.position.set(-18, 0, -15.5);
      enemy.mesh.rotation.y = 0.3;
      enemy.mesh.visible = true;
    }
    const enemy2 = bots.bots.filter((b) => b.team === 'coil')[1];
    if (enemy2) { enemy2.mesh.position.set(-15, 0, -18); enemy2.mesh.rotation.y = -0.2; }
    const ally = bots.bots.find((b) => b.team === 'ash');
    if (ally) { ally.mesh.position.set(-10, 0, -11); ally.mesh.rotation.y = Math.PI; }
    effects.smokeCloud(-24, -18);
    hud.addKill('Flint [Gadfly SMG] Reef');
    hud.setRadio('RADIO Flint: Contact at Hopper SITE A, rotating.');
    await viewmodel.setWeapon('tern_ar');
  } else if (shot === 'plant') {
    match.state.phase = 'bomb';
    match.state.time = 35;
    bomb.state.planted = true;
    bomb.state.site = 'B';
    bomb.state.timer = 35;
    player.spawnAt({ x: 20, z: 11.8, yaw: 0 }, 'ash');
    player.state.pitch = -0.48;
    camera.position.set(20, 1.65, 11.8);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = 0;
    camera.rotation.x = -0.48;
    if (chargeMesh) {
      chargeMesh.position.set(20, 0.4, 14);
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(2.4);
    }
    hud.setProgress('SITE B DOCK — Arming the charge', 0.55);
    hud.setRadio('RADIO SITE B IS THE TARGET — hold the plant zone');
    gun.equip('breach12');
    await viewmodel.setWeapon('breach12');
  } else {
    // end
    match.state.phase = 'matchend';
    match.state.score.ash = 7;
    match.state.score.coil = 5;
    match.state.winner = 'ash';
    stats = { kills: 10, assists: 3, deaths: 7, hs: 50, dmg: 1049, shots: 40 };
    player.spawnAt({ x: 12, z: 8, yaw: -0.8 }, 'ash');
    player.state.pitch = -0.05;
    camera.position.copy(player.state.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
    bots.resetRound('ash');
  }
  player.state.health = 100;
  player.state.armor = 100;
  player.state.helmet = true;
  player.state.alive = true;
  hud.hideOverlay();
  for (let i = 0; i < 3; i++) sim(FIXED_STEP);
  // Re-assert shot framing after sim (sim can move camera / clear progress)
  if (shot === 'play') {
    player.spawnAt({ x: -14, z: -7, yaw: Math.PI + 0.15 }, 'ash');
    player.state.pitch = -0.05;
    await viewmodel.setWeapon('tern_ar');
    gun.equip('tern_ar');
    const enemy = bots.bots.find((b) => b.team === 'coil');
    if (enemy) { enemy.mesh.position.set(-18, 0, -15); enemy.mesh.visible = true; }
    camera.position.copy(player.state.pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
    camera.getWorldPosition(tmpV);
    camera.getWorldDirection(tmpV2);
    effects.tracer(tmpV.clone().addScaledVector(tmpV2, 1.2), tmpV.clone().addScaledVector(tmpV2, 16), 0xffe0a0);
    hud.setRadio('RADIO Flint: Contact at Hopper SITE A, rotating.');
  }
  if (shot === 'plant') {
    camera.position.set(18.5, 1.85, 11.2);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -0.25;
    camera.rotation.x = -0.28;
    if (chargeMesh) {
      chargeMesh.position.set(20, 0.42, 14);
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(2.5);
    }
    bomb.state.planted = true; bomb.state.site = 'B'; bomb.state.timer = 35;
    await viewmodel.setWeapon('breach12');
    gun.equip('breach12');
    hud.setProgress('SITE B / PLANT ZONE — Arming the charge', 0.58);
    hud.setRadio('RADIO SITE B IS THE TARGET');
  }
  if (shot === 'start') {
    buy.setOpen(true);
    refreshBuy();
  }
  hud.setHealth(100, 100, true);
  hud.setAmmo(gun.state.mag, gun.state.reserve, gun.def.name);
  hud.setCash(match.economy.player);
  hud.setScore(match.state.score.ash, match.state.score.coil, match.state.round, 12, match.state.time, match.state.phase);
  hud.setNades(loadout.nades, loadout.kit);
  if (shot === 'end' || shot === 'matchend') {
    match.state.phase = 'matchend';
    const rows = buildScoreboardRows();
    hud.showScoreboard(true, rows, `VICTORY · Slag Pier · 7 : 5 · Enter for a new match.`);
  }
  frozen = true;
  window.__shotReady = false;
  shotReadyFrames = 0;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    while (accumulator >= FIXED_STEP) {
      sim(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
  } else {
    hud.setMinimap(player.state, bots.bots, world.sites, match.state.bomb);
  }
  if (postfx) postfx.render(); else renderer.render(scene, camera);
  if (shot && frozen) {
    shotReadyFrames += 1;
    if (shotReadyFrames > 2) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#fff;padding:24px">Boot failed: ${e}</pre>`;
});
