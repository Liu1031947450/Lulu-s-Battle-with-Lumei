export const BUILD = typeof __LULU_BUILD__ === 'undefined' ? 'test' : __LULU_BUILD__;
const PROTOCOL = 1;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'lulu-lumei-';
const ACTIONS = ['left', 'right', 'run', 'jump', 'crouch', 'attack', 'skill', 'guard'];
const EDGES = ['jump', 'attack', 'skill'];
const STATES = ['idle', 'walk', 'run', 'jump', 'double-jump', 'crouch', 'rise', 'backstep', 'attack', 'skill', 'guard', 'hit', 'stun', 'defeat', 'victory', 'draw'];
const MAPS = ['garden', 'beach', 'sakura', 'snow', 'city'];
const REASONS = ['pause', 'help', 'settings', 'blur', 'network', 'restart'];
const EVENTS = ['countdown', 'fight', 'finish', 'swing', 'skill', 'jump', 'double-jump', 'bubble', 'land', 'guard', 'hit'];
const REJECTIONS = { full: '房间已满，只能两人对战。', version: '游戏版本不同，请双方刷新网页后重新建房。', protocol: '对方使用的联机协议不兼容。' };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, minimum = 0, maximum = 1e7) => Number.isFinite(value) && value >= minimum && value <= maximum;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const booleans = value => Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'boolean');
const emptyControl = () => ({ epoch: 0, ballot: 0, paused: false, reason: 'pause', resume: [false, false], restart: [false, false] });

export function normalizeCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : '';
}

export function roomCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map(value => ALPHABET[value & 31]).join('');
}

export function validInput(input) {
  return record(input) && Object.keys(input).length === ACTIONS.length && ACTIONS.every(action => typeof input[action] === 'boolean');
}

export class InputBuffer {
  constructor() { this.clear(); }
  clear() {
    this.held = Object.fromEntries(ACTIONS.map(action => [action, false]));
    this.edges = [];
    this.sequence = 0;
  }
  push(input, sequence) {
    if (!validInput(input) || !integer(sequence, 1) || sequence <= this.sequence || this.edges.length >= 32) return false;
    this.sequence = sequence;
    this.held = { ...input, jump: false, attack: false, skill: false };
    if (EDGES.some(action => input[action])) this.edges.push(Object.fromEntries(EDGES.map(action => [action, input[action]])));
    return true;
  }
  take() { return { ...this.held, ...this.edges.shift() }; }
}

export function packState(match) {
  return structuredClone({
    frame: match.frame, phase: match.phase, paused: match.paused, countdown: match.countdown,
    remaining: match.remaining, finishedFrame: match.finishedFrame, result: match.result,
    fighters: match.fighters.map(({ brain, ...fighter }) => fighter), projectiles: match.projectiles
  });
}

export function validState(state) {
  if (!record(state) || !['countdown', 'fighting', 'finished'].includes(state.phase) || typeof state.paused !== 'boolean') return false;
  if (!['frame', 'countdown', 'remaining', 'finishedFrame'].every(key => integer(state[key]) && number(state[key]))) return false;
  if (state.countdown > 180 || state.remaining > 5400 || state.finishedFrame > state.frame) return false;
  if (!Array.isArray(state.fighters) || state.fighters.length !== 2 || !Array.isArray(state.projectiles) || state.projectiles.length > 32) return false;
  const validFighters = state.fighters.every((fighter, index) => {
    if (!record(fighter) || fighter.id !== index || fighter.kind !== ['lulu', 'lumei'][index] || fighter.name !== ['噜噜', '噜妹'][index]) return false;
    if (!STATES.includes(fighter.state) || ![-1, 1].includes(fighter.facing) || !number(fighter.health, 0, 100)) return false;
    if (!['x', 'y', 'previousX', 'velocityX', 'velocityY'].every(key => number(fighter[key], -10000, 10000))) return false;
    if (!['stateFrame', 'jumpFrame', 'jumps', 'cooldown', 'stun', 'protection', 'recovery', 'flash'].every(key => integer(fighter[key]) && number(fighter[key]))) return false;
    if (!['grounded', 'crouching', 'guarding', 'running'].every(key => typeof fighter[key] === 'boolean')) return false;
    if (!record(fighter.stats) || !['hits', 'damage', 'blocked', 'skills'].every(key => number(fighter.stats[key]))) return false;
    const move = fighter.move;
    return move === null || (record(move) && ['attack', 'lulu', 'lumei'].includes(move.kind) && integer(move.id, 1) && number(move.frame, 0, 1000) && ['hit', 'spawned', 'crouched'].every(key => typeof move[key] === 'boolean'));
  });
  const validProjectiles = state.projectiles.every(projectile => record(projectile) && integer(projectile.id, 1) && [0, 1].includes(projectile.owner) && [-1, 1].includes(projectile.facing) && ['x', 'y'].every(key => number(projectile[key], -10000, 10000)) && ['age', 'life'].every(key => number(projectile[key], 0, 1000)));
  const result = state.result;
  const validResult = result === null ? state.phase !== 'finished' : record(result) && state.phase === 'finished' && [0, 1, null].includes(result.winner) && ['ko', 'time'].includes(result.reason) && number(result.seconds, 0, 90) && Array.isArray(result.health) && result.health.length === 2 && result.health.every(health => number(health, 0, 100));
  return validFighters && validProjectiles && validResult;
}

function validEvent(event) {
  if (!record(event) || !integer(event.id, 1) || !EVENTS.includes(event.kind)) return false;
  if (event.kind === 'countdown') return [1, 2, 3].includes(event.number);
  if (event.kind === 'finish') return [0, 1, null].includes(event.winner) && ['ko', 'time'].includes(event.reason);
  if (event.kind === 'fight') return true;
  return [0, 1].includes(event.player) && number(event.x, -10000, 10000) && number(event.y, -10000, 10000)
    && (event.character === undefined || ['lulu', 'lumei'].includes(event.character))
    && (event.direction === undefined || [-1, 1].includes(event.direction))
    && (event.damage === undefined || number(event.damage, 0, 100))
    && (event.special === undefined || typeof event.special === 'boolean');
}

async function createPeer(id) {
  const { Peer } = await import('peerjs');
  return new Peer(id, { debug: 0, config: { iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }
  ] } });
}

export class Session {
  constructor({ onEvent = () => {}, makePeer = createPeer, makeCode = roomCode, now = () => performance.now(), build = BUILD } = {}) {
    Object.assign(this, { onEvent, makePeer, makeCode, now, build });
    this.state = 'idle';
    this.code = '';
    this.role = null;
    this.peer = null;
    this.connection = null;
    this.closed = false;
    this.connected = false;
    this.round = 0;
    this.sequence = 0;
    this.receivedSequence = 0;
    this.lastReceived = 0;
    this.lastPing = 0;
    this.latency = null;
    this.stalled = false;
    this.attempts = 0;
    this.input = new InputBuffer();
    this.control = emptyControl();
    this.events = [];
    this.eventSequence = 0;
    this.lastEvent = 0;
    this.lastFrame = -1;
    this.rejections = new Map();
  }

  status(state) {
    this.state = state;
    this.onEvent('status', { state, code: this.code });
  }

  createRoom() { return this.open('host'); }
  joinRoom(code) {
    const normalized = normalizeCode(code);
    if (!normalized) throw new RangeError('请输入 8 位房间码，不含 I、O、0、1。');
    return this.open('guest', normalized);
  }

  async open(role, code) {
    if (this.state !== 'idle') throw new Error('请先退出当前房间。');
    this.role = role;
    this.code = role === 'host' ? this.makeCode() : code;
    this.deadline = this.now() + 20000;
    this.status(role === 'host' ? 'creating' : 'connecting');
    this.timer = setInterval(() => this.tick(), 500);
    await this.openPeer();
  }

  async openPeer() {
    this.attempts += 1;
    try {
      const peer = await this.makePeer(this.role === 'host' ? PREFIX + this.code : undefined);
      if (this.closed) { peer.destroy(); return; }
      this.peer = peer;
      peer.on('open', () => {
        if (this.closed || this.peer !== peer) return;
        if (this.role === 'host') { this.deadline = 0; this.status('waiting'); }
        else this.attach(peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' }));
      });
      peer.on('connection', connection => {
        if (this.closed || this.peer !== peer || this.role !== 'host') { connection.close(); return; }
        if (this.connection) this.reject(connection, 'full');
        else this.attach(connection);
      });
      peer.on('error', error => {
        if (this.closed || this.peer !== peer) return;
        if (error.type === 'unavailable-id' && this.role === 'host' && !this.connection && this.attempts < 5) {
          this.peer = null;
          peer.destroy();
          this.code = this.makeCode();
          void this.openPeer();
        } else if (!this.connected) {
          this.close(error.type === 'peer-unavailable' ? '房间不存在或已关闭，请检查房间码。' : '无法连接公共联机服务，请稍后重试或更换网络。', false);
        }
      });
      peer.on('disconnected', () => { if (!this.closed && this.peer === peer && !this.connected) this.close('公共联机服务已断开，请重新建房或加入。', false); });
    } catch { this.close('浏览器无法开启联机，请使用新版 Chrome、Edge、Firefox 或 Safari。', false); }
  }

  reject(connection, reason) {
    if (this.rejections.size >= 8) { connection.close(); return; }
    const finish = () => { clearTimeout(this.rejections.get(connection)); this.rejections.delete(connection); connection.close(); };
    const send = () => {
      try { connection.send(JSON.stringify({ type: 'reject', reason })); } catch { finish(); }
    };
    this.rejections.set(connection, setTimeout(finish, 20000));
    connection.on('open', () => { send(); clearTimeout(this.rejections.get(connection)); this.rejections.set(connection, setTimeout(finish, 1500)); });
    connection.on('error', finish);
    connection.on('close', () => { clearTimeout(this.rejections.get(connection)); this.rejections.delete(connection); });
    if (connection.open) { send(); clearTimeout(this.rejections.get(connection)); this.rejections.set(connection, setTimeout(finish, 1500)); }
  }

  attach(connection) {
    this.connection = connection;
    this.sequence = 0;
    this.receivedSequence = 0;
    this.deadline = this.now() + 20000;
    this.lastReceived = this.now();
    if (this.role === 'host') this.status('connecting');
    connection.on('open', () => { if (this.connection === connection && this.role === 'guest') this.send('hello'); });
    connection.on('data', wire => { if (!this.closed && this.connection === connection) this.receive(wire); });
    connection.on('close', () => { if (!this.closed && this.connection === connection) this.close('对方已离开或连接中断，本房间已结束。', false); });
    connection.on('error', () => { if (!this.closed && this.connection === connection) this.close('对战连接异常，请重新创建或加入房间。', false); });
  }

  send(type, data = {}) {
    if (this.closed || !this.connection?.open) return false;
    const buffered = this.connection.dataChannel?.bufferedAmount ?? 0;
    if (type === 'snapshot' && buffered > 65536) return false;
    if (buffered > 262144) { this.close('网络积压过多，本房间已结束，请更换网络后重试。', false); return false; }
    const wire = JSON.stringify({ v: PROTOCOL, build: this.build, type, round: this.round, seq: ++this.sequence, data });
    if (wire.length > 32768) { this.close('同步数据超过限制，本房间已结束。', false); return false; }
    try {
      const sent = this.connection.send(wire);
      sent?.catch?.(() => this.close('发送失败，连接已中断。', false));
      return true;
    } catch { this.close('发送失败，连接已中断。', false); return false; }
  }

  receive(wire) {
    let message;
    try { if (typeof wire !== 'string' || wire.length > 32768) throw new Error(); message = JSON.parse(wire); }
    catch { this.close('收到无效的联机数据，连接已关闭。', false); return; }
    if (!record(message)) return;
    if (!this.connected && this.role === 'guest' && message.type === 'reject' && Object.hasOwn(REJECTIONS, message.reason)) { this.close(REJECTIONS[message.reason], false); return; }
    if (message.v !== PROTOCOL || message.build !== this.build) {
      if (!this.connected && this.role === 'host' && message.type === 'hello') {
        this.reject(this.connection, message.v !== PROTOCOL ? 'protocol' : 'version');
        this.connection = null;
        this.deadline = 0;
        this.status('waiting');
      } else this.close(REJECTIONS.version, false);
      return;
    }
    if (!integer(message.seq, 1) || message.seq <= this.receivedSequence || !integer(message.round) || !record(message.data)) return;
    const { type, data } = message;
    if (!this.connected) {
      if (message.round !== 0 || (this.role === 'host' ? type !== 'hello' : type !== 'welcome')) return;
      this.receivedSequence = message.seq;
      this.connected = true;
      this.deadline = 0;
      this.lastReceived = this.now();
      if (this.role === 'host') this.send('welcome');
      this.status('connected');
      this.onEvent('ready');
      return;
    }
    if (type === 'start') {
      if (this.role !== 'guest' || message.round !== this.round + 1 || !MAPS.includes(data.map) || !validState(data.state) || data.state.frame !== 0 || data.state.paused) return;
      this.round = message.round;
      this.resetRound();
    } else if (message.round !== this.round) return;
    const allowed = ['ping', 'pong', 'leave', ...(this.role === 'host' ? ['input', 'pause', 'vote'] : ['start', 'snapshot', 'control'])];
    if (!allowed.includes(type)) return;
    if ((type === 'ping' || type === 'pong') && !number(data.time, 0, Number.MAX_SAFE_INTEGER)) return;
    if (type === 'input' && !validInput(data)) return;
    if (type === 'pause' && !REASONS.includes(data.reason)) return;
    if (type === 'vote' && (!['resume', 'restart'].includes(data.action) || !integer(data.ballot))) return;
    if (type === 'snapshot' && (!validState(data.state) || data.state.frame < this.lastFrame || !Array.isArray(data.events) || data.events.length > 128 || !data.events.every(validEvent))) return;
    if (type === 'control' && (!integer(data.epoch) || !integer(data.ballot) || data.epoch <= this.control.epoch || typeof data.paused !== 'boolean' || !REASONS.includes(data.reason) || !booleans(data.resume) || !booleans(data.restart))) return;
    this.receivedSequence = message.seq;
    this.lastReceived = this.now();
    if (this.stalled) { this.stalled = false; this.onEvent('stalled', false); }
    if (type === 'ping') this.send('pong', data);
    else if (type === 'pong') this.latency = Math.max(0, Math.round(this.now() - data.time));
    else if (type === 'leave') this.close('对方已离开，本房间已结束。', false);
    else if (type === 'start') this.onEvent('start', data);
    else if (type === 'input' && !this.control.paused) this.input.push(data, message.seq);
    else if (type === 'pause') this.applyPause(data.reason);
    else if (type === 'vote') this.applyVote(1, data.action, data.ballot);
    else if (type === 'control') { this.control = data; this.input.clear(); this.onEvent('control', data); }
    else if (type === 'snapshot') {
      this.lastFrame = data.state.frame;
      const events = data.events.filter(event => event.id > this.lastEvent);
      if (events.length) this.lastEvent = Math.max(...events.map(event => event.id));
      this.onEvent('snapshot', { state: data.state, events });
    }
  }

  resetRound() {
    this.control = emptyControl();
    this.input.clear();
    this.events = [];
    this.eventSequence = 0;
    this.lastEvent = 0;
    this.lastFrame = -1;
  }

  beginRound(match, map) {
    if (this.role !== 'host' || !this.connected || this.closed || !MAPS.includes(map)) return;
    this.round += 1;
    this.resetRound();
    this.send('start', { map, state: packState(match) });
  }

  publish(match, events, force = false) {
    if (this.role !== 'host' || !this.connected || this.closed) return;
    this.events.push(...events.map(event => ({ ...event, id: ++this.eventSequence })));
    if (this.events.length > 128) { this.close('网络过慢，无法继续同步对局，请更换网络。', false); return; }
    if ((force || match.frame % 2 === 0) && this.send('snapshot', { state: packState(match), events: this.events })) this.events = [];
  }

  sendInput(input) { if (this.role === 'guest' && this.round && !this.control.paused && validInput(input)) this.send('input', input); }
  takeInput() { return this.input.take(); }
  pause(reason = 'pause') { if (this.role === 'host') this.applyPause(reason); else this.send('pause', { reason }); }
  vote(action) { if (this.role === 'host') this.applyVote(0, action, this.control.ballot); else this.send('vote', { action, ballot: this.control.ballot }); }

  applyPause(reason) {
    if (!this.round || !REASONS.includes(reason)) return;
    this.control = { epoch: this.control.epoch + 1, ballot: this.control.ballot + 1, paused: true, reason, resume: [false, false], restart: [false, false] };
    this.updateControl();
  }

  applyVote(player, action, ballot) {
    if (!this.round || ballot !== this.control.ballot || !['resume', 'restart'].includes(action)) return;
    const control = this.control;
    if (action === 'restart' && control.reason !== 'restart') {
      control.paused = true;
      control.reason = 'restart';
      control.resume = [false, false];
      control.restart = [false, false];
    } else if (action === 'resume') {
      if (!control.paused) return;
      if (control.reason === 'restart') { control.reason = 'pause'; control.restart = [false, false]; }
    }
    control[action][player] = true;
    control.epoch += 1;
    if (action === 'restart' && control.restart.every(Boolean)) { this.onEvent('rematch'); return; }
    if (action === 'resume' && control.resume.every(Boolean)) {
      control.paused = false;
      control.ballot += 1;
      control.resume = [false, false];
      control.restart = [false, false];
    }
    this.updateControl();
  }

  updateControl() {
    this.input.clear();
    this.send('control', this.control);
    this.onEvent('control', this.control);
  }

  tick() {
    if (this.closed) return;
    const time = this.now();
    if (this.deadline && time >= this.deadline) { this.close('连接超时：当前网络可能无法点对点联机。请重试或换用家庭网络／手机热点。', false); return; }
    if (!this.connected) return;
    if (time - this.lastReceived >= 10000) { this.close('超过 10 秒未收到对方消息，本房间已结束。', false); return; }
    if (this.round && time - this.lastReceived >= 3000 && !this.stalled) {
      this.stalled = true;
      this.input.clear();
      this.pause('network');
      this.onEvent('stalled', true);
    }
    if (time - this.lastPing >= 1000) { this.lastPing = time; this.send('ping', { time }); }
  }

  close(message = '', notify = true) {
    if (this.closed) return;
    if (notify && this.connection?.open) {
      try { this.connection.send(JSON.stringify({ v: PROTOCOL, build: this.build, type: 'leave', round: this.round, seq: ++this.sequence, data: {} })); } catch {}
    }
    this.closed = true;
    this.connected = false;
    clearInterval(this.timer);
    for (const [connection, timer] of this.rejections) { clearTimeout(timer); connection.close(); }
    this.rejections.clear();
    this.input.clear();
    this.events = [];
    this.connection?.close();
    this.peer?.destroy();
    this.state = 'closed';
    this.onEvent('closed', message);
  }
}
