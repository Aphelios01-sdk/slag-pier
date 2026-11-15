import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTex(draw, w = 256, h = 256, repeat = [4, 4]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createMaterials() {
  const gravel = canvasTex((g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = ((x * 17) ^ (y * 31)) & 255;
      const v = 70 + (n % 50);
      g.fillStyle = `rgb(${v + 20},${v - 5},${v - 25})`;
      g.fillRect(x, y, 1, 1);
    }
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
  }, 256, 256, [14, 12]);

  const brick = canvasTex((g, w, h) => {
    g.fillStyle = '#8a5a3a'; g.fillRect(0, 0, w, h);
    const bw = 32, bh = 16;
    for (let row = 0; row < h / bh; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh;
        const shade = 120 + ((row * 3 + col * 5) % 40);
        g.fillStyle = `rgb(${shade},${shade - 35},${shade - 55})`;
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
  }, 256, 128, [6, 4]);

  const metal = canvasTex((g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#4a5058'); grd.addColorStop(1, '#2a3038');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
  }, 128, 128, [2, 2]);

  const tile = canvasTex((g, w, h) => {
    g.fillStyle = '#3a6a5e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
    for (let i = 0; i <= h; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) g.fillRect(x + 2, y + 2, 12, 12);
  }, 256, 256, [3, 3]);

  const hazard = canvasTex((g, w, h) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f0a830';
    for (let i = -h; i < w; i += 24) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 + h, h); g.lineTo(i + h, h); g.fill();
    }
  }, 128, 32, [8, 1]);

  const aoLoader = new THREE.TextureLoader();
  let gravelMat = new THREE.MeshStandardMaterial({ map: gravel, roughness: 0.9, metalness: 0.04 });
  aoLoader.load('./assets/ground_ao.png', (ao) => {
    ao.wrapS = ao.wrapT = THREE.RepeatWrapping;
    ao.repeat.set(10, 8);
    gravelMat.aoMap = ao;
    gravelMat.aoMapIntensity = 0.85;
    gravelMat.needsUpdate = true;
  });

  return {
    gravel: gravelMat,
    brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.85, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.78, metalness: 0.05 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.82, metalness: 0.06 }),
    metal: new THREE.MeshStandardMaterial({ map: metal, roughness: 0.4, metalness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.7, metalness: 0.05 }),
    tileA: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.55, metalness: 0.15 }),
    tileB: new THREE.MeshStandardMaterial({ color: 0x2a5a54, roughness: 0.5, metalness: 0.2 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.55, metalness: 0.1 }),
    plantZone: new THREE.MeshStandardMaterial({ color: 0x1ecc7a, emissive: 0x0a6630, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.2 }),
  };
}
