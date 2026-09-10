import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchBrowser } from '../scripts/browser-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const engine = process.env.TEST_BROWSER || 'chromium';
const output = path.join(root, 'artifacts');
await mkdir(output, { recursive: true });
const browser = await launchBrowser(engine);
const report = { browser: engine, version: browser.version(), date: new Date().toISOString(), entry: 'file:// index.html', offline: true, offlineStrategy: engine === 'webkit' ? 'HTTP/HTTPS blocked before file navigation; offline emulation enabled immediately after load' : 'offline emulation before file navigation', checks: [], screenshots: [], errors: [], externalRequests: [] };
report.bundleSHA256 = createHash('sha256').update(await readFile(path.join(root, 'index.html'))).digest('hex');
let page;

async function check(name, action) {
  await action();
  report.checks.push(name);
  console.log(`✓ ${name}`);
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
  const snapshot = () => page.evaluate(() => window.LuluGame.snapshot());
  const advance = milliseconds => page.clock.runFor(milliseconds);
  const click = id => page.locator(`#${id}`).click();
  const press = key => page.keyboard.press(key);
  async function capture(name) {
    const filename = `${engine}-${name}.png`;
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
    report.screenshots.push(filename);
  }
  async function freshDuo() {
    if ((await snapshot()).phase === 'home') await click('start-duo');
    else if (await page.locator('#result-dialog').evaluate(dialog => dialog.open)) await click('play-again');
    else await click('quick-restart');
    await advance(3220);
    assert.equal((await snapshot()).phase, 'fighting');
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

  await check('双人模式三秒倒计时和初始 HUD', async () => {
    await click('start-duo');
    assert.equal((await snapshot()).phase, 'countdown');
    await advance(1600);
    assert.equal((await snapshot()).phase, 'countdown');
    assert.deepEqual((await snapshot()).fighters.map(fighter => fighter.health), [100, 100]);
    await advance(1620);
    assert.equal((await snapshot()).phase, 'fighting');
    assert.equal(await page.locator('#opponent-label').innerText(), 'P2 · 玩家');
    await capture('duo');
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
  });

  await check('完整人机对局：AI 主动移动攻防，真实键盘玩家参与并正常结算', async () => {
    await click('start-solo'); await advance(3220);
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
      await advance(500); await press('KeyR');
      const state = await snapshot();
      assert.equal(state.phase, 'countdown'); assert.equal(state.remaining, 5400);
      assert.deepEqual(state.fighters.map(fighter => fighter.health), [100, 100]);
      assert.equal(state.projectiles, 0); assert.equal(state.effects, 0);
    }
    await press('Escape'); await click('pause-home');
    assert.equal((await snapshot()).phase, 'home');
  });

  await check('五种窗口尺寸、缩小动态效果、键盘焦点与无横向溢出', async () => {
    for (const [width, height] of [[1440, 1000], [1280, 800], [1280, 720], [768, 700], [390, 844]]) {
      await page.setViewportSize({ width, height }); await advance(50);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} 横向溢出`);
      await capture(`home-${width}x${height}`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); await advance(100);
    await click('start-duo'); await advance(3220);
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
  });

  await check('全过程无页面错误、无失败资源、无任何 HTTP/HTTPS 请求', async () => {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.externalRequests, []);
    const networkResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).map(entry => entry.name));
    assert.deepEqual(networkResources, []);
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
