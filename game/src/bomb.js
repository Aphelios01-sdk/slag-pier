/**
 * Plant / defuse objective for Slag Pier.
 * Attackers arm a charge on SITE A (Hopper) or SITE B (Dock); defenders defuse.
 */
import * as THREE from 'three';

const PLANT_TIME = 3.2;
const DEFUSE_TIME = 10;
const DEFUSE_KIT = 5;
const FUSE = 40;

export function createBomb(scene, sites) {
  const state = {
    planted: false,
    site: null,
    timer: FUSE,
    planting: 0,
    defusing: 0,
    carrier: true,
  };

  const markers = {};
  const rings = {};
  for (const [id, s] of Object.entries(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r * 0.85, s.r, 48),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.06, s.z);
    scene.add(ring);
    rings[id] = ring;

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x145a40, emissive: 0x0a3a28, emissiveIntensity: 0.4, roughness: 0.5 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.x, 0.04, s.z);
    scene.add(pad);

    // Standing site placard
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1a14'; ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 144);
    ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 64px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(`SITE ${id}`, 256, 70);
    ctx.fillStyle = '#d8f5e6'; ctx.font = '28px system-ui,sans-serif';
    ctx.fillText(`${s.name} · PLANT ZONE`, 256, 120);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    board.position.set(s.x, 2.4, s.z + (id === 'A' ? 3.2 : -3.2));
    scene.add(board);
    markers[id] = { ring, pad, board };
  }

  let chargeMesh = null;
  function attachCharge(mesh) {
    chargeMesh = mesh;
    if (chargeMesh) chargeMesh.visible = false;
  }

  function reset() {
    state.planted = false;
    state.site = null;
    state.timer = FUSE;
    state.planting = 0;
    state.defusing = 0;
    if (chargeMesh) chargeMesh.visible = false;
    for (const id of Object.keys(rings)) {
      rings[id].material.color.setHex(0x2ecc71);
      rings[id].material.opacity = 0.45;
    }
  }

  function nearSite(pos) {
    for (const [id, s] of Object.entries(sites)) {
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < s.r) return id;
    }
    return null;
  }

  function tryPlant(player, dt, holding, isAttacker) {
    if (state.planted || !isAttacker || !player.alive) { state.planting = 0; return 0; }
    const id = nearSite(player.pos);
    if (!id || !holding) { state.planting = 0; return 0; }
    state.planting += dt;
    if (state.planting >= PLANT_TIME) {
      state.planted = true;
      state.site = id;
      state.timer = FUSE;
      state.planting = 0;
      const s = sites[id];
      if (chargeMesh) {
        chargeMesh.position.set(s.x, 0.35, s.z);
        chargeMesh.visible = true;
        chargeMesh.scale.setScalar(1.8);
      }
      rings[id].material.color.setHex(0xe07038);
      rings[id].material.opacity = 0.7;
      return 1;
    }
    return state.planting / PLANT_TIME;
  }

  function tryDefuse(player, dt, holding, isDefender, hasKit) {
    if (!state.planted || !isDefender || !player.alive) { state.defusing = 0; return 0; }
    const s = sites[state.site];
    if (!s || Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > s.r || !holding) {
      state.defusing = 0; return 0;
    }
    const need = hasKit ? DEFUSE_KIT : DEFUSE_TIME;
    state.defusing += dt;
    if (state.defusing >= need) {
      state.defusing = 0;
      return 1;
    }
    return state.defusing / need;
  }

  function tick(dt) {
    if (!state.planted) return null;
    state.timer -= dt;
    if (state.timer <= 0) return 'explode';
    return null;
  }

  return { state, reset, tryPlant, tryDefuse, tick, attachCharge, nearSite, PLANT_TIME, sites };
}
