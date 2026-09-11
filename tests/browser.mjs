import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchBrowser } from '../scripts/browser-runtime.mjs';
import { readPcmWav } from '../scripts/wav.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const engine = process.env.TEST_BROWSER || 'chromium';
const output = path.join(root, 'artifacts');
await mkdir(output, { recursive: true });
const voiceLengths = Object.fromEntries(await Promise.all(['3', '2', '1', 'start'].map(async cue => [cue, readPcmWav(await readFile(path.join(root, `assets/audio/voice-${cue}.wav`)), 22050).length / 2])));
const browser = await launchBrowser(engine);
const report = { browser: engine, version: browser.version(), date: new Date().toISOString(), entry: 'file:// index.html', offline: true, offlineStrategy: engine === 'webkit' ? 'HTTP/HTTPS blocked before file navigation; offline emulation enabled immediately after load' : 'offline emulation before file navigation', checks: [], screenshots: [], errors: [], externalRequests: [] };
report.bundleSHA256 = createHash('sha256').update(await readFile(path.join(root, 'index.html'))).digest('hex');
let page;

async function check(name, action) {
  await action();
  report.checks.push(name);
  console.log(`✓ ${name}`);
}

async function attachVoiceProbe(target) {
  await target.evaluate(() => {
    const playVoice = Soundtrack.Player.prototype.playVoice;
    const stopVoice = Soundtrack.Player.prototype.stopVoice;
    window.__introProbe = { calls: [], stops: 0, player: null };
    Soundtrack.Player.prototype.playVoice = function (cue) {
      const played = playVoice.call(this, cue);
      const samples = this.voice?.buffer.getChannelData(0);
      window.__introProbe.player = this;
      window.__introProbe.calls.push({ cue: String(cue), played, frame: LuluGame.snapshot().frame, length: samples?.length || 0, rms: samples ? Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) : 0 });
      return played;
    };
    Soundtrack.Player.prototype.stopVoice = function () {
      if (this.voice) window.__introProbe.stops += 1;
      stopVoice.call(this);
    };
  });
}

try {
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, offline: engine !== 'webkit' });
  // WebKit 的网络离线模拟也会拦截 file://；先阻断网络，读本地文件后再开启离线模拟。
  await browserContext.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
  page = await browserContext.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
  await page.clock.install({ time: new Date('2026-09-10T00:00:00Z') });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  if (engine === 'webkit') await browserContext.setOffline(true);
  await page.waitForFunction(() => window.LuluGame?.ready);
  await page.clock.pauseAt(new Date('2026-09-10T00:01:00Z'));
  await attachVoiceProbe(page);
  const snapshot = () => page.evaluate(() => window.LuluGame.snapshot());
  const advance = milliseconds => page.clock.runFor(milliseconds);
  const click = id => page.locator(`#${id}`).click();
  const press = key => page.keyboard.press(key);
  const voiceCalls = () => page.evaluate(() => window.__introProbe.calls);
  const introAnimation = () => page.evaluate(() => [...document.querySelectorAll('#countdown-number, #countdown-ring, #fight-banner')].flatMap(element => element.getAnimations().map(animation => animation.currentTime)));
  async function capture(name) {
    const filename = `${engine}-${name}.png`;
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
    report.screenshots.push(filename);
  }
  async function freshDuo() {
    const previousMap = (await snapshot()).map;
    if ((await snapshot()).phase === 'home') await click('start-duo');
    else if (await page.locator('#result-dialog').evaluate(dialog => dialog.open)) await click('play-again');
    else await click('quick-restart');
    const selectedMap = (await snapshot()).map;
    assert.notEqual(selectedMap, previousMap);
    assert.equal(await page.locator('#arena').getAttribute('aria-label'), await page.evaluate(() => `${Artwork.MAPS[LuluGame.snapshot().map]}对战场地`));
    await advance(3220);
    assert.equal((await snapshot()).phase, 'fighting');
    assert.equal((await snapshot()).map, selectedMap);
  }
  async function moveCloser() {
    await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft');
    await advance(1040);
    await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
    await advance(20);
  }

  await check('断网环境从 file:// 打开完整游戏，无服务器与外部资源', async () => {
    assert.equal((await snapshot()).phase, 'home');
    assert.equal(await page.locator('#start-solo').isVisible(), true);
    assert.equal(await page.locator('#start-duo').isVisible(), true);
    assert.equal(await page.locator('#fatal-error').isVisible(), false);
    await capture('home');
  });

  await check('内嵌 GLB 通过 WebGL 2 渲染，两角色各含 16 种动画', async () => {
    const modelStatus = await page.evaluate(() => Character3D.status());
    assert.equal(modelStatus.backend, 'webgl2', modelStatus.error);
    assert.equal(modelStatus.models.length, 2);
    assert.ok(modelStatus.models.every(model => model.animations.length === 16));
    report.models = modelStatus;
  });

  await check('五张不同背景均可离线绘制、缓存复用、减少动态且随机不连续重复', async () => {
    const scenery = await page.evaluate(() => {
      const maps = Object.keys(Artwork.MAPS);
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 620;
      const context = canvas.getContext('2d');
      const render = (map, time = 2, still = false) => {
        Artwork.drawScenery(context, time, { map, still });
        return canvas.toDataURL('image/png');
      };
      const images = maps.map(map => ({ map, image: render(map) }));
      return {
        maps,
        choices: [undefined, 'unknown', ...maps].map(previous => {
          const available = maps.filter(map => map !== previous);
          return { available, selected: available.map((map, index) => Artwork.randomMap(previous, () => index / available.length)) };
        }),
        images: images.map(({ map, image }) => ({
          map, image, cached: render(map) === image, animated: render(map, 8) !== image,
          still: render(map, 2, true) === render(map, 8, true)
        })),
        fallback: render('unknown') === render('garden')
      };
    });
    assert.deepEqual(scenery.maps, ['garden', 'beach', 'sakura', 'snow', 'city']);
    for (const choice of scenery.choices) assert.deepEqual(choice.selected, choice.available);
    assert.equal(new Set(scenery.images.map(entry => entry.image)).size, 5);
    assert.equal(scenery.fallback, true);
    for (const entry of scenery.images) {
      assert.equal(entry.cached, true, `${entry.map} 缓存不串图`);
      assert.equal(entry.animated, true, `${entry.map} 背景动态`);
      assert.equal(entry.still, true, `${entry.map} 减少动态`);
      const filename = `${engine}-map-${entry.map}.png`;
      await writeFile(path.join(output, filename), Buffer.from(entry.image.split(',')[1], 'base64'));
      report.screenshots.push(filename);
    }
    assert.equal((await snapshot()).map, 'garden');
  });

  await check('操作指南、Escape 关闭、声音解锁和静音开关', async () => {
    await click('help-open');
    assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), true);
    assert.match(await page.locator('#help-dialog').innerText(), /小键盘 3/);
    await capture('help');
    await press('Escape');
    assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), false);
    await click('sound-toggle'); assert.equal((await snapshot()).audio.enabled, false);
    await click('sound-toggle'); assert.equal((await snapshot()).audio.enabled, true);
    await page.waitForFunction(() => window.LuluGame.snapshot().audio.state === 'running');
  });

  await check('双人模式 321 中文语音与弹跳动画同拍，3秒开打和 1.1秒字幕', async () => {
    await click('start-duo');
    const selectedMap = (await snapshot()).map;
    assert.notEqual(selectedMap, 'garden');
    assert.equal((await snapshot()).phase, 'countdown');
    await page.keyboard.down('KeyD');
    await press('KeyJ'); await advance(250);
    const initial = await snapshot();
    await page.keyboard.up('KeyD');
    for (const [index, cue] of ['3', '2', '1'].entries()) {
      if (index) await advance(1000);
      assert.equal(await page.locator('#countdown-number').innerText(), cue);
      assert.equal((await snapshot()).phase, 'countdown');
      assert.equal((await snapshot()).remaining, 5400);
      assert.deepEqual((await snapshot()).fighters.map(fighter => [fighter.x, fighter.health, fighter.cooldown]), initial.fighters.map(fighter => [fighter.x, fighter.health, fighter.cooldown]));
      assert.equal((await introAnimation()).length, 2);
      const call = (await voiceCalls()).at(-1);
      assert.equal(call.cue, cue);
      assert.equal(call.played, true);
      assert.equal(call.length, voiceLengths[cue]);
      assert.ok(call.rms > 0.12);
      await capture(`countdown-${cue}`);
    }
    await advance(1000);
    assert.equal((await snapshot()).phase, 'fighting');
    assert.equal((await snapshot()).map, selectedMap);
    assert.equal(await page.locator('#opponent-label').innerText(), 'P2 · 玩家');
    assert.equal(await page.locator('#fight-banner').innerText(), '开始！');
    assert.equal((await introAnimation()).length, 1);
    assert.deepEqual((await voiceCalls()).map(call => [call.cue, call.frame]), [['3', 1], ['2', 61], ['1', 121], ['start', 180]]);
    assert.equal((await voiceCalls()).at(-1).length, voiceLengths.start);
    await capture('duo');
    await advance(1000);
    assert.equal(await page.locator('#fight-banner').isVisible(), false);
    assert.deepEqual(await introAnimation(), []);
  });

  await check('双方同时方向输入、双击奔跑以及松开停止', async () => {
    await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft');
    await advance(650);
    await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
    const moved = await snapshot();
    assert.ok(moved.fighters[0].x > 480 && moved.fighters[1].x < 800);
    await page.keyboard.down('KeyD'); await advance(40); await page.keyboard.up('KeyD');
    await advance(80); await page.keyboard.down('KeyD'); await advance(150);
    assert.equal((await snapshot()).fighters[0].running, true);
    await page.keyboard.up('KeyD'); await advance(40);
    assert.equal((await snapshot()).fighters[0].running, false);
  });

  await check('双方跳跃、二段跳、重复按键过滤及落地恢复', async () => {
    for (const [player, code] of [[0, 'KeyW'], [1, 'ArrowUp']]) {
      await page.keyboard.down(code); await advance(65);
      assert.equal((await snapshot()).fighters[player].jumps, 1);
      await page.keyboard.down(code); await advance(70);
      assert.equal((await snapshot()).fighters[player].jumps, 1);
      await page.keyboard.up(code); await page.keyboard.down(code); await advance(34);
      assert.equal((await snapshot()).fighters[player].jumps, 2);
      await page.keyboard.up(code); await page.keyboard.down(code); await advance(34);
      assert.equal((await snapshot()).fighters[player].jumps, 2);
      await page.keyboard.up(code); await advance(1500);
      assert.equal((await snapshot()).fighters[player].jumps, 0);
      assert.equal((await snapshot()).fighters[player].grounded, true);
    }
  });

  await check('双方下蹲与松键起身动画', async () => {
    await page.keyboard.down('KeyS'); await page.keyboard.down('ArrowDown'); await advance(64);
    assert.deepEqual((await snapshot()).fighters.map(fighter => fighter.state), ['crouch', 'crouch']);
    await capture('crouch');
    await page.keyboard.up('KeyS'); await page.keyboard.up('ArrowDown'); await advance(34);
    assert.deepEqual((await snapshot()).fighters.map(fighter => fighter.state), ['rise', 'rise']);
    await advance(200);
    assert.deepEqual((await snapshot()).fighters.map(fighter => fighter.state), ['idle', 'idle']);
  });

  await check('P1 J 普攻前摇、单次命中、伤害、特效和 HUD 同步', async () => {
    await freshDuo(); await moveCloser();
    await press('KeyJ'); await advance(70);
    assert.equal((await snapshot()).fighters[1].health, 100);
    await advance(110);
    assert.equal((await snapshot()).fighters[1].health, 92);
    assert.equal(await page.locator('#health-1').getAttribute('aria-valuenow'), '92');
    assert.ok((await snapshot()).effects > 0);
    await capture('hit');
    await advance(650);
    assert.equal((await snapshot()).fighters[1].health, 92);
  });

  await check('P2 小键盘3防御生效，正面减伤 80%', async () => {
    await freshDuo(); await moveCloser();
    await page.keyboard.down('Numpad3'); await advance(40);
    assert.equal((await snapshot()).fighters[1].guarding, true);
    await press('KeyJ'); await advance(230);
    assert.equal((await snapshot()).fighters[1].health, 98.4);
    assert.equal((await snapshot()).fighters[1].stats.blocked, 1);
    await capture('guard');
    await page.keyboard.up('Numpad3');
  });

  await check('P2 小键盘1普攻与 P1 L 防御、主键区 1/3 兼容', async () => {
    await freshDuo(); await moveCloser();
    await page.keyboard.down('KeyL'); await advance(35);
    await press('Numpad1'); await advance(200);
    assert.equal((await snapshot()).fighters[0].health, 98.4);
    await page.keyboard.up('KeyL'); await advance(550);
    await press('Digit1'); await advance(200);
    assert.equal((await snapshot()).fighters[0].health, 90.4);
    await advance(500); await page.keyboard.down('Digit3'); await advance(40);
    assert.equal((await snapshot()).fighters[1].guarding, true);
    await page.keyboard.up('Digit3');
  });

  await check('P2 小键盘2远程泡泡、16点伤害、投射物销毁及主键区2兼容', async () => {
    await freshDuo(); await press('Numpad2'); await advance(380);
    assert.equal((await snapshot()).projectiles, 1);
    assert.ok((await snapshot()).fighters[1].cooldown > 150);
    await capture('bubble');
    await advance(1180);
    assert.equal((await snapshot()).fighters[0].health, 84);
    assert.equal((await snapshot()).projectiles, 0);
    await freshDuo(); await press('Digit2'); await advance(1580);
    assert.equal((await snapshot()).fighters[0].health, 84);
  });

  await check('P1 K 橘子突进、18点伤害与技能冷却', async () => {
    await freshDuo();
    await page.keyboard.down('KeyD'); await advance(1400); await page.keyboard.up('KeyD');
    const before = (await snapshot()).fighters[0].x;
    await press('KeyK'); await advance(370);
    await capture('dash');
    await advance(480);
    const after = await snapshot();
    assert.equal(after.fighters[1].health, 82);
    assert.ok(after.fighters[0].x > before + 70);
    assert.ok(after.fighters[0].cooldown > 0);
    await press('KeyK'); await advance(100);
    assert.equal((await snapshot()).fighters[0].stats.skills, 1);
  });

  await check('暂停、帮助页、失焦暂停与恢复时清除方向键', async () => {
    await freshDuo(); await page.keyboard.down('KeyD'); await advance(150);
    await press('Escape');
    const paused = await snapshot();
    assert.equal(paused.paused, true);
    await advance(4000);
    assert.equal((await snapshot()).frame, paused.frame);
    assert.equal((await snapshot()).remaining, paused.remaining);
    assert.equal((await snapshot()).map, paused.map);
    await capture('pause');
    await click('resume-game'); await advance(150);
    assert.equal((await snapshot()).fighters[0].x, paused.fighters[0].x);
    await page.keyboard.up('KeyD');
    await click('help-open'); assert.equal((await snapshot()).paused, true);
    await advance(600); await click('help-done');
    assert.equal((await snapshot()).paused, false);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snapshot()).paused, true);
    await click('resume-game');
    assert.equal((await snapshot()).paused, false);
    assert.equal((await snapshot()).map, paused.map);
  });

  await check('完整双人对局通过真实键盘输入打至 KO，胜利弹窗可重开', async () => {
    await freshDuo();
    for (let turn = 0; turn < 160; turn += 1) {
      const state = await snapshot();
      if (state.phase === 'finished') break;
      const [first, second] = state.fighters;
      const movement = first.x < second.x ? 'KeyD' : 'KeyA';
      if (Math.abs(first.x - second.x) > 135) await page.keyboard.down(movement);
      if (first.cooldown === 0 && Math.abs(first.x - second.x) < 290) await press('KeyK');
      else await press('KeyJ');
      await advance(460);
      await page.keyboard.up(movement);
    }
    const completed = await snapshot();
    assert.equal(completed.phase, 'finished');
    assert.equal(completed.result.winner, 0);
    assert.equal(completed.fighters[1].health, 0);
    await click('help-open'); await advance(1500);
    assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator('#result-dialog').evaluate(dialog => dialog.open), false);
    await click('help-done'); await advance(60);
    assert.equal(await page.locator('#result-dialog').evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator('#result-title').innerText(), '噜噜获胜！');
    await capture('duo-result');
    await click('play-again');
    const restarted = await snapshot();
    assert.notEqual(restarted.map, completed.map);
    assert.equal(restarted.phase, 'countdown');
    assert.deepEqual(restarted.fighters.map(fighter => fighter.health), [100, 100]);
    assert.deepEqual(restarted.fighters.map(fighter => fighter.cooldown), [0, 0]);
    assert.equal(restarted.projectiles, 0); assert.equal(restarted.effects, 0);
  });

  await check('90秒完整超时对局判平手，弹窗返回主页', async () => {
    await advance(94000);
    assert.equal((await snapshot()).phase, 'finished');
    assert.equal((await snapshot()).result.winner, null);
    assert.equal((await snapshot()).result.reason, 'time');
    await advance(1250);
    assert.match(await page.locator('#result-title').innerText(), /平手/);
    await capture('draw-result');
    await click('result-home');
    assert.equal((await snapshot()).phase, 'home');
    assert.equal((await snapshot()).map, 'garden');
    assert.equal(await page.locator('#arena').getAttribute('aria-label'), '橘子云朵花园对战场地');
  });

  await check('完整人机对局：AI 主动移动攻防，真实键盘玩家参与并正常结算', async () => {
    await click('start-solo'); await advance(3220);
    const selectedMap = (await snapshot()).map;
    assert.ok(await page.evaluate(() => Object.hasOwn(Artwork.MAPS, LuluGame.snapshot().map)));
    assert.equal(await page.locator('#opponent-label').innerText(), 'CPU · 中等');
    const observed = new Set();
    for (let turn = 0; turn < 270; turn += 1) {
      const state = await snapshot();
      if (state.phase === 'finished') break;
      observed.add(state.fighters[1].state);
      const [first, second] = state.fighters;
      const movement = first.x < second.x ? 'KeyD' : 'KeyA';
      if (Math.abs(first.x - second.x) > 123) await page.keyboard.down(movement);
      if (turn % 9 === 4) await page.keyboard.down('KeyL');
      else if (first.cooldown === 0 && Math.abs(first.x - second.x) < 300) await press('KeyK');
      else await press('KeyJ');
      if (turn % 13 === 6) await press('KeyW');
      await advance(400);
      await page.keyboard.up(movement); await page.keyboard.up('KeyL');
      if (turn === 12) await capture('solo-action');
    }
    const completed = await snapshot();
    assert.equal(completed.map, selectedMap);
    assert.equal(completed.phase, 'finished');
    assert.ok(completed.fighters[0].stats.hits > 0);
    assert.ok(completed.fighters[1].stats.hits > 0);
    assert.ok(observed.size >= 4);
    report.soloResult = { result: completed.result, aiStates: [...observed], stats: completed.fighters.map(fighter => fighter.stats) };
    await advance(1250);
    assert.equal(await page.locator('#result-dialog').evaluate(dialog => dialog.open), true);
    await capture('solo-result');
  });

  await check('连续重开、返回主页和键盘 R 重开不遗留状态', async () => {
    await click('play-again');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const previousMap = (await snapshot()).map;
      await advance(500); await press('KeyR');
      const state = await snapshot();
      assert.notEqual(state.map, previousMap);
      assert.equal(state.phase, 'countdown'); assert.equal(state.remaining, 5400);
      assert.deepEqual(state.fighters.map(fighter => fighter.health), [100, 100]);
      assert.equal(state.projectiles, 0); assert.equal(state.effects, 0);
    }
    await press('Escape');
    const previousMap = (await snapshot()).map;
    await click('pause-restart');
    assert.notEqual((await snapshot()).map, previousMap);
    await press('Escape'); await click('pause-home');
    assert.equal((await snapshot()).phase, 'home');
    assert.equal((await snapshot()).map, 'garden');
  });

  await check('倒计时暂停、帮助、失焦和静音不会重播或残留语音', async () => {
    await click('start-duo'); await advance(120);
    await press('Escape');
    const paused = await snapshot();
    const animation = await introAnimation();
    const calls = (await voiceCalls()).length;
    await advance(2200);
    assert.equal((await snapshot()).countdown, paused.countdown);
    assert.deepEqual(await introAnimation(), animation);
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    await click('resume-game'); await advance(120);
    assert.equal((await voiceCalls()).length, calls);
    await click('help-open');
    const helpAnimation = await introAnimation();
    await advance(1500);
    assert.deepEqual(await introAnimation(), helpAnimation);
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    await click('help-done'); await advance(50);
    assert.equal((await voiceCalls()).length, calls);
    await click('sound-toggle');
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    await advance(1000);
    assert.equal((await voiceCalls()).at(-1).cue, '2');
    assert.equal((await voiceCalls()).at(-1).played, false);
    await click('sound-toggle'); await advance(50);
    assert.equal((await voiceCalls()).length, calls + 1);
    await advance(1000);
    assert.equal((await voiceCalls()).at(-1).cue, '1');
    assert.equal((await voiceCalls()).at(-1).played, true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await introAnimation();
    await advance(1000);
    assert.deepEqual(await introAnimation(), blurred);
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    await click('resume-game'); await advance(50);
    assert.equal((await voiceCalls()).length, calls + 2);
  });

  await check('快速重开从3开始，返回首页清理动画，开战横幅暂停后继续', async () => {
    for (const restart of ['quick-restart', 'KeyR', 'pause-restart', 'KeyR']) {
      const calls = (await voiceCalls()).length;
      if (restart === 'KeyR') await press(restart);
      else {
        if (restart === 'pause-restart') await press('Escape');
        await click(restart);
      }
      assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
      await advance(80);
      assert.equal(await page.locator('#countdown-number').innerText(), '3');
      assert.equal((await voiceCalls()).length, calls + 1);
      assert.equal((await voiceCalls()).at(-1).cue, '3');
    }
    await advance(3200); await press('Escape');
    const bannerAnimation = await introAnimation();
    assert.equal(bannerAnimation.length, 1);
    await advance(2000);
    assert.deepEqual(await introAnimation(), bannerAnimation);
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    await click('resume-game'); await advance(1000);
    assert.equal(await page.locator('#fight-banner').isVisible(), false);
    await click('quick-restart'); await advance(80);
    await press('Escape'); await click('pause-home');
    const calls = (await voiceCalls()).length;
    await advance(1500);
    assert.equal((await snapshot()).phase, 'home');
    assert.deepEqual(await introAnimation(), []);
    assert.equal((await voiceCalls()).length, calls);
    assert.equal(await page.locator('#countdown-overlay').isVisible(), false);
    assert.equal(await page.locator('#fight-banner').isVisible(), false);
    await click('start-solo'); await advance(120);
    assert.equal((await voiceCalls()).at(-1).cue, '3');
    assert.equal((await voiceCalls()).at(-1).played, true);
    await press('Escape'); await click('pause-home');
  });

  await check('右上角设置提供四档难度，默认中等，首页与人机对局同步选择', async () => {
    assert.equal((await snapshot()).settings.difficulty, 'medium');
    assert.equal(await page.locator('#settings-open').isVisible(), true);
    await click('settings-open');
    assert.deepEqual(await page.locator('#ai-difficulty option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [['easy', '简单'], ['medium', '中等'], ['hard', '困难'], ['hell', '地狱模式']]);
    assert.equal(await page.locator('#ai-difficulty').inputValue(), 'medium');
    for (const [key, target] of [['Tab', 'settings-done'], ['Tab', 'settings-close'], ['Tab', 'ai-difficulty'], ['Shift+Tab', 'settings-close']]) {
      await press(key);
      assert.equal(await page.evaluate(() => document.activeElement.id), target);
    }
    await capture('settings');
    await press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-open');
    for (const [difficulty, label] of [['easy', '简单'], ['medium', '中等'], ['hard', '困难'], ['hell', '地狱模式']]) {
      await click('settings-open');
      await page.locator('#ai-difficulty').selectOption(difficulty);
      assert.ok(await page.locator('#difficulty-description').innerText());
      assert.equal(await page.evaluate(() => localStorage.getItem('lulu-difficulty')), difficulty);
      await click('settings-done');
      assert.equal(await page.locator('#solo-difficulty').innerText(), difficulty === 'hell' ? label : `${label}难度`);
      await click('start-solo'); await advance(80);
      const initial = await snapshot();
      assert.equal(initial.difficulty, difficulty);
      assert.equal(initial.phase, 'countdown');
      assert.equal(initial.remaining, 5400);
      assert.equal(await page.locator('#opponent-label').innerText(), `CPU · ${label}`);
      await advance(3500);
      assert.equal((await snapshot()).phase, 'fighting');
      assert.ok((await snapshot()).fighters[1].x < initial.fighters[1].x);
      if (difficulty === 'hell') await capture('solo-hell');
      await press('Escape'); await click('pause-home');
    }
  });

  await check('设置冻结倒计时并清除按键与语音，难度仅在各类重开后生效', async () => {
    const firstCall = (await voiceCalls()).length;
    await click('start-solo'); await advance(120);
    await page.keyboard.down('KeyD');
    await click('settings-open');
    const paused = await snapshot();
    const animation = await introAnimation();
    assert.equal(paused.paused, true);
    assert.equal(paused.audio.music, false);
    assert.equal(await page.locator('#settings-status').innerText(), '当前对局：地狱模式');
    await advance(2200); await press('KeyR');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.deepEqual(await snapshot(), paused);
    assert.deepEqual(await introAnimation(), animation);
    assert.deepEqual(await page.locator('dialog[open]').evaluateAll(dialogs => dialogs.map(dialog => dialog.id)), ['settings-dialog']);
    assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
    assert.equal((await voiceCalls()).length, firstCall + 1);
    await page.locator('#ai-difficulty').selectOption('easy');
    assert.equal((await snapshot()).difficulty, 'hell');
    assert.equal((await snapshot()).settings.difficulty, 'easy');
    assert.equal(await page.locator('#opponent-label').innerText(), 'CPU · 地狱模式');
    await capture('settings-paused');
    await press('Escape'); await page.keyboard.up('KeyD'); await advance(100);
    assert.equal((await snapshot()).paused, false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'game-canvas');
    assert.equal((await voiceCalls()).length, firstCall + 1);
    await advance(3100);
    assert.deepEqual((await voiceCalls()).slice(firstCall).map(call => call.cue), ['3', '2', '1', 'start']);
    assert.equal((await snapshot()).phase, 'fighting');
    assert.equal((await snapshot()).map, paused.map);
    assert.equal((await snapshot()).fighters[0].x, paused.fighters[0].x);
    for (const restart of ['quick-restart', 'KeyR', 'pause-restart', 'quick-restart']) {
      if (restart === 'KeyR') await press(restart);
      else {
        if (restart === 'pause-restart') await press('Escape');
        await click(restart);
      }
      assert.equal(await page.evaluate(() => window.__introProbe.player.voice), null);
      await advance(80);
      const restarted = await snapshot();
      assert.equal(restarted.difficulty, 'easy');
      assert.equal(restarted.phase, 'countdown');
      assert.equal(restarted.remaining, 5400);
      assert.deepEqual(restarted.fighters.map(fighter => fighter.health), [100, 100]);
      assert.equal((await voiceCalls()).at(-1).cue, '3');
    }
    await advance(95500);
    assert.equal(await page.locator('#result-dialog').isVisible(), true);
    await click('play-again'); await advance(80);
    assert.equal((await snapshot()).difficulty, 'easy');
    assert.equal((await snapshot()).phase, 'countdown');
    assert.equal((await voiceCalls()).at(-1).cue, '3');
    await press('Escape'); await click('pause-home');
  });

  await check('难度刷新后保留，非法存储回退中等，禁止存储时本页仍可切换', async () => {
    const storedContext = await browser.newContext({ offline: engine !== 'webkit' });
    await storedContext.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
    const storedPage = await storedContext.newPage();
    storedPage.on('pageerror', error => report.errors.push(error.message));
    storedPage.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    async function load() {
      if (engine === 'webkit') await storedContext.setOffline(false);
      await storedPage.goto(pathToFileURL(path.join(root, 'index.html')).href);
      if (engine === 'webkit') await storedContext.setOffline(true);
      await storedPage.waitForFunction(() => LuluGame.ready);
    }
    try {
      await load();
      await storedPage.locator('#settings-open').click();
      await storedPage.locator('#ai-difficulty').selectOption('hard');
      await storedPage.locator('#settings-done').click();
      await load();
      assert.equal((await storedPage.evaluate(() => LuluGame.snapshot())).settings.difficulty, 'hard');
      assert.equal(await storedPage.locator('#solo-difficulty').innerText(), '困难难度');
      for (const invalid of ['unknown', '__proto__', 'constructor']) {
        await storedPage.evaluate(value => localStorage.setItem('lulu-difficulty', value), invalid);
        await load();
        assert.equal((await storedPage.evaluate(() => LuluGame.snapshot())).settings.difficulty, 'medium');
      }
      await storedPage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
      await load();
      assert.equal((await storedPage.evaluate(() => LuluGame.snapshot())).settings.difficulty, 'medium');
      await storedPage.locator('#settings-open').click();
      await storedPage.locator('#ai-difficulty').selectOption('hell');
      assert.match(await storedPage.locator('#settings-status').innerText(), /仅在当前页面有效/);
      await storedPage.locator('#settings-close').click();
      await storedPage.locator('#start-solo').click();
      assert.equal((await storedPage.evaluate(() => LuluGame.snapshot())).difficulty, 'hell');
    } finally { await storedContext.close(); }
  });

  await check('小窗口设置可见且无溢出，双人模式不使用人机难度', async () => {
    await click('settings-open');
    await page.locator('#ai-difficulty').selectOption('hell');
    for (const [width, height] of [[390, 844], [340, 700]]) {
      await page.setViewportSize({ width, height }); await advance(50);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const dialog = await page.locator('#settings-dialog').boundingBox();
      const select = await page.locator('#ai-difficulty').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width && dialog.y >= 0 && dialog.y + dialog.height <= height);
      assert.ok(select.height >= 44);
      await capture(`settings-${width}`);
    }
    await click('settings-close');
    assert.equal(await page.locator('#settings-open').isVisible(), true);
    await capture('small-home-hell');
    await click('start-duo'); await advance(3300);
    assert.equal((await snapshot()).difficulty, null);
    assert.equal((await snapshot()).settings.difficulty, 'hell');
    assert.equal(await page.locator('#opponent-label').innerText(), 'P2 · 玩家');
    const before = await snapshot();
    await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft'); await advance(200);
    await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
    assert.ok((await snapshot()).fighters[0].x > before.fighters[0].x);
    assert.ok((await snapshot()).fighters[1].x < before.fighters[1].x);
    await click('settings-open');
    const frame = (await snapshot()).frame;
    await page.locator('#ai-difficulty').selectOption('medium'); await advance(200);
    assert.equal((await snapshot()).frame, frame);
    assert.equal((await snapshot()).difficulty, null);
    assert.equal(await page.locator('#opponent-label').innerText(), 'P2 · 玩家');
    await click('settings-done');
    assert.equal((await snapshot()).paused, false);
    await press('Escape'); await click('pause-home');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await check('五张地图与小窗口的倒计时均不遮挡 HUD', async () => {
    await click('start-duo');
    for (const map of ['garden', 'beach', 'sakura', 'snow', 'city']) {
      if ((await snapshot()).map !== map) await page.evaluate(target => {
        const choices = Object.keys(Artwork.MAPS).filter(candidate => candidate !== LuluGame.snapshot().map);
        const random = Math.random;
        try {
          Math.random = () => (choices.indexOf(target) + 0.5) / choices.length;
          document.getElementById('quick-restart').click();
        } finally { Math.random = random; }
      }, map);
      await advance(250);
      assert.equal((await snapshot()).map, map);
      const cue = await page.locator('.countdown-cue').boundingBox();
      const hud = await page.locator('#battle-hud').boundingBox();
      assert.ok(cue.y > hud.y + hud.height, `${map} 数字与 HUD 不重叠`);
      await capture(`intro-map-${map}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await click('quick-restart'); await advance(250);
    const cue = await page.locator('.countdown-cue').boundingBox();
    const hud = await page.locator('#battle-hud').boundingBox();
    assert.ok(cue.y > hud.y + hud.height);
    assert.equal((await introAnimation()).length, 2);
    await capture('small-countdown-animated');
    assert.equal(await page.locator('#countdown-overlay > span').isVisible(), false);
    await advance(3000);
    const banner = await page.locator('#fight-banner').boundingBox();
    assert.ok(banner.y > hud.y + hud.height);
    await capture('small-intro-start');
    await press('Escape'); await click('pause-home');
  });

  await check('十八种窗口尺寸的首页与对战均一屏展示，画布等比、HUD 与倒计时不重叠', async () => {
    report.layouts = [];
    async function verifyLayout() {
      const layout = await page.evaluate(() => {
        const playing = LuluGame.snapshot().phase !== 'home';
        const targets = ['brand-home', 'settings-open', 'sound-toggle', 'help-open', 'game-canvas', ...(playing ? ['battle-hud', 'opponent-label', 'pause-open', 'quick-restart', 'battle-controls'] : ['start-solo', 'start-duo'])];
        const box = element => {
          const rect = element.getBoundingClientRect();
          return { id: element.id, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        return {
          viewport: [innerWidth, innerHeight], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          phase: LuluGame.snapshot().phase, elements: targets.map(id => box(document.getElementById(id))),
          cue: playing ? box(document.querySelector('.countdown-cue')) : null,
          headingOverflow: playing ? [...document.querySelectorAll('.fighter-heading')].map(element => element.scrollWidth - element.clientWidth) : [],
          overflow: [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY]
        };
      });
      const [width, height] = layout.viewport;
      const name = `${width}×${height} ${layout.phase}`;
      assert.ok(layout.document[0] <= width && layout.document[1] <= height, `${name} 页面溢出：${layout.document}`);
      assert.ok(layout.overflow.every(value => !['hidden', 'clip'].includes(value)), `${name} 不靠裁切隐藏滚动`);
      for (const box of layout.elements) assert.ok(box.width > 0 && box.height > 0 && box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${name} ${box.id} 不完整可见：${JSON.stringify(box)}`);
      const canvas = layout.elements.find(element => element.id === 'game-canvas');
      assert.ok(Math.abs(canvas.width * 620 / 1280 - canvas.height) < 1, `${name} 画布比例改变`);
      assert.ok(layout.headingOverflow.every(overflow => overflow <= 1), `${name} 血条名称溢出`);
      if (layout.cue) assert.ok(layout.cue.y > layout.elements.find(element => element.id === 'battle-hud').bottom, `${name} 倒计时遮挡 HUD`);
      report.layouts.push(layout);
    }
    await click('settings-open'); await page.locator('#ai-difficulty').selectOption('hell'); await click('settings-done');
    for (const [width, height] of [[1920, 1080], [1440, 1000], [1440, 900], [1366, 768], [1280, 800], [1280, 720], [1024, 768], [1024, 600], [768, 700], [820, 1180], [390, 844], [340, 700], [320, 568], [844, 390], [667, 375], [568, 320], [1280, 400], [640, 480]]) {
      await page.setViewportSize({ width, height }); await advance(50);
      await verifyLayout(); await capture(`home-${width}x${height}`);
      await click('start-solo'); await advance(250);
      assert.equal((await snapshot()).difficulty, 'hell');
      await verifyLayout();
      if ([1280, 1024, 844, 568, 320].includes(width)) await capture(`layout-${width}x${height}`);
      await advance(3000);
      const banner = await page.locator('#fight-banner').boundingBox();
      const hud = await page.locator('#battle-hud').boundingBox();
      assert.ok(banner.y > hud.y + hud.height, `${width}×${height} 开战字幕遮挡 HUD`);
      await press('Escape'); await click('pause-home');
    }
    await click('settings-open'); await page.locator('#ai-difficulty').selectOption('medium'); await click('settings-done');
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await check('缩小动态效果、键盘焦点与短屏弹窗内部滚动，缩放不重置对局', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await advance(100);
    await click('start-duo'); await advance(250);
    assert.equal(await page.locator('#countdown-number').innerText(), '3');
    assert.deepEqual(await introAnimation(), []);
    assert.equal(await page.locator('.countdown-stars').isVisible(), false);
    assert.equal((await voiceCalls()).at(-1).played, true);
    await capture('small-countdown');
    await advance(2970);
    assert.equal((await snapshot()).phase, 'fighting');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await capture('small-duo');
    await press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume-game');
    await press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pause-restart');
    await press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume-game');
    await press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pause-home');
    await press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resume-game');
    await press('Escape');
    assert.equal((await snapshot()).paused, false);
    await click('settings-open');
    const paused = await snapshot();
    for (const [width, height] of [[568, 320], [320, 568], [1280, 720]]) {
      await page.setViewportSize({ width, height }); await advance(200);
      assert.deepEqual(await snapshot(), paused);
      const bounds = await page.locator('#settings-dialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 568, height: 320 });
    assert.ok(await page.locator('#settings-dialog').evaluate(dialog => dialog.scrollHeight > dialog.clientHeight));
    await capture('short-settings');
    await click('settings-done');
    assert.equal((await snapshot()).paused, false);
    await click('help-open');
    assert.ok(await page.locator('#help-dialog').evaluate(dialog => dialog.scrollHeight > dialog.clientHeight));
    await click('help-done');
    await press('Escape'); await click('resume-game');
    assert.equal((await snapshot()).frame, paused.frame);
    await page.setViewportSize({ width: 390, height: 844 }); await advance(200);
    assert.ok((await snapshot()).frame > paused.frame);
  });

  await check('首次点击解锁即可播放内嵌语音，空语音表回退原提示音', async () => {
    const freshPage = await browserContext.newPage();
    try {
      await freshPage.clock.install();
      if (engine === 'webkit') await browserContext.setOffline(false);
      await freshPage.goto(pathToFileURL(path.join(root, 'index.html')).href);
      if (engine === 'webkit') await browserContext.setOffline(true);
      await freshPage.waitForFunction(() => LuluGame.ready);
      await attachVoiceProbe(freshPage);
      assert.equal(await freshPage.evaluate(() => LuluGame.snapshot().audio.state), 'locked');
      await freshPage.locator('#start-duo').click();
      await freshPage.clock.runFor(100);
      const first = await freshPage.evaluate(() => ({ call: window.__introProbe.calls[0], state: LuluGame.snapshot().audio.state }));
      assert.equal(first.state, 'running');
      assert.equal(first.call.cue, '3');
      assert.equal(first.call.played, true);
      assert.equal(first.call.length, voiceLengths['3']);
      const fallback = await freshPage.evaluate(async () => {
        const player = new Soundtrack.Player({});
        await player.unlock();
        player.playVoice('3');
        const valid = player.voice.buffer === player.buffer('countdown');
        player.stopVoice();
        await player.context.close();
        return valid;
      });
      assert.equal(fallback, true);
    } finally { await freshPage.close(); }
  });

  await check('全过程无页面错误、无失败资源、无任何 HTTP/HTTPS 请求', async () => {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.externalRequests, []);
    const networkResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).map(entry => entry.name));
    assert.deepEqual(networkResources, []);
  });

  await check('WebGL 和音频不可用时保留二维角色，倒计时和离线对战不阻塞', async () => {
    const fallbackPage = await browserContext.newPage();
    try {
      await fallbackPage.addInitScript(() => {
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...options) {
          return type === 'webgl2' ? null : getContext.call(this, type, ...options);
        };
      });
      await fallbackPage.clock.install();
      if (engine === 'webkit') await browserContext.setOffline(false);
      await fallbackPage.goto(pathToFileURL(path.join(root, 'index.html')).href);
      if (engine === 'webkit') await browserContext.setOffline(true);
      await fallbackPage.waitForFunction(() => LuluGame.ready);
      assert.equal(await fallbackPage.evaluate(() => Character3D.status().state), 'fallback');
      await fallbackPage.locator('#start-duo').click();
      await fallbackPage.clock.runFor(3300);
      const initial = await fallbackPage.evaluate(() => LuluGame.snapshot());
      assert.equal(initial.phase, 'fighting');
      await fallbackPage.keyboard.down('KeyD');
      await fallbackPage.clock.runFor(250);
      await fallbackPage.keyboard.up('KeyD');
      assert.ok((await fallbackPage.evaluate(() => LuluGame.snapshot())).fighters[0].x > initial.fighters[0].x);
    } finally { await fallbackPage.close(); }
  });
  report.passed = true;
  console.log(`浏览器验收完成：${engine} ${report.version}，${report.checks.length} 项通过。`);
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  if (page) await page.screenshot({ path: path.join(output, `${engine}-failure.png`), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, `${engine}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
