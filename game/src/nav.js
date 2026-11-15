/**
 * Waypoint graph for Slag Pier — attackers push Hopper (A) or Dock (B);
 * defenders rotate mid / site holds. Routes are hand-authored lanes, not Dust2.
 */
export const WAYPOINTS = {
  ashSpawn: { x: 0, z: 22 },
  coilSpawn: { x: 0, z: -22 },
  mid: { x: 2, z: 0 },
  midWest: { x: -10, z: 2 },
  midEast: { x: 12, z: 4 },
  catwalk: { x: 2, z: -6 },
  hopperApproach: { x: -14, z: -8 },
  hopper: { x: -18, z: -16 },
  hopperHold: { x: -12, z: -14 },
  dockApproach: { x: 14, z: 10 },
  dock: { x: 20, z: 14 },
  dockHold: { x: 16, z: 12 },
  alley: { x: -4, z: 12 },
  crateNest: { x: 8, z: 6 },
};

const EDGES = [
  ['ashSpawn', 'alley'], ['ashSpawn', 'crateNest'], ['ashSpawn', 'mid'],
  ['coilSpawn', 'hopperApproach'], ['coilSpawn', 'catwalk'], ['coilSpawn', 'mid'],
  ['mid', 'midWest'], ['mid', 'midEast'], ['mid', 'catwalk'],
  ['midWest', 'hopperApproach'], ['hopperApproach', 'hopper'], ['hopperApproach', 'hopperHold'],
  ['hopper', 'hopperHold'],
  ['midEast', 'dockApproach'], ['dockApproach', 'dock'], ['dockApproach', 'dockHold'],
  ['dock', 'dockHold'], ['crateNest', 'dockApproach'], ['alley', 'midWest'],
  ['catwalk', 'hopperApproach'],
];

const adj = {};
for (const k of Object.keys(WAYPOINTS)) adj[k] = [];
for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }

export function nearestWaypoint(x, z) {
  let best = null, bestD = Infinity;
  for (const [id, p] of Object.entries(WAYPOINTS)) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

export function pathTo(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return fromId ? [fromId] : [];
  const q = [fromId];
  const prev = { [fromId]: null };
  while (q.length) {
    const cur = q.shift();
    if (cur === toId) break;
    for (const n of adj[cur] || []) {
      if (n in prev) continue;
      prev[n] = cur;
      q.push(n);
    }
  }
  if (!(toId in prev)) return [fromId, toId];
  const out = [];
  for (let c = toId; c; c = prev[c]) out.push(c);
  out.reverse();
  return out;
}

export function siteTarget(siteId) {
  return siteId === 'B' ? 'dock' : 'hopper';
}

export function holdTarget(siteId, team, role) {
  if (role === 'anchor') return siteId === 'B' ? 'dockHold' : 'hopperHold';
  if (role === 'mid') return 'mid';
  if (role === 'flank') return siteId === 'B' ? 'dockApproach' : 'hopperApproach';
  return team === 'ash' ? 'mid' : (siteId === 'B' ? 'dockHold' : 'hopperHold');
}

export function createNavigator() {
  return {
    nearestWaypoint, pathTo, siteTarget, holdTarget, WAYPOINTS,
    nextPoint(bot) {
      if (!bot.route || bot.routeIndex >= bot.route.length) return null;
      const id = bot.route[bot.routeIndex];
      const p = WAYPOINTS[id];
      if (!p) return null;
      const d = Math.hypot(bot.mesh.position.x - p.x, bot.mesh.position.z - p.z);
      if (d < 1.4) {
        bot.routeIndex += 1;
        return this.nextPoint(bot);
      }
      return p;
    },
    assignRoute(bot, goalId) {
      const from = nearestWaypoint(bot.mesh.position.x, bot.mesh.position.z);
      bot.route = pathTo(from, goalId);
      bot.routeIndex = 0;
      bot.goal = goalId;
    },
  };
}
