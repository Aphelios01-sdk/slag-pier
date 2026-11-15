import { WEAPONS, GRENADES, GEAR } from './weapons.js';

export function createBuyMenu() {
  let open = false;
  const el = document.getElementById('buy');
  const list = document.getElementById('buy-grid');
  const cashEl = document.getElementById('buy-cash');
  const timerEl = document.getElementById('buy-timer');

  function render(loadout, cash, team, timeLeft) {
    if (!el) return;
    cashEl.textContent = `$${cash}`;
    timerEl.textContent = `${Math.max(0, Math.ceil(timeLeft))}s left`;
    const cols = [
      { title: 'SIDEARMS', items: Object.values(WEAPONS).filter((w) => w.slot === 'sidearm') },
      { title: 'CLOSE RANGE', items: Object.values(WEAPONS).filter((w) => w.slot === 'close') },
      { title: 'RIFLES', items: Object.values(WEAPONS).filter((w) => w.slot === 'rifle') },
      { title: 'GEAR', items: Object.values(GEAR) },
      { title: 'GRENADES', items: Object.values(GRENADES) },
    ];
    list.innerHTML = cols.map((c) => {
      const cards = c.items.map((it) => {
        const owned =
          (it.slot && (loadout.primary === it.id || loadout.secondary === it.id)) ||
          (it.id === 'vest' && loadout.armor >= 50 && !loadout.helmet) ||
          (it.id === 'vest_helm' && loadout.helmet) ||
          (it.id === 'kit' && loadout.kit) ||
          (loadout.nades && loadout.nades[it.id] > 0);
        let disabled = '';
        let note = `$${it.price ?? ''}`;
        if (it.team && it.team !== team) { disabled = 'disabled'; note = `${it.team === 'ash' ? 'Ash' : 'Coil'} only`; }
        if (it.price != null && it.price > cash && !owned) { disabled = 'disabled'; note = 'Too expensive'; }
        if (owned) note = 'Owned';
        const stats = it.dmg
          ? `${it.dmg}${it.pellets ? 'x' + it.pellets : ''} dmg · ${it.rpm} rpm`
          : (it.id === 'frag' ? 'Blast up to 9m' : it.id === 'flare' ? 'Blinds facing foes' : it.id === 'smoke' ? '15s sight block' : it.id === 'kit' ? 'Faster defuse' : 'Armor');
        return `<button class="buy-card ${owned ? 'owned' : ''} ${disabled}" data-id="${it.id}" ${disabled ? 'disabled' : ''}>
          <b>${it.name}</b><span class="price">${note}</span><i>${stats}</i></button>`;
      }).join('');
      return `<div class="buy-col"><h3>${c.title}</h3>${cards}</div>`;
    }).join('');
  }

  function setOpen(v) {
    open = v;
    if (el) el.hidden = !v;
  }

  return {
    get open() { return open; },
    setOpen, render,
    onPick(handler) {
      list?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-id]');
        if (!btn || btn.disabled) return;
        handler(btn.getAttribute('data-id'));
      });
    },
  };
}

export function applyPurchase(id, loadout, cash, team, gun) {
  const w = WEAPONS[id];
  if (w) {
    if (w.team && w.team !== team) return cash;
    if (cash < w.price) return cash;
    if (w.slot === 'sidearm') loadout.secondary = id;
    else loadout.primary = id;
    gun.equip(loadout.primary || loadout.secondary);
    return cash - w.price;
  }
  if (id === 'vest' && cash >= 650) { loadout.armor = 100; loadout.helmet = false; return cash - 650; }
  if (id === 'vest_helm' && cash >= 1000) { loadout.armor = 100; loadout.helmet = true; return cash - 1000; }
  if (id === 'kit' && team === 'coil' && cash >= 400) { loadout.kit = true; return cash - 400; }
  if (GRENADES[id]) {
    const g = GRENADES[id];
    if (cash < g.price) return cash;
    if ((loadout.nades[id] || 0) >= g.max) return cash;
    loadout.nades[id] = (loadout.nades[id] || 0) + 1;
    return cash - g.price;
  }
  return cash;
}
