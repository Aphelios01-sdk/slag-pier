export function createHud() {
  const $ = (id) => document.getElementById(id);
  let hitT = 0;
  let flashT = 0;
  let killfeed = [];
  let radio = '';

  function setHealth(h, armor, helm) {
    $('hp').textContent = String(Math.ceil(h));
    $('armor').textContent = `${Math.ceil(armor)}${helm ? '+H' : ''}`;
  }
  function setAmmo(mag, reserve, name) {
    $('ammo-mag').textContent = String(mag);
    $('ammo-reserve').textContent = `/ ${reserve}`;
    $('weapon-name').textContent = name || '';
    $('ammo').classList.toggle('empty', mag <= 0);
  }
  function setCash(c) { $('cash').textContent = `$${c}`; }
  function setScore(ash, coil, round, max, time, phase) {
    $('score-ash').textContent = String(ash);
    $('score-coil').textContent = String(coil);
    const m = Math.floor(Math.max(0, time) / 60);
    const s = Math.floor(Math.max(0, time) % 60);
    $('round-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    let label = `ROUND ${round} OF ${max}`;
    if (phase === 'buy') label = `ROUND ${round} · BUY`;
    if (phase === 'bomb') label = `BOMB PLANTED`;
    if (phase === 'end') label = `END ROUND ${round}`;
    if (phase === 'matchend') label = `MATCH OVER`;
    $('round-label').textContent = label;
  }
  function setNades(n, kit) {
    $('nade-frag').textContent = `3 Frag ${n.frag || 0}`;
    $('nade-flare').textContent = `4 Flare ${n.flare || 0}`;
    $('nade-smoke').textContent = `5 Smoke ${n.smoke || 0}`;
    $('nade-kit').textContent = kit ? 'Kit' : '';
  }
  function hitmarker(head) {
    hitT = 0.12;
    $('hitmarker').classList.add('on');
    if (head) $('hitmarker').classList.add('head');
    else $('hitmarker').classList.remove('head');
  }
  function addKill(text) {
    killfeed.unshift(text);
    killfeed = killfeed.slice(0, 5);
    $('killfeed').innerHTML = killfeed.map((t) => `<div>${t}</div>`).join('');
  }
  function setRadio(t) { radio = t; $('radio').textContent = t; }
  function setProgress(label, t) {
    const p = $('progress');
    if (t <= 0) { p.hidden = true; return; }
    p.hidden = false;
    $('progress-label').textContent = label;
    $('progress-bar').style.width = `${Math.min(100, t * 100)}%`;
  }
  function setFlash(v) {
    flashT = Math.max(flashT, v);
  }
  function setMinimap(player, bots, sites, bomb) {
    const c = $('minimap');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,16,12,0.75)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a5048'; ctx.lineWidth = 2; ctx.stroke();
    const scale = 1.7;
    const px = W / 2 - player.pos.x * scale;
    const pz = H / 2 - player.pos.z * scale;
    // sites
    for (const [id, s] of Object.entries(sites)) {
      const x = W / 2 + (s.x - player.pos.x) * scale;
      const y = H / 2 + (s.z - player.pos.z) * scale;
      ctx.fillStyle = bomb?.site === id ? '#e07038' : '#d8c8a0';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(id, x + 6, y + 3);
    }
    for (const b of bots) {
      if (!b.alive) continue;
      const x = W / 2 + (b.mesh.position.x - player.pos.x) * scale;
      const y = H / 2 + (b.mesh.position.z - player.pos.z) * scale;
      if (x < 8 || y < 8 || x > W - 8 || y > H - 8) continue;
      ctx.fillStyle = b.team === player.team ? '#3ab0a0' : '#e07038';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#f0ebe3';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.fill();
    ctx.restore();
  }
  function showOverlay(title, copy, showBtn = true) {
    $('overlay').hidden = false;
    $('overlay-title').textContent = title;
    $('overlay-copy').textContent = copy;
    $('play').style.display = showBtn ? '' : 'none';
  }
  function hideOverlay() { $('overlay').hidden = true; }
  function showScoreboard(visible, rows, title) {
    const sb = $('scoreboard');
    sb.hidden = !visible;
    if (!visible) return;
    $('sb-title').textContent = title;
    $('sb-body').innerHTML = rows;
  }
  function update(dt) {
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitmarker').classList.remove('on', 'head'); }
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt * 0.55);
      $('flash').style.opacity = String(flashT);
    } else $('flash').style.opacity = '0';
  }
  function onPlay(fn) { $('play').onclick = fn; }

  return {
    setHealth, setAmmo, setCash, setScore, setNades, hitmarker, addKill, setRadio,
    setProgress, setFlash, setMinimap, showOverlay, hideOverlay, showScoreboard, update, onPlay,
  };
}
