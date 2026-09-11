(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('game-canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || typeof Path2D === 'undefined') {
    byId('fatal-error').hidden = false;
    byId('fatal-error').textContent = '当前浏览器不支持游戏画布，请用较新的 Chrome、Edge、Firefox 或 Safari 打开此文件。';
    return;
  }

  const keyboard = new Controls.Keyboard(window);
  const audio = new Soundtrack.Player();
  const effects = new Artwork.Effects();
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dialogs = { help: byId('help-dialog'), pause: byId('pause-dialog'), result: byId('result-dialog'), settings: byId('settings-dialog'), online: byId('online-dialog') };
  let online = null;
  let renderFrom = null;
  let stateArrived = 0;
  let localPausePending = false;
  let pendingVote = null;
  let match = null;
  let currentMode = 'solo';
  let selectedDifficulty = 'medium';
  let currentMap = 'garden';
  let introCue = null;
  let introAnimations = [];
  let visualTime = 0;
  let accumulator = 0;
  let previousTime = 0;
  let wasPlayingBeforeHelp = false;
  let wasPlayingBeforeSettings = false;
  let resultShown = false;
  let lastAnnouncement = '';
  let lastHud = '';

  function announce(text) {
    if (text === lastAnnouncement) return;
    lastAnnouncement = text;
    byId('announcer').textContent = text;
  }

  function updateSoundButton() {
    byId('sound-icon').setAttribute('href', audio.enabled ? '#icon-sound' : '#icon-muted');
    byId('sound-toggle').setAttribute('aria-label', audio.enabled ? '关闭声音' : '开启声音');
    byId('sound-toggle').setAttribute('aria-pressed', String(!audio.enabled));
    byId('sound-toggle').title = audio.enabled ? '关闭声音' : '开启声音';
  }

  try { audio.enabled = localStorage.getItem('lulu-sound') !== 'off'; } catch { /* file:// 的隐私存储限制不影响游玩。 */ }
  updateSoundButton();

  try {
    const saved = localStorage.getItem('lulu-difficulty');
    if (Object.hasOwn(Battle.DIFFICULTIES, saved)) selectedDifficulty = saved;
  } catch {}
  for (const [value, difficulty] of Object.entries(Battle.DIFFICULTIES)) byId('ai-difficulty').add(new Option(difficulty.label, value));
  updateDifficulty();

  function updateDifficulty() {
    const difficulty = Battle.DIFFICULTIES[selectedDifficulty];
    byId('ai-difficulty').value = selectedDifficulty;
    byId('difficulty-description').textContent = difficulty.description;
    byId('solo-difficulty').textContent = selectedDifficulty === 'hell' ? difficulty.label : `${difficulty.label}难度`;
  }

  function closeDialogs() {
    Object.values(dialogs).forEach(dialog => { if (dialog.open) dialog.close(); });
    wasPlayingBeforeSettings = false;
  }

  function setGameLayout(active) {
    document.body.classList.toggle('is-playing', active);
    for (const id of ['intro', 'mode-selection', 'garden-label', 'home-sticker', 'play-hint']) byId(id).hidden = active;
    for (const id of ['battle-hud', 'battle-controls', 'arena-corner']) byId(id).hidden = !active;
    if (!active) { byId('countdown-overlay').hidden = true; byId('fight-banner').hidden = true; }
  }

  function drawPortrait(target, kind, winner = false) {
    const portrait = target.getContext('2d');
    portrait.clearRect(0, 0, target.width, target.height);
    portrait.save();
    if (winner) {
      Artwork.oval(portrait, 130, 113, 89, 74, kind === 'lulu' ? '#f6e6bf' : '#f0e0da');
      Artwork.drawFighter(portrait, { id: kind === 'lulu' ? 0 : 1, kind, x: 128, y: 202, facing: 1, state: 'victory', stateFrame: 0 }, 0.8, { scale: 0.63, shadow: false, view: 'front' });
    } else {
      Artwork.drawFighter(portrait, { id: kind === 'lulu' ? 0 : 1, kind, x: 59, y: 195, facing: kind === 'lulu' ? 1 : -1, state: 'idle', stateFrame: 0 }, 1, { scale: 0.64, shadow: false, view: 'front' });
    }
    portrait.restore();
  }
  drawPortrait(byId('portrait-0'), 'lulu');
  drawPortrait(byId('portrait-1'), 'lumei');
  globalThis.Character3D?.ready.then(() => {
    drawPortrait(byId('portrait-0'), 'lulu');
    drawPortrait(byId('portrait-1'), 'lumei');
  });

  function clearIntro() {
    for (const animation of introAnimations) animation.cancel();
    introAnimations = [];
    introCue = null;
    audio.stopVoice();
    byId('fight-banner').classList.remove('intro-start');
  }

  function showIntro(cue) {
    clearIntro();
    introCue = String(cue);
    const starting = introCue === 'start';
    const target = byId(starting ? 'fight-banner' : 'countdown-number');
    target.textContent = starting ? '开始！' : introCue;
    if (starting) { target.hidden = false; target.classList.add('intro-start'); }
    else byId('countdown-overlay').dataset.cue = introCue;
    audio.playVoice(introCue);
    if (reducedMotionQuery.matches || typeof target.animate !== 'function') return;
    introAnimations.push(target.animate([
      { transform: 'translateY(-14px) scale(0.65)', opacity: 0, offset: 0 },
      { transform: 'translateY(0) scale(1.12)', opacity: 1, offset: 0.22 },
      { transform: 'translateY(2px) scale(0.96)', opacity: 1, offset: 0.38 },
      { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.56 },
      { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.82 },
      { transform: 'translateY(-6px) scale(0.94)', opacity: 0, offset: 1 }
    ], { duration: starting ? 1100 : 1000, fill: 'both' }));
    if (!starting) introAnimations.push(byId('countdown-ring').animate([
      { transform: 'scale(0.65)', opacity: 0.2 },
      { transform: 'scale(1)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1.15)', opacity: 0 }
    ], { duration: 1000, fill: 'both' }));
    for (const animation of introAnimations) { animation.pause(); animation.currentTime = 0; }
  }

  function updateIntro() {
    if (!introCue) return;
    const starting = introCue === 'start';
    if (!match || (starting ? effects.banner?.kind !== 'fight' : match.phase !== 'countdown')) { clearIntro(); return; }
    if (reducedMotionQuery.matches) {
      for (const animation of introAnimations) animation.cancel();
      introAnimations = [];
      return;
    }
    const elapsed = starting ? (effects.banner.total - effects.banner.life) * 1000 : (Number(introCue) * 60 - match.countdown) / 60 * 1000;
    for (const animation of introAnimations) animation.currentTime = Math.max(0, elapsed);
  }

  function leaveOnline() {
    const session = online;
    online = null;
    session?.close();
    renderFrom = null;
    localPausePending = false;
    pendingVote = null;
    byId('online-match-status').hidden = true;
  }

  function openOnline(message = '免注册、免安装。创建或加入时才会连接公共服务。') {
    byId('online-entry').hidden = false;
    byId('online-room').hidden = true;
    byId('cancel-room').hidden = true;
    byId('invite-copy').hidden = true;
    byId('online-status').textContent = message;
    if (!dialogs.online.open) dialogs.online.showModal();
    byId(byId('room-code').value ? 'room-code' : 'create-room').focus();
  }

  async function connectOnline(create) {
    if (online) return;
    const code = Online.normalizeCode(byId('room-code').value);
    if (!create && !code) { byId('online-status').textContent = '请输入正确的 8 位房间码，不含 I、O、0、1。'; return; }
    void audio.unlock();
    const session = new Online.Session({ onEvent(type, data) {
      if (online !== session) return;
      if (type === 'status') {
        byId('online-entry').hidden = true;
        byId('cancel-room').hidden = false;
        byId('online-room').hidden = session.role !== 'host' || !['waiting', 'connecting', 'connected'].includes(data.state);
        byId('created-code').value = data.code;
        byId('online-status').textContent = { creating: '正在创建房间…', waiting: '房间已准备好，等待另一位玩家加入。', connecting: '正在与对方建立连接，最多等待 20 秒…', connected: '已连接，准备开打！' }[data.state] ?? '';
      } else if (type === 'ready' && session.role === 'host') start('online');
      else if (type === 'start') start('online', data);
      else if (type === 'snapshot') {
        if (!match || currentMode !== 'online') return;
        renderFrom = { fighters: viewEntities('fighters'), projectiles: viewEntities('projectiles') };
        stateArrived = performance.now();
        match = { ...data.state, mode: 'duo' };
        if (localPausePending || session.stalled || session.control.paused) match.paused = true;
        playEvents(data.events);
        updateHud();
      } else if (type === 'control') {
        localPausePending = false;
        pendingVote = null;
        applyOnlineControl();
      } else if (type === 'rematch') start('online');
      else if (type === 'stalled') {
        if (data && match) { localPausePending = true; match.paused = true; keyboard.setEnabled(false); audio.stopVoice(); audio.setMusic(false); }
        applyOnlineControl();
      } else if (type === 'closed') {
        online = null;
        home();
        openOnline(data || '房间已结束，可以重新创建或加入。');
      }
    } });
    online = session;
    try { await (create ? session.createRoom() : session.joinRoom(code)); }
    catch (error) { if (online === session) { leaveOnline(); openOnline(error.message); } }
  }

  async function copyRoom(invitation) {
    if (!online) return;
    const url = new URL(location.href);
    url.hash = `room=${online.code}`;
    if (invitation && !['https:', 'http:'].includes(url.protocol)) {
      byId('online-status').textContent = '本地文件不能生成网页邀请链接，请复制房间码，并让对方打开同一版游戏。';
      return;
    }
    const text = invitation ? url.href : online.code;
    try { await navigator.clipboard.writeText(text); byId('online-status').textContent = invitation ? '邀请链接已复制，发给你的搭子吧。' : '房间码已复制，等待搭子加入。'; }
    catch {
      const target = byId(invitation ? 'invite-copy' : 'created-code');
      target.hidden = false;
      target.value = text;
      target.focus();
      target.select();
      byId('online-status').textContent = '浏览器未允许自动复制，已选中文字，请按 Ctrl+C 或 ⌘C 复制。';
    }
  }

  function applyOnlineControl() {
    if (!online || !match) return;
    const control = online.control;
    const player = online.role === 'host' ? 0 : 1;
    const paused = control.paused || online.stalled || localPausePending;
    match.paused = paused;
    accumulator = 0;
    keyboard.setEnabled(!paused && match.phase !== 'finished');
    if (paused) { audio.stopVoice(); audio.setMusic(false); }
    byId('resume-game').disabled = Boolean(control.resume[player] || pendingVote === 'resume' || online.stalled);
    byId('pause-restart').disabled = Boolean(control.restart[player] || pendingVote === 'restart' || online.stalled);
    byId('play-again').disabled = byId('pause-restart').disabled;
    const restartWaiting = control.restart[player] || pendingVote === 'restart';
    byId('play-again').textContent = restartWaiting ? '已准备，等待对方再来一局…' : '再来一局';
    if (match.phase === 'finished') {
      showResult();
      if (control.reason === 'restart') byId('result-message').textContent = restartWaiting ? '你已准备好，等待对方确认。' : '对方想再来一局，点击下方按钮一起继续。';
    } else if (paused) {
      const reasons = { pause: '对局已暂停，双方点击继续后恢复。', help: '有人正在查看操作指南，关闭后双方点击继续。', settings: '有人正在调整设置，关闭后双方点击继续。', blur: '有玩家切出了窗口，回来后双方点击继续。', network: '网络暂时中断，已冻结对局；恢复连接后双方点击继续。', restart: '有人请求重新开始；双方点击重开确认，或点击继续取消。' };
      byId('pause-reason').textContent = online.stalled ? reasons.network : control.resume[player] ? '你已准备好，等待对方点击继续。' : reasons[control.reason];
      if (!dialogs.help.open && !dialogs.settings.open && !dialogs.pause.open) { dialogs.pause.showModal(); byId('resume-game').focus(); }
    } else {
      dialogs.pause.close();
      canvas.focus({ preventScroll: true });
      if (match.phase !== 'finished') void audio.unlock().then(unlocked => { if (unlocked && match && !match.paused) audio.setMusic(true); });
    }
    updateHud();
    if (online?.role === 'host') online.publish(match, [], true);
  }

  function requestRestart() {
    if (!online) { start(); return; }
    if (online.stalled || pendingVote) return;
    pendingVote = 'restart';
    online.vote('restart');
    if (online?.role === 'guest') { localPausePending = true; applyOnlineControl(); }
  }

  function viewEntities(key) {
    if (!match) return [];
    if (online?.role !== 'guest' || !renderFrom || match.paused) return match[key];
    const amount = Math.min(1, Math.max(0, (performance.now() - stateArrived) / (1000 / 30)));
    return match[key].map(entity => {
      const previous = renderFrom[key].find(item => item.id === entity.id);
      return previous ? { ...entity, x: previous.x + (entity.x - previous.x) * amount, y: previous.y + (entity.y - previous.y) * amount } : entity;
    });
  }

  function playEvents(events) {
    for (const event of events) {
      effects.add(event, reducedMotionQuery.matches);
      if (event.kind === 'countdown') showIntro(event.number);
      else if (event.kind === 'fight') showIntro('start');
      else audio.play(event.kind);
      if (event.kind === 'finish') { audio.setMusic(false); keyboard.setEnabled(false); }
    }
  }

  function start(mode = currentMode, initial = null) {
    if (mode !== 'online') leaveOnline();
    currentMode = mode;
    closeDialogs();
    clearIntro();
    match = initial ? { ...initial.state, mode: 'duo' } : new Battle.Match({ mode: mode === 'online' ? 'duo' : mode, difficulty: selectedDifficulty });
    currentMap = initial ? initial.map : Artwork.randomMap(currentMap);
    renderFrom = null;
    localPausePending = false;
    pendingVote = null;
    byId('arena').setAttribute('aria-label', `${Artwork.MAPS[currentMap]}对战场地`);
    accumulator = 0;
    effects.clear();
    resultShown = false;
    lastHud = '';
    byId('countdown-number').textContent = '3';
    byId('countdown-overlay').dataset.cue = '3';
    keyboard.setEnabled(true);
    setGameLayout(true);
    byId('match-mode').textContent = mode === 'online' ? '联网对战' : mode === 'solo' ? '人机对战' : '双人对战';
    byId('opponent-label').textContent = mode === 'online' ? (online.role === 'guest' ? 'P2 · 你' : 'P2 · 对手') : mode === 'solo' ? `CPU · ${Battle.DIFFICULTIES[match.difficulty].label}` : 'P2 · 玩家';
    document.querySelector('.fighter-hud .fighter-heading > span').textContent = mode === 'online' && online.role === 'guest' ? 'P1 · 对手' : mode === 'online' ? 'P1 · 你' : 'P1 · 玩家';
    document.querySelector('.control-summary strong').textContent = mode === 'online' ? (online.role === 'host' ? '你 · 噜噜' : '你 · 噜妹') : '噜噜';
    document.querySelector('.second-player').hidden = mode === 'online';
    byId('online-match-status').hidden = mode !== 'online';
    if (mode === 'online') byId('online-match-status').textContent = `房间 ${online.code} · 已连接 · 你是${online.role === 'host' ? '噜噜' : '噜妹'} · WASD 移动 / JKL 出招`;
    for (const id of ['resume-game', 'pause-restart', 'play-again']) byId(id).disabled = false;
    byId('play-again').textContent = '再来一局';
    byId('second-controls-title').textContent = mode === 'solo' ? '噜妹 · 人机操作' : '噜妹';
    byId('arena-status').textContent = '准备开打';
    updateHud();
    canvas.focus({ preventScroll: true });
    audio.unlock().then(unlocked => { if (unlocked) audio.setMusic(Boolean(match && !match.paused)); });
    announce(`${byId('match-mode').textContent}，三秒后开始。噜噜对战噜妹。`);
    if (mode === 'online' && online.role === 'host') online.beginRound(match, currentMap);
  }

  function home() {
    leaveOnline();
    if (currentMode === 'online') currentMode = 'solo';
    closeDialogs();
    clearIntro();
    keyboard.setEnabled(false);
    match = null;
    effects.clear();
    accumulator = 0;
    setGameLayout(false);
    byId('arena').setAttribute('aria-label', `${Artwork.MAPS.garden}对战场地`);
    audio.setMusic(false);
    byId('start-solo').focus({ preventScroll: true });
    announce('已返回模式选择。请选择人机、本地双人或联网对战。');
  }

  function pause(reason = '喝口水，快乐不会溜走。') {
    if (!match || match.phase === 'finished') return;
    if (online) {
      localPausePending = true;
      online.pause(reason === '喝口水，快乐不会溜走。' ? 'pause' : 'blur');
      applyOnlineControl();
      return;
    }
    if (dialogs.help.open || dialogs.pause.open || dialogs.settings.open) return;
    match.pause(true);
    audio.stopVoice();
    keyboard.setEnabled(false);
    accumulator = 0;
    audio.setMusic(false);
    byId('pause-reason').textContent = reason;
    byId('arena-status').textContent = '已暂停';
    dialogs.pause.showModal();
    byId('resume-game').focus();
    announce('游戏已暂停。');
  }

  function resume() {
    if (!match || match.phase === 'finished') return;
    if (online) {
      if (online.stalled || pendingVote || document.hidden || dialogs.help.open || dialogs.settings.open) return;
      pendingVote = 'resume';
      online.vote('resume');
      applyOnlineControl();
      return;
    }
    dialogs.pause.close();
    match.pause(false);
    keyboard.setEnabled(true);
    accumulator = 0;
    canvas.focus({ preventScroll: true });
    audio.unlock().then(unlocked => { if (unlocked) audio.setMusic(Boolean(match && !match.paused)); });
    announce('游戏继续。');
  }

  function openHelp() {
    if (online && match) {
      dialogs.pause.close();
      dialogs.help.showModal();
      byId('help-done').focus();
      localPausePending = true;
      online.pause('help');
      applyOnlineControl();
      return;
    }
    wasPlayingBeforeHelp = Boolean(match && !match.paused && match.phase !== 'finished');
    if (wasPlayingBeforeHelp) { match.pause(true); audio.stopVoice(); audio.setMusic(false); keyboard.setEnabled(false); accumulator = 0; }
    dialogs.help.showModal();
    byId('help-done').focus();
  }

  function closeHelp() {
    dialogs.help.close();
    if (online && match) { applyOnlineControl(); return; }
    if (wasPlayingBeforeHelp && match) {
      match.pause(false);
      keyboard.setEnabled(true);
      accumulator = 0;
      canvas.focus({ preventScroll: true });
      audio.unlock().then(unlocked => { if (unlocked) audio.setMusic(Boolean(match && !match.paused)); });
    }
    wasPlayingBeforeHelp = false;
  }

  function openSettings() {
    if (dialogs.settings.open) return;
    if (online && match) {
      dialogs.pause.close();
      updateDifficulty();
      byId('settings-status').textContent = '联网对战不受人机难度影响。关闭后双方点击继续。';
      dialogs.settings.showModal();
      byId('ai-difficulty').focus();
      localPausePending = true;
      online.pause('settings');
      applyOnlineControl();
      return;
    }
    wasPlayingBeforeSettings = Boolean(match && !match.paused && match.phase !== 'finished');
    if (wasPlayingBeforeSettings) { match.pause(true); audio.stopVoice(); audio.setMusic(false); keyboard.setEnabled(false); accumulator = 0; }
    updateDifficulty();
    byId('settings-status').textContent = match?.mode === 'solo' ? `当前对局：${Battle.DIFFICULTIES[match.difficulty].label}` : '';
    dialogs.settings.showModal();
    byId('ai-difficulty').focus();
  }

  function closeSettings() {
    dialogs.settings.close();
    if (online && match) { applyOnlineControl(); return; }
    if (wasPlayingBeforeSettings && match) resume();
    else if (!Object.values(dialogs).some(dialog => dialog.open)) byId('settings-open').focus();
    wasPlayingBeforeSettings = false;
  }

  function showResult() {
    if (!match?.result || resultShown || dialogs.help.open || dialogs.settings.open) return;
    resultShown = true;
    keyboard.setEnabled(false);
    const result = match.result;
    const tie = result.winner === null;
    const lost = !tie && (currentMode === 'solo' ? result.winner === 1 : online && result.winner !== (online.role === 'host' ? 0 : 1));
    const fighter = match.fighters[result.winner ?? 0];
    byId('result-title').textContent = tie ? '默契满分，平手！' : `${fighter.name}获胜！`;
    byId('result-eyebrow').textContent = tie ? 'TWO LOVELY CHAMPIONS' : lost ? 'ANOTHER CHANCE TO SMILE' : 'A LOVELY VICTORY';
    byId('result-message').textContent = tie ? '旗鼓相当的你们，都值得一朵小红花。' : lost ? `这次${fighter.name}略胜一筹，下次一定更厉害。` : '赢了对决，也赢了一整天的好心情。';
    byId('result-hits').textContent = String(fighter.stats.hits);
    byId('result-health').textContent = tie ? `${result.health[0]} / ${result.health[1]}` : String(fighter.health);
    byId('result-blocks').textContent = String(fighter.stats.blocked);
    drawPortrait(byId('winner-portrait'), fighter.kind, true);
    dialogs.result.showModal();
    byId('play-again').focus();
    announce(`${byId('result-title').textContent}${result.reason === 'time' ? '时间到。' : ''}可以选择再来一局或返回主页。`);
  }

  function updateHud() {
    if (!match) return;
    const signature = `${match.phase}:${match.countdown}:${match.remaining}:${match.paused}:${match.fighters.map(fighter => `${fighter.health}:${fighter.cooldown}`).join(',')}`;
    if (signature === lastHud) return;
    lastHud = signature;
    const seconds = Math.ceil(match.remaining / 60);
    byId('timer').textContent = String(seconds).padStart(2, '0');
    byId('timer').classList.toggle('hurry', seconds <= 15);
    byId('timer').setAttribute('aria-label', `剩余${seconds}秒`);
    for (const fighter of match.fighters) {
      const index = fighter.id;
      byId(`health-number-${index}`).textContent = String(fighter.health);
      byId(`health-${index}`).setAttribute('aria-valuenow', String(fighter.health));
      byId(`health-${index}`).classList.toggle('low', fighter.health <= 25);
      byId(`health-fill-${index}`).style.transform = `scaleX(${fighter.health / 100})`;
      byId(`health-ghost-${index}`).style.transform = `scaleX(${fighter.health / 100})`;
      byId(`cooldown-${index}`).style.width = `${(1 - fighter.cooldown / 180) * 100}%`;
      byId(`cooldown-label-${index}`).textContent = fighter.cooldown === 0 ? '准备就绪' : `${(fighter.cooldown / 60).toFixed(1)}s`;
    }
    byId('countdown-overlay').hidden = match.phase !== 'countdown';
    byId('arena-status').textContent = match.paused ? '已暂停' : match.phase === 'countdown' ? '准备开打' : match.phase === 'finished' ? '本局结束' : '正在对战';
  }

  function draw() {
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const desiredWidth = Math.round(canvas.clientWidth * density);
    const desiredHeight = Math.round(desiredWidth * Battle.CONFIG.height / Battle.CONFIG.width);
    if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) { canvas.width = desiredWidth; canvas.height = desiredHeight; }
    context.setTransform(canvas.width / 1280, 0, 0, canvas.height / 620, 0, 0);
    const reduced = reducedMotionQuery.matches;
    if (!match) {
      Artwork.drawHome(context, visualTime, reduced);
      return;
    }
    Artwork.drawScenery(context, visualTime, { still: reduced, map: currentMap });
    context.save();
    if (effects.shake > 0 && !reduced) context.translate(Math.sin(visualTime * 98) * effects.shake, Math.cos(visualTime * 121) * effects.shake * 0.5);
    for (const fighter of [...viewEntities('fighters')].sort((first, second) => first.y - second.y)) Artwork.drawFighter(context, fighter, visualTime);
    for (const projectile of viewEntities('projectiles')) Artwork.drawProjectile(context, projectile, visualTime);
    effects.draw(context);
    context.restore();
    byId('fight-banner').hidden = !effects.banner || dialogs.result.open;
    if (effects.banner) byId('fight-banner').textContent = effects.banner.text;
    updateIntro();
  }

  function animate(milliseconds) {
    const delta = previousTime ? Math.min(0.1, Math.max(0, (milliseconds - previousTime) / 1000)) : 0;
    previousTime = milliseconds;
    if (!match || !match.paused) {
      visualTime += delta;
      effects.update(delta);
    }
    if (match && !match.paused) {
      accumulator = Math.min(accumulator + delta, 0.1);
      while (match && !match.paused && accumulator >= 1 / 60) {
        const inputs = keyboard.sample();
        if (online?.role === 'guest') {
          if (match.phase !== 'finished') online.sendInput(inputs[0]);
        } else {
          const events = match.step(online ? [inputs[0], online.takeInput()] : inputs);
          playEvents(events);
          online?.publish(match, events);
        }
        accumulator = Math.max(0, accumulator - 1 / 60);
      }
      updateHud();
      if (match?.phase === 'finished' && match.frame - match.finishedFrame >= 68) showResult();
    }
    draw();
    requestAnimationFrame(animate);
  }

  byId('start-solo').addEventListener('click', () => start('solo'));
  byId('start-duo').addEventListener('click', () => start('duo'));
  byId('start-online').addEventListener('click', () => openOnline());
  byId('create-room').addEventListener('click', () => connectOnline(true));
  byId('join-room-form').addEventListener('submit', event => { event.preventDefault(); void connectOnline(false); });
  byId('room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase(); });
  byId('copy-room').addEventListener('click', () => copyRoom(false));
  byId('copy-invite').addEventListener('click', () => copyRoom(true));
  byId('cancel-room').addEventListener('click', () => { leaveOnline(); openOnline('已退出房间，可以重新创建或加入。'); });
  function closeOnline() { leaveOnline(); dialogs.online.close(); byId('start-online').focus(); }
  byId('online-close').addEventListener('click', closeOnline);
  dialogs.online.addEventListener('cancel', event => { event.preventDefault(); closeOnline(); });
  byId('brand-home').addEventListener('click', () => { if (match && match.phase !== 'finished') pause('想回花园首页吗？可以在这里选择返回。'); else home(); });
  byId('sound-toggle').addEventListener('click', async () => {
    audio.setEnabled(!audio.enabled);
    updateSoundButton();
    if (audio.enabled) { await audio.unlock(); audio.setMusic(Boolean(match && !match.paused && match.phase !== 'finished')); audio.play('click'); }
    try { localStorage.setItem('lulu-sound', audio.enabled ? 'on' : 'off'); } catch { /* 存储不可用时只保留本次设置。 */ }
  });
  byId('help-open').addEventListener('click', openHelp);
  byId('help-close').addEventListener('click', closeHelp);
  byId('help-done').addEventListener('click', closeHelp);
  byId('settings-open').addEventListener('click', openSettings);
  byId('settings-close').addEventListener('click', closeSettings);
  byId('settings-done').addEventListener('click', closeSettings);
  byId('ai-difficulty').addEventListener('change', event => {
    const difficulty = event.target.value;
    if (!Object.hasOwn(Battle.DIFFICULTIES, difficulty)) { updateDifficulty(); return; }
    selectedDifficulty = difficulty;
    updateDifficulty();
    try {
      localStorage.setItem('lulu-difficulty', selectedDifficulty);
      byId('settings-status').textContent = `已保存：${Battle.DIFFICULTIES[selectedDifficulty].label}，下一局人机对战生效。`;
    } catch {
      byId('settings-status').textContent = '本页已应用；浏览器无法保存设置，本次选择仅在当前页面有效。';
    }
  });
  byId('pause-open').addEventListener('click', () => pause());
  byId('resume-game').addEventListener('click', resume);
  for (const id of ['quick-restart', 'pause-restart', 'play-again']) byId(id).addEventListener('click', requestRestart);
  for (const id of ['pause-home', 'result-home']) byId(id).addEventListener('click', home);
  dialogs.help.addEventListener('cancel', event => { event.preventDefault(); closeHelp(); });
  dialogs.pause.addEventListener('cancel', event => { event.preventDefault(); resume(); });
  dialogs.result.addEventListener('cancel', event => { event.preventDefault(); home(); });
  dialogs.settings.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  // 不依赖系统的 Tab 导航偏好，保证弹窗按钮可顺序访问且焦点不会逃出弹窗。
  Object.values(dialogs).forEach(dialog => dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const buttons = [...dialog.querySelectorAll('button, select, input')].filter(button => !button.disabled && !button.hidden && button.getClientRects().length);
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }));
  window.addEventListener('keydown', event => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Escape' && !Object.values(dialogs).some(dialog => dialog.open)) { event.preventDefault(); pause(); }
    if (event.code === 'KeyR' && match && !Object.values(dialogs).some(dialog => dialog.open)) { event.preventDefault(); requestRestart(); }
  });
  window.addEventListener('blur', () => pause('切换窗口时已自动暂停，回来继续就好。'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('页面离开前台，已为你暂停对局。'); });
  window.addEventListener('pagehide', () => { if (online) home(); });

  const networkSnapshot = () => online ? { state: online.state, role: online.role, code: online.code, round: online.round, build: Online.BUILD, latency: online.latency, stalled: online.stalled, control: structuredClone(online.control) } : null;

  /* 只读诊断供自动验收与故障定位使用，不提供改血量或跳过对局接口。 */
  window.LuluGame = Object.freeze({
    snapshot: () => match ? {
      mode: currentMode, network: networkSnapshot(), difficulty: match.mode === 'solo' ? match.difficulty : null, settings: { difficulty: selectedDifficulty }, map: currentMap, phase: match.phase, paused: match.paused, frame: match.frame, remaining: match.remaining,
      countdown: match.countdown, projectiles: match.projectiles.length, effects: effects.items.length,
      result: match.result ? structuredClone(match.result) : null,
      fighters: match.fighters.map(fighter => ({ id: fighter.id, kind: fighter.kind, x: fighter.x, y: fighter.y, health: fighter.health, state: fighter.state, facing: fighter.facing, jumps: fighter.jumps, grounded: fighter.grounded, cooldown: fighter.cooldown, guarding: fighter.guarding, running: fighter.running, stats: { ...fighter.stats } })),
      audio: { enabled: audio.enabled, state: audio.context?.state ?? 'locked', music: Boolean(audio.music) }
    } : { phase: 'home', network: networkSnapshot(), settings: { difficulty: selectedDifficulty }, map: 'garden', audio: { enabled: audio.enabled, state: audio.context?.state ?? 'locked' } },
    get ready() { return !globalThis.Character3D || Character3D.status().state !== 'loading'; }
  });
  function readInvitation() {
    const invitation = Online.normalizeCode(new URLSearchParams(location.hash.slice(1)).get('room'));
    if (invitation && !match && !online) { byId('room-code').value = invitation; openOnline('收到搭子的邀请，点击「加入房间」即可。'); }
  }
  window.addEventListener('hashchange', readInvitation);
  readInvitation();
  requestAnimationFrame(animate);
})();
