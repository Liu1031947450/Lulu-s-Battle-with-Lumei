import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Battle from '../src/engine.js';
import { Session, InputBuffer, roomCode, normalizeCode, packState, validState } from '../src/network.mjs';

const wait = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(condition(), '等待状态超时');
}

function transport() {
  const peers = new Map();
  let nextId = 0;
  class Connection extends EventEmitter {
    constructor() { super(); this.open = false; this.closed = false; this.sent = []; this.dataChannel = { bufferedAmount: 0 }; }
    send(wire) {
      this.sent.push(wire);
      queueMicrotask(() => { if (this.other.open) this.other.emit('data', wire); });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.open = false;
      this.emit('close');
      this.other?.close();
    }
  }
  class Peer extends EventEmitter {
    constructor(id = `guest-${++nextId}`) {
      super();
      this.id = id;
      this.connections = [];
      this.destroyed = false;
      const occupied = peers.has(id);
      if (!occupied) peers.set(id, this);
      setImmediate(() => {
        if (this.destroyed) return;
        if (occupied) this.emit('error', { type: 'unavailable-id' });
        else this.emit('open', id);
      });
    }
    connect(id) {
      const outgoing = new Connection();
      this.connections.push(outgoing);
      const target = peers.get(id);
      if (!target) { setImmediate(() => this.emit('error', { type: 'peer-unavailable' })); return outgoing; }
      const incoming = new Connection();
      outgoing.other = incoming;
      incoming.other = outgoing;
      target.connections.push(incoming);
      setImmediate(() => {
        if (this.destroyed || target.destroyed) return;
        target.emit('connection', incoming);
        outgoing.open = incoming.open = true;
        incoming.emit('open');
        outgoing.emit('open');
      });
      return outgoing;
    }
    destroy() {
      this.destroyed = true;
      if (peers.get(this.id) === this) peers.delete(this.id);
      this.connections.forEach(connection => connection.close());
    }
  }
  return { peers, makePeer: id => new Peer(id) };
}

async function pair(context, options = {}) {
  const network = transport();
  const hostEvents = [];
  const guestEvents = [];
  let match = new Battle.Match({ mode: 'duo', seed: 1 });
  const host = new Session({ ...network, ...options, onEvent(type, data) {
    hostEvents.push({ type, data: structuredClone(data) });
    if (type === 'control') match.pause(data.paused);
    if (type === 'rematch') {
      match = new Battle.Match({ mode: 'duo', seed: 2 });
      host.beginRound(match, 'beach');
    }
  } });
  const guest = new Session({ ...network, ...options, onEvent: (type, data) => guestEvents.push({ type, data: structuredClone(data) }) });
  context.after(() => { guest.close('', false); host.close('', false); });
  await host.createRoom();
  await until(() => host.state === 'waiting');
  await guest.joinRoom(host.code);
  await until(() => host.connected && guest.connected);
  host.beginRound(match, 'garden');
  await until(() => guest.round === 1);
  return { host, guest, hostEvents, guestEvents, network, get match() { return match; } };
}

test('房间码格式、大小写规范化，以及持续按键和单次动作不丢不重', () => {
  for (let index = 0; index < 100; index += 1) assert.match(roomCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(normalizeCode(' abcd2345 '), 'ABCD2345');
  for (const invalid of ['ABC', 'ABCD0123', '<script>', 'ABCDEFGI']) assert.equal(normalizeCode(invalid), '');
  const input = new InputBuffer();
  assert.equal(input.push({ ...Battle.EMPTY_INPUT, attack: true, right: true }, 1), true);
  assert.equal(input.push({ ...Battle.EMPTY_INPUT }, 2), true);
  assert.equal(input.push({ ...Battle.EMPTY_INPUT, attack: true }, 1), false);
  assert.equal(input.take().attack, true);
  assert.deepEqual(input.take(), Battle.EMPTY_INPUT);
  input.push({ ...Battle.EMPTY_INPUT, jump: true }, 3);
  input.push({ ...Battle.EMPTY_INPUT, jump: true, run: true }, 4);
  assert.equal(input.take().jump, true);
  assert.equal(input.take().jump, true);
  assert.equal(input.take().jump, false);
  assert.equal(input.take().run, true);
  input.clear();
  assert.deepEqual(input.take(), Battle.EMPTY_INPUT);
  assert.equal(input.push({ attack: 'true' }, 5), false);
});

test('渲染快照覆盖完整战斗，拒绝损坏、非有限值和越界数据', () => {
  const match = new Battle.Match({ mode: 'duo', aiBoth: true, seed: 3 });
  for (let frame = 0; frame < 6000; frame += 1) {
    match.step();
    if (frame % 20 === 0) assert.equal(validState(packState(match)), true, `frame ${frame}`);
  }
  const state = packState(match);
  assert.equal(state.fighters[0].brain, undefined);
  assert.equal(state.random, undefined);
  state.fighters[0].x = Infinity;
  assert.equal(validState(state), false);
  state.fighters[0].x = 200;
  state.fighters[0].health = 101;
  assert.equal(validState(state), false);
  state.fighters[0].health = 10;
  state.fighters[0].move = { kind: 'attack', frame: {} };
  assert.equal(validState(state), false);
});

test('房间码碰撞自动重试，取消后迟到的连接不会重新开房', async context => {
  const network = transport();
  const first = new Session({ ...network, makeCode: () => 'ABCDEFGH' });
  let attempts = 0;
  const second = new Session({ ...network, makeCode: () => ++attempts === 1 ? 'ABCDEFGH' : 'ABCDEFGJ' });
  context.after(() => { first.close(); second.close(); });
  await first.createRoom();
  await until(() => first.state === 'waiting');
  await second.createRoom();
  await until(() => second.state === 'waiting');
  assert.equal(second.code, 'ABCDEFGJ');
  assert.equal(attempts, 2);
  let resolvePeer;
  const cancelled = new Session({ makePeer: () => new Promise(resolve => { resolvePeer = resolve; }) });
  const opening = cancelled.createRoom();
  cancelled.close();
  const late = network.makePeer('late-peer');
  resolvePeer(late);
  await opening;
  assert.equal(late.destroyed, true);
  assert.equal(cancelled.closed, true);
});

test('房间不存在、满员和版本不符有明确结果，不挤掉原有对手', async context => {
  const { host, guest, network } = await pair(context);
  const failures = [];
  const third = new Session({ ...network, onEvent: (type, data) => { if (type === 'closed') failures.push(data); } });
  context.after(() => third.close());
  await third.joinRoom(host.code);
  await until(() => third.closed);
  assert.match(failures[0], /房间已满/);
  assert.equal(guest.connected, true);
  const missing = new Session({ ...network, onEvent: (type, data) => { if (type === 'closed') failures.push(data); } });
  context.after(() => missing.close());
  await missing.joinRoom('ZZZZZZZZ');
  await until(() => missing.closed);
  assert.match(failures[1], /不存在/);
  const waiting = new Session({ ...network });
  const old = new Session({ ...network, build: 'old-version', onEvent: (type, data) => { if (type === 'closed') failures.push(data); } });
  context.after(() => { old.close(); waiting.close(); });
  await waiting.createRoom();
  await until(() => waiting.state === 'waiting');
  await old.joinRoom(waiting.code);
  await until(() => old.closed);
  assert.match(failures[2], /版本不同/);
  assert.equal(waiting.state, 'waiting');
});

test('输入、双帧事件合并、快照去重及旧对局消息隔离', async context => {
  const { host, guest, guestEvents, match } = await pair(context);
  guest.sendInput({ ...Battle.EMPTY_INPUT, attack: true });
  guest.sendInput({ ...Battle.EMPTY_INPUT });
  await wait();
  assert.equal(host.takeInput().attack, true);
  assert.equal(host.takeInput().attack, false);
  host.publish(match, match.step());
  host.publish(match, match.step());
  await wait();
  const snapshots = guestEvents.filter(event => event.type === 'snapshot');
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].data.events[0].kind, 'countdown');
  const wire = host.connection.sent.at(-1);
  guest.receive(wire);
  assert.equal(guestEvents.filter(event => event.type === 'snapshot').length, 1);
  match.pause(true);
  host.publish(match, [], true);
  await wait();
  assert.equal(guestEvents.filter(event => event.type === 'snapshot').at(-1).data.state.paused, true);
  guest.send('snapshot', { state: packState(match), events: [] });
  await wait();
  assert.equal(host.lastFrame, -1);
  host.beginRound(new Battle.Match({ mode: 'duo' }), 'snow');
  await wait();
  guest.receive(JSON.stringify({ ...JSON.parse(wire), seq: 100000 }));
  assert.equal(guest.round, 2);
  assert.equal(guest.lastFrame, -1);
});

test('暂停清空输入，同时确认可恢复；双方同意重开才更换对局', async context => {
  const game = await pair(context);
  game.guest.sendInput({ ...Battle.EMPTY_INPUT, right: true, jump: true });
  await wait();
  game.host.pause('help');
  await wait();
  assert.deepEqual(game.host.takeInput(), Battle.EMPTY_INPUT);
  assert.equal(game.guest.control.paused, true);
  game.guest.vote('resume');
  game.host.vote('resume');
  await wait();
  assert.equal(game.host.control.paused, false);
  assert.equal(game.guest.control.paused, false);
  game.guest.vote('restart');
  await wait();
  assert.equal(game.host.round, 1);
  assert.equal(game.host.control.paused, true);
  game.host.vote('restart');
  await wait();
  assert.equal(game.host.round, 2);
  assert.equal(game.guest.round, 2);
  assert.equal(game.guestEvents.filter(event => event.type === 'start').at(-1).data.map, 'beach');
  assert.deepEqual(game.match.fighters.map(fighter => fighter.health), [100, 100]);
  game.host.pause('pause');
  await wait();
  game.guest.vote('resume');
  game.host.pause('settings');
  await wait();
  assert.deepEqual(game.host.control.resume, [false, false]);
  assert.equal(game.host.control.paused, true);
});

test('3 秒冻结、10 秒断线和 20 秒连接超时；信令断开不影响已建立的对战', async context => {
  let time = 0;
  const { host, guest, hostEvents } = await pair(context, { now: () => time });
  host.peer.emit('disconnected');
  assert.equal(host.connected, true);
  time = 3001;
  host.tick();
  assert.equal(host.stalled, true);
  assert.equal(host.control.paused, true);
  await wait();
  assert.equal(host.stalled, false);
  assert.equal(guest.control.paused, true);
  time = 14000;
  host.tick();
  assert.equal(host.closed, true);
  assert.match(hostEvents.at(-1).data, /10 秒/);
  let failure = '';
  const neverOpen = new Session({ now: () => time, makePeer: () => Object.assign(new EventEmitter(), { destroy() {} }), onEvent: (type, data) => { if (type === 'closed') failure = data; } });
  await neverOpen.createRoom();
  time += 20001;
  neverOpen.tick();
  assert.equal(neverOpen.closed, true);
  assert.match(failure, /连接超时/);
});

test('退出与异常报文清理连接；慢连接积压不漏掉命中事件', async context => {
  const { host, guest, guestEvents, match } = await pair(context);
  host.connection.dataChannel.bufferedAmount = 70000;
  host.publish(match, match.step());
  host.publish(match, match.step());
  assert.equal(host.events.length, 1);
  host.connection.dataChannel.bufferedAmount = 0;
  host.publish(match, match.step());
  host.publish(match, match.step());
  await wait();
  assert.equal(guestEvents.filter(event => event.type === 'snapshot').at(-1).data.events.length, 1);
  guest.receive('x'.repeat(32769));
  assert.equal(guest.closed, true);
  assert.equal(host.closed, true);
  assert.deepEqual(host.takeInput(), Battle.EMPTY_INPUT);
});
