/**
 * Sound event bus: gunshots and footsteps alert nearby bots that cannot see the source.
 */
export function createHearing() {
  const events = [];

  function emit(kind, x, z, radius = 22, team = null) {
    events.push({ kind, x, z, radius, team, t: 0.9 });
  }

  function update(dt) {
    for (let i = events.length - 1; i >= 0; i--) {
      events[i].t -= dt;
      if (events[i].t <= 0) events.splice(i, 1);
    }
  }

  function poll(bot) {
    let best = null;
    for (const e of events) {
      if (e.team && e.team === bot.team) continue;
      const d = Math.hypot(bot.mesh.position.x - e.x, bot.mesh.position.z - e.z);
      if (d <= e.radius && (!best || d < best.d)) best = { ...e, d };
    }
    return best;
  }

  return { emit, update, poll };
}
