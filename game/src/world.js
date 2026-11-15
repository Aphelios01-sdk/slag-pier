import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createMaterials } from './materials.js';

const loader = new GLTFLoader();
const glbCache = new Map();

function makeNoiseTexture(w, h, c0, c1, scale = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (Math.sin(x * 0.17 * scale) * Math.cos(y * 0.13 * scale) + Math.sin((x + y) * 0.09) + 3) / 6;
      const i = (y * w + x) * 4;
      img.data[i] = (c0[0] + (c1[0] - c0[0]) * n) | 0;
      img.data[i + 1] = (c0[1] + (c1[1] - c0[1]) * n) | 0;
      img.data[i + 2] = (c0[2] + (c1[2] - c0[2]) * n) | 0;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // grid lines
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  for (let i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
  for (let i = 0; i < h; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#ff7a2e');
  grd.addColorStop(0.45, '#ffb06a');
  grd.addColorStop(0.7, '#ffd0a0');
  grd.addColorStop(1, '#c47848');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


export function loadGlb(url) {
  if (glbCache.has(url)) return Promise.resolve(glbCache.get(url).clone(true));
  return new Promise((resolve, reject) => {
    loader.load(url, (g) => {
      glbCache.set(url, g.scene);
      resolve(g.scene.clone(true));
    }, undefined, reject);
  });
}

function boxMesh(w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.72, metalness: opts.metalness ?? 0.08,
    flatShading: opts.flat ?? false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addCollider(list, x, z, w, d, y0 = 0, h = 3) {
  list.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0, h });
}

export async function createWorld(scene) {
  const colliders = [];
  const shootables = [];
  const coverNodes = [];
  const spawns = { ash: [], coil: [] };
  const sites = {
    A: { name: 'HOPPER', x: -18, z: -16, r: 3.2 },
    B: { name: 'DOCK', x: 20, z: 14, r: 3.2 },
  };

  // Sky dome + lights
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(sky);
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(PALETTE.fog, 42, 95);
  const hemi = new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.shadow, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.7);
  sun.position.set(-28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.00025;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffc8a0, 0.28));
  const fill = new THREE.DirectionalLight(0xffa060, 0.35);
  fill.position.set(22, 12, -10);
  scene.add(fill);

  // Ground slabs — unique pier layout: long pier spine, hopper courtyard west, dock east
  const ground = new THREE.Mesh(new THREE.BoxGeometry(72, 0.4, 56), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.92 }));
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  scene.add(ground);


  // Cobble / tile patches for sites
  // Site pads — replaced after mats init
  let tileA, tileB;

  const mats = createMaterials();
  if (typeof ground !== "undefined" && ground) ground.material = mats.gravel;

  function wall(x, z, w, d, h, mat = mats.concrete) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, h / 2, z);
    scene.add(m);
    addCollider(colliders, x, z, w, d, 0, h);
    shootables.push(m);
    return m;
  }
  function low(x, z, w, d, h = 1.15, mat = mats.concreteDark) {
    const m = wall(x, z, w, d, h, mat);
    coverNodes.push({ x, z, w, d });
    return m;
  }
  function hazardStrip(x, z, w, d, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mats.hazard);
    m.position.set(x, 0.03, z);
    m.rotation.y = rot;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  tileA = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 9), mats.tileA);
  tileA.position.set(sites.A.x, 0.03, sites.A.z); tileA.receiveShadow = true; scene.add(tileA);
  tileB = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 8), mats.tileB);
  tileB.position.set(sites.B.x, 0.03, sites.B.z); tileB.receiveShadow = true; scene.add(tileB);

  // Extra cover stacks + hazard lane paint for readable sightlines
  low(-16, -6, 2.2, 1.2, 1.3, mats.concreteDark);
  low(-8, -2, 3.0, 1.1, 1.2, mats.concreteDark);
  low(6, -2, 2.4, 1.2, 1.25, mats.metal);
  low(18, 6, 2.6, 1.1, 1.2, mats.concreteDark);
  low(-2, 8, 1.4, 3.2, 1.4, mats.brick);
  low(10, 16, 3.5, 1.2, 1.15, mats.concreteDark);
  wall(-14, 6, 1.2, 8, 3.2, mats.brick);
  wall(8, -16, 8, 1.2, 3.0, mats.concrete);
  hazardStrip(-18, -12.5, 6, 0.7);
  hazardStrip(20, 11.2, 7, 0.7);
  hazardStrip(2, 4, 0.7, 10);
  hazardStrip(-6, -16, 8, 0.55);

  // Perimeter shells
  wall(0, -28, 72, 1.2, 5, mats.brick);
  wall(0, 28, 72, 1.2, 4.5, mats.brick);
  wall(-36, 0, 1.2, 56, 5, mats.concrete);
  wall(36, 0, 1.2, 56, 5, mats.concrete);

  // Mid buildings — create lanes (T-junction + pier catwalk), NOT a Dust2 clone
  wall(-10, -8, 14, 3.5, 4.2, mats.concrete);
  wall(-22, 2, 3.5, 16, 4.0, mats.brick);
  wall(6, 6, 12, 3.2, 3.8, mats.concreteDark);
  wall(14, -10, 3.2, 14, 4.5, mats.concrete);
  wall(-4, 14, 10, 3, 3.5, mats.brick);

  // Hopper hall Site A enclosure
  wall(-18, -22, 16, 1.4, 4.2, mats.concrete);
  wall(-26, -16, 1.4, 12, 4.2, mats.concrete);
  wall(-10, -16, 1.4, 8, 3.2, mats.concreteDark);
  low(-18, -13, 4, 1.2, 1.2);

  // Dock Site B — open pier with containers
  wall(26, 18, 12, 1.4, 3.5, mats.metal);
  wall(28, 10, 1.4, 10, 3.5, mats.metal);
  low(16, 14, 3, 1.2, 1.15);

  // Catwalk spine down the pier center
  const spine = boxMesh(3.2, 0.35, 36, PALETTE.metal, { metalness: 0.55, roughness: 0.4 });
  spine.position.set(2, 0.35, 0);
  scene.add(spine);
  low(2, -6, 1.2, 4, 0.9, PALETTE.metal);
  low(2, 8, 1.2, 4, 0.9, PALETTE.metal);

  // Signs
  function sign(text, x, y, z, rotY = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f0ebe3';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 1.1),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
  }
  sign('HOPPER  SITE A', -18, 3.2, -21.2);
  sign('DOCK  SITE B', 20, 2.8, 18.5, Math.PI);
  sign('SLAG PIER', 0, 4.5, -27.2);

  // Props from Blender GLBs
  async function prop(url, x, z, s = 1, rot = 0) {
    try {
      const root = await loadGlb(url);
      root.position.set(x, 0, z);
      root.scale.setScalar(s);
      root.rotation.y = rot;
      root.traverse((c) => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; shootables.push(c); }
      });
      scene.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      addCollider(colliders, x, z, Math.max(0.8, size.x), Math.max(0.8, size.z), 0, Math.max(1, size.y));
      coverNodes.push({ x, z, w: size.x, d: size.z });
    } catch (e) {
      // Fallback box if GLB fails
      low(x, z, 1.2, 1.2, 1.2, PALETTE.wood);
    }
  }

  await Promise.all([
    prop('./assets/crate.glb', -14, -10, 1.1, 0.2),
    prop('./assets/crate.glb', -12, -12, 1.0, -0.4),
    prop('./assets/crate.glb', -17, -9, 0.95, 0.8),
    prop('./assets/crate.glb', 10, 10, 1.15, 0.5),
    prop('./assets/crate.glb', 22, 12, 1.0, -0.3),
    prop('./assets/crate.glb', -6, 16, 1.05, 0.1),
    prop('./assets/barrel.glb', -20, -14, 1.0, 0),
    prop('./assets/barrel.glb', -19, -15.2, 1.0, 0.5),
    prop('./assets/barrel.glb', 18, 12, 1.0, 0.3),
    prop('./assets/barrel.glb', 4, -4, 1.0, -0.2),
    prop('./assets/barrel.glb', 15, 15, 1.0, 0.1),
    prop('./assets/dumpster.glb', 8, 4, 1.0, Math.PI / 2),
    prop('./assets/dumpster.glb', -8, 10, 1.0, 0.2),
    prop('./assets/dumpster.glb', 12, -8, 1.0, -0.4),
    prop('./assets/container.glb', 24, 8, 0.85, Math.PI / 2),
    prop('./assets/container.glb', -28, -4, 0.85, 0),
    prop('./assets/container.glb', 30, 16, 0.85, 0),
  ]);

  // Plant pedestals
  for (const s of Object.values(sites)) {
    const ped = boxMesh(1.6, 0.25, 1.6, 0x2a4a44, { metalness: 0.4, roughness: 0.45 });
    ped.position.set(s.x, 0.12, s.z);
    scene.add(ped);
  }

  // Spawns: ASH (attackers) south ramp, COIL (defenders) north warehouse
  for (let i = 0; i < 5; i++) {
    spawns.ash.push({ x: -6 + i * 2.2, z: 22, yaw: Math.PI });
    spawns.coil.push({ x: -4 + i * 2.0, z: -22, yaw: 0 });
  }

  // Water edge hint east
  const water = boxMesh(8, 0.2, 40, 0x2a4a58, { roughness: 0.25, metalness: 0.3 });
  water.position.set(40, -0.5, 0);
  scene.add(water);

  return { colliders, shootables, coverNodes, spawns, sites, sun };
}

/** AABB player collision resolve on XZ. */
export function resolveCollision(pos, radius, colliders) {
  for (const c of colliders) {
    if (pos.y + 0.2 < c.y0 || pos.y > c.y0 + c.h) continue;
    const nearestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nearestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nearestX;
    const dz = pos.z - nearestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-8) {
        // push out via smallest overlap
        const left = pos.x - c.minX + radius;
        const right = c.maxX + radius - pos.x;
        const near = pos.z - c.minZ + radius;
        const far = c.maxZ + radius - pos.z;
        const m = Math.min(left, right, near, far);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === near) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
  }
  pos.x = Math.max(-34, Math.min(34, pos.x));
  pos.z = Math.max(-26, Math.min(26, pos.z));
}
