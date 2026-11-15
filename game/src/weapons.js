/** Original loadout catalog — not Valve names. Prices in match cash. */
export const WEAPONS = {
  spar_p9: {
    id: 'spar_p9', slot: 'sidearm', name: 'Spar P9', price: 200,
    dmg: 30, headMul: 3.2, rpm: 380, mag: 13, reserve: 52, auto: false,
    spread: 0.012, moveSpread: 0.045, recoil: [0.018, 0.012], range: 60,
    reload: 1.6, kind: 'pistol',
  },
  quill45: {
    id: 'quill45', slot: 'sidearm', name: 'Quill .45', price: 700,
    dmg: 52, headMul: 2.6, rpm: 160, mag: 7, reserve: 35, auto: false,
    spread: 0.018, moveSpread: 0.06, recoil: [0.04, 0.02], range: 50,
    reload: 2.0, kind: 'pistol',
  },
  gadfly: {
    id: 'gadfly', slot: 'close', name: 'Gadfly SMG', price: 1200,
    dmg: 24, headMul: 2.8, rpm: 780, mag: 30, reserve: 120, auto: true,
    spread: 0.02, moveSpread: 0.05, recoil: [0.014, 0.02], range: 55,
    reload: 2.1, kind: 'smg',
  },
  breach12: {
    id: 'breach12', slot: 'close', name: 'Breach 12', price: 1500,
    dmg: 18, pellets: 8, headMul: 1.6, rpm: 70, mag: 6, reserve: 32, auto: false,
    spread: 0.06, moveSpread: 0.1, recoil: [0.06, 0.03], range: 28,
    reload: 2.8, kind: 'shotgun',
  },
  tern_ar: {
    id: 'tern_ar', slot: 'rifle', name: 'Tern AR', price: 2700,
    dmg: 34, headMul: 3.4, rpm: 600, mag: 30, reserve: 90, auto: true,
    spread: 0.01, moveSpread: 0.055, recoil: [0.022, 0.016], range: 90,
    reload: 2.4, kind: 'rifle',
  },
  pike_r4: {
    id: 'pike_r4', slot: 'rifle', name: 'Pike R4', price: 3100,
    dmg: 36, headMul: 3.5, rpm: 666, mag: 25, reserve: 75, auto: true,
    spread: 0.009, moveSpread: 0.05, recoil: [0.02, 0.018], range: 95,
    reload: 2.5, kind: 'rifle', team: 'ash',
  },
  mastiff: {
    id: 'mastiff', slot: 'rifle', name: 'Mastiff DMR', price: 4750,
    dmg: 68, headMul: 3.8, rpm: 200, mag: 10, reserve: 30, auto: false,
    spread: 0.004, moveSpread: 0.07, recoil: [0.045, 0.015], range: 110,
    reload: 2.9, kind: 'rifle',
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag', price: 300, key: '3', max: 1 },
  flare: { id: 'flare', name: 'Flare', price: 200, key: '4', max: 2 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, key: '5', max: 1 },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar vest', price: 650 },
  vest_helm: { id: 'vest_helm', name: 'Vest + helmet', price: 1000 },
  kit: { id: 'kit', name: 'Defuse kit', price: 400, team: 'coil' },
};

export const DEFAULT_LOADOUT = {
  primary: null,
  secondary: 'spar_p9',
  armor: 0,
  helmet: false,
  kit: false,
  nades: { frag: 0, flare: 0, smoke: 0 },
};
