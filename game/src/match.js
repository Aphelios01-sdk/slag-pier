/** Round economy, plant/defuse, win conditions. */
export function createMatch() {
  const state = {
    phase: 'warmup', // warmup | buy | live | bomb | end | matchend
    round: 1,
    maxRounds: 12,
    time: 15,
    score: { ash: 0, coil: 0 },
    attacker: 'ash',
    bomb: { planted: false, site: null, timer: 40, defuse: 0, planting: 0, carrier: true },
    winner: null,
    roundWinner: null,
    reason: '',
    buyTime: 15,
    liveTime: 105,
    freeze: false,
  };

  const economy = {
    ash: 800,
    coil: 800,
    player: 800,
    lossAsh: 0,
    lossCoil: 0,
  };

  function startBuy() {
    state.phase = 'buy';
    state.time = state.buyTime;
    state.bomb = { planted: false, site: null, timer: 40, defuse: 0, planting: 0, carrier: state.attacker === 'ash' || true };
    state.roundWinner = null;
    state.reason = '';
    // give buy money already set
  }

  function startLive() {
    state.phase = 'live';
    state.time = state.liveTime;
  }

  function award(winTeam, reason) {
    if (state.phase === 'end' || state.phase === 'matchend') return;
    state.roundWinner = winTeam;
    state.reason = reason;
    state.phase = 'end';
    state.time = 4;
    state.score[winTeam] += 1;
    const lose = winTeam === 'ash' ? 'coil' : 'ash';
    if (winTeam === 'ash') { economy.lossAsh = 0; economy.lossCoil = Math.min(4, economy.lossCoil + 1); }
    else { economy.lossCoil = 0; economy.lossAsh = Math.min(4, economy.lossAsh + 1); }
    const winPay = reason.includes('plant') || reason.includes('Bomb') ? 3500 : 3250;
    const lossPay = 1400 + economy[lose === 'ash' ? 'lossAsh' : 'lossCoil'] * 500;
    if (winTeam === 'ash') { economy.ash += winPay; economy.coil += lossPay; }
    else { economy.coil += winPay; economy.ash += lossPay; }
    // player shares attacker/defender purse
  }

  function payoutPlayer(playerTeam, killMoney) {
    const base = playerTeam === state.roundWinner ? 3250 : (1400 + (playerTeam === 'ash' ? economy.lossAsh : economy.lossCoil) * 500);
    economy.player += base + (killMoney || 0);
  }

  function nextRound() {
    if (state.score.ash >= 7 || state.score.coil >= 7 || state.round >= state.maxRounds) {
      state.phase = 'matchend';
      state.winner = state.score.ash >= state.score.coil ? 'ash' : 'coil';
      if (state.score.ash === state.score.coil) state.winner = 'draw';
      return;
    }
    state.round += 1;
    if (state.round === 7) {
      // sides swap
      state.attacker = state.attacker === 'ash' ? 'coil' : 'ash';
      const tmp = economy.ash; economy.ash = economy.coil; economy.coil = tmp;
    }
    startBuy();
  }

  function update(dt, opts) {
    if (state.phase === 'matchend' || state.phase === 'warmup') return null;
    state.time -= dt;
    if (state.phase === 'buy' && state.time <= 0) startLive();
    if (state.phase === 'live' && state.time <= 0) {
      // time up: defenders win if bomb not planted
      if (!state.bomb.planted) award(state.attacker === 'ash' ? 'coil' : 'ash', 'Time ran out');
    }
    if (state.bomb.planted && (state.phase === 'live' || state.phase === 'bomb')) {
      state.phase = 'bomb';
      state.bomb.timer -= dt;
      if (state.bomb.timer <= 0) {
        award(state.attacker, 'Bomb detonated');
        return 'explode';
      }
    }
    if (state.phase === 'end' && state.time <= 0) nextRound();
    return null;
  }

  function tryPlant(player, sites, dt, holding) {
    if (state.phase !== 'live' || state.bomb.planted) return 0;
    if (player.team !== state.attacker || !player.alive) return 0;
    let near = null;
    for (const [id, s] of Object.entries(sites)) {
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (d < s.r) near = id;
    }
    if (!near || !holding) { state.bomb.planting = 0; return 0; }
    state.bomb.planting += dt;
    if (state.bomb.planting >= 3.2) {
      state.bomb.planted = true;
      state.bomb.site = near;
      state.bomb.timer = 40;
      state.bomb.planting = 0;
      state.phase = 'bomb';
      return 1;
    }
    return state.bomb.planting / 3.2;
  }

  function tryDefuse(player, sites, dt, holding, hasKit) {
    if (!state.bomb.planted || state.phase === 'end') return 0;
    if (player.team === state.attacker || !player.alive) return 0;
    const s = sites[state.bomb.site];
    if (!s) return 0;
    const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
    if (d > s.r || !holding) { state.bomb.defuse = 0; return 0; }
    const need = hasKit ? 5 : 10;
    state.bomb.defuse += dt;
    if (state.bomb.defuse >= need) {
      award(player.team, 'Bomb defused');
      state.bomb.defuse = 0;
      return 1;
    }
    return state.bomb.defuse / need;
  }

  return { state, economy, startBuy, startLive, award, update, tryPlant, tryDefuse, payoutPlayer, nextRound };
}
