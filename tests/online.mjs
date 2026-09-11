import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from '../scripts/browser-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'artifacts');
await mkdir(output, { recursive: true });
const browsers = [];
const report = { date: new Date().toISOString(), passed: false, checks: [], errors: [], signaling: [], crossNetwork: false, environment: 'Two independent browser processes on one machine; real public PeerJS signaling and WebRTC, not a WAN traversal test.' };
let server;
let host;
let guest;
let failure;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const snapshot = page => page.evaluate(() => LuluGame.snapshot());
async function check(name, action) { await action(); report.checks.push(name); console.log(`✓ ${name}`); }
async function resumeBoth() {
  await Promise.all([host.locator('#resume-game').click(), guest.locator('#resume-game').click()]);
  await Promise.all([host, guest].map(page => page.waitForFunction(() => !LuluGame.snapshot().paused)));
}

try {
  let url = process.env.ONLINE_URL;
  if (!url) {
    const html = await readFile(path.join(root, 'index.html'));
    server = createServer((request, response) => {
      if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  }
  report.entry = url;
  const externalRequests = [];
  for (let index = 0; index < 2; index += 1) {
    const browser = await launchBrowser();
    browsers.push(browser);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(25000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('websocket', socket => report.signaling.push(socket.url().replace(/token=[^&]+/g, 'token=REDACTED')));
    page.on('request', request => { if (new URL(request.url()).origin !== new URL(url).origin) externalRequests.push(request.url()); });
    const response = await page.goto(url);
    if (index === 0) report.bundleSHA256 = createHash('sha256').update(await response.body()).digest('hex');
    await page.waitForFunction(() => window.LuluGame?.ready);
    await page.evaluate(() => {
      const add = Artwork.Effects.prototype.add;
      window.__onlineEvents = [];
      Artwork.Effects.prototype.add = function (event, reduced) { window.__onlineEvents.push(event.kind); return add.call(this, event, reduced); };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) {
        if (window.__denyClipboard) throw new Error('clipboard denied for test');
        window.__copiedText = text;
      } } });
    });
    if (index === 0) host = page;
    else guest = page;
  }

  await check('首页不连接联机服务，房间弹窗输入框可用 Tab 到达', async () => {
    assert.equal(externalRequests.length, 0);
    assert.equal(report.signaling.length, 0);
    await host.setViewportSize({ width: 568, height: 320 });
    assert.ok(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.screenshot({ path: path.join(output, 'online-home.png') });
    await host.locator('#start-online').click();
    await host.keyboard.press('Tab');
    assert.equal(await host.evaluate(() => document.activeElement.id), 'room-code');
    assert.equal((await snapshot(host)).phase, 'home');
  });

  let code;
  let invitation;
  await check('公共服务真实建房、8位房间码、邀请链接及复制失败降级', async () => {
    await host.locator('#create-room').click();
    await host.waitForFunction(() => LuluGame.snapshot().network?.state === 'waiting');
    code = await host.locator('#created-code').inputValue();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    await host.locator('#copy-room').click();
    assert.equal(await host.evaluate(() => window.__copiedText), code);
    await host.locator('#copy-invite').click();
    invitation = await host.evaluate(() => window.__copiedText);
    assert.equal(new URL(invitation).hash, `#room=${code}`);
    await host.evaluate(() => { window.__denyClipboard = true; });
    await host.locator('#copy-room').click();
    await host.waitForFunction(() => document.getElementById('online-status').textContent.includes('Ctrl+C'));
    assert.deepEqual(await host.locator('#created-code').evaluate(input => [input.selectionStart, input.selectionEnd]), [0, 8]);
    await host.screenshot({ path: path.join(output, 'online-room.png') });
  });

  await check('邀请链接只预填，点击加入后双方共享地图及开场倒计时', async () => {
    await guest.goto(invitation);
    await guest.waitForFunction(() => window.LuluGame?.ready);
    await guest.evaluate(() => {
      if (window.__onlineEvents) return;
      const add = Artwork.Effects.prototype.add;
      window.__onlineEvents = [];
      Artwork.Effects.prototype.add = function (event, reduced) { window.__onlineEvents.push(event.kind); return add.call(this, event, reduced); };
    });
    await guest.waitForFunction(code => document.getElementById('room-code').value === code, code);
    assert.equal(await guest.locator('#room-code').inputValue(), code);
    assert.equal((await snapshot(guest)).network, null);
    await guest.locator('#join-room').click();
    await Promise.all([host, guest].map(page => page.waitForFunction(() => LuluGame.snapshot().phase === 'fighting')));
    const states = await Promise.all([snapshot(host), snapshot(guest)]);
    assert.equal(states[0].mode, 'online');
    assert.equal(states[1].network.role, 'guest');
    assert.equal(states[0].map, states[1].map);
    assert.equal(states[0].network.build, states[1].network.build);
    report.build = states[0].network.build;
    for (const page of [host, guest]) {
      assert.deepEqual(await page.evaluate(() => window.__onlineEvents.filter(kind => kind === 'countdown' || kind === 'fight')), ['countdown', 'countdown', 'countdown', 'fight']);
    }
  });

  await check('加入者使用 WASD 控制噜妹，房主收到移动和跳跃', async () => {
    const initial = await snapshot(host);
    await guest.keyboard.down('a');
    await guest.keyboard.press('w');
    await sleep(400);
    await guest.keyboard.up('a');
    const current = await snapshot(host);
    assert.ok(current.fighters[1].x < initial.fighters[1].x - 20);
    assert.equal(current.fighters[1].jumps, 1);
    assert.equal(current.fighters[0].x, initial.fighters[0].x);
    await sleep(1200);
  });

  await check('同步暂停冻结同一帧，公共连接拒绝第三人，同时确认恢复', async () => {
    await host.locator('#pause-open').click();
    await guest.waitForFunction(() => LuluGame.snapshot().paused && LuluGame.snapshot().network.control.paused);
    await host.setViewportSize({ width: 568, height: 320 });
    assert.ok(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    await host.setViewportSize({ width: 1280, height: 900 });
    await sleep(150);
    const first = await snapshot(host);
    const second = await snapshot(guest);
    assert.equal(first.frame, second.frame);
    assert.equal(first.remaining, second.remaining);
    assert.deepEqual(first.fighters, second.fighters);
    await sleep(200);
    assert.equal((await snapshot(host)).frame, first.frame);
    const rejection = await host.evaluate(code => new Promise(resolve => {
      const timer = setTimeout(() => { extra.close(); resolve('timeout'); }, 23000);
      const extra = new Online.Session({ onEvent(type, data) { if (type === 'closed') { clearTimeout(timer); resolve(data); } } });
      void extra.joinRoom(code);
    }), code);
    assert.match(rejection, /房间已满/);
    await guest.locator('#resume-game').click();
    await host.waitForFunction(() => LuluGame.snapshot().network.control.resume[1]);
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await host.waitForFunction(() => LuluGame.snapshot().network.control.resume.every(ready => !ready));
    assert.equal((await snapshot(host)).paused, true);
    await resumeBoth();
  });

  await check('设置、帮助和失焦均暂停双方，关闭弹窗后不单方面恢复', async () => {
    await guest.locator('#settings-open').click();
    await host.waitForFunction(() => LuluGame.snapshot().paused);
    await guest.locator('#ai-difficulty').selectOption('hell');
    await guest.locator('#settings-done').click();
    assert.equal((await snapshot(guest)).paused, true);
    assert.equal((await snapshot(guest)).difficulty, null);
    await resumeBoth();
    await host.locator('#help-open').click();
    await guest.waitForFunction(() => LuluGame.snapshot().paused);
    await host.locator('#help-done').click();
    await resumeBoth();
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await host.waitForFunction(() => LuluGame.snapshot().paused);
    await resumeBoth();
  });

  await check('双方真实键盘普攻、防御、技能与 KO 结算一致', async () => {
    await host.keyboard.down('d');
    await host.waitForFunction(() => { const fighters = LuluGame.snapshot().fighters; return Math.abs(fighters[1].x - fighters[0].x) < 105; });
    await host.keyboard.up('d');
    await guest.keyboard.down('l');
    await sleep(100);
    await host.keyboard.press('j');
    await sleep(700);
    const blocked = await snapshot(host);
    assert.ok(blocked.fighters[1].health < 100 && blocked.fighters[1].health > 90);
    await guest.keyboard.up('l');
    await guest.keyboard.press('k');
    await sleep(900);
    assert.ok((await snapshot(host)).fighters[0].health < 100);
    await host.screenshot({ path: path.join(output, 'online-battle.png') });
    await host.keyboard.down('d');
    for (let attack = 0; attack < 80 && (await snapshot(host)).phase !== 'finished'; attack += 1) {
      await host.keyboard.press(attack % 7 === 0 ? 'k' : 'j');
      await sleep(500);
    }
    await host.keyboard.up('d');
    await Promise.all([host, guest].map(page => page.locator('#result-dialog[open]').waitFor()));
    const states = await Promise.all([snapshot(host), snapshot(guest)]);
    assert.deepEqual(states[0].result, states[1].result);
    assert.equal(states[0].result.reason, 'ko');
    assert.deepEqual(states[0].fighters.map(fighter => fighter.health), states[1].fighters.map(fighter => fighter.health));
    report.result = states[0].result;
  });

  await check('再来一局必须双方确认，重置血量并同步新地图和对局编号', async () => {
    const previous = await snapshot(host);
    await host.locator('#play-again').click();
    await sleep(150);
    assert.equal((await snapshot(host)).network.round, previous.network.round);
    await guest.locator('#play-again').click();
    await Promise.all([host, guest].map(page => page.waitForFunction(() => LuluGame.snapshot().network?.round === 2)));
    const states = await Promise.all([snapshot(host), snapshot(guest)]);
    assert.equal(states[0].map, states[1].map);
    assert.notEqual(states[0].map, previous.map);
    assert.deepEqual(states[0].fighters.map(fighter => fighter.health), [100, 100]);
    assert.deepEqual(states[1].fighters.map(fighter => fighter.health), [100, 100]);
  });

  await check('关闭对方页面结束房间，主机可以回到本地玩法，无页面异常', async () => {
    await guest.close();
    await host.waitForFunction(() => LuluGame.snapshot().network === null && document.getElementById('online-dialog').open);
    assert.match(await host.locator('#online-status').textContent(), /离开|中断|结束/);
    await host.locator('#online-close').click();
    await host.locator('#start-duo').click();
    assert.equal((await snapshot(host)).mode, 'duo');
    assert.equal((await snapshot(host)).network, null);
    assert.ok(report.signaling.length >= 2);
    assert.deepEqual(report.errors, []);
  });
  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = error.stack;
  for (const [name, page] of [['host', host], ['guest', guest]]) {
    if (!page || page.isClosed()) continue;
    try {
      report[name] = await snapshot(page);
      report[`${name}Status`] = await page.locator('#online-status').textContent();
      await page.screenshot({ path: path.join(output, `online-failure-${name}.png`) });
    } catch {}
  }
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
  if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, process.env.ONLINE_URL ? 'online-live-report.json' : 'online-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (failure) throw failure;
console.log(`联机验收完成：${report.checks.length} 项；跨网络穿透未验证。`);
