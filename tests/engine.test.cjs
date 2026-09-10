const test = require('node:test');
const assert = require('node:assert/strict');
const { Match, CONFIG, MOVES, hurtbox, randomSource } = require('../src/engine.js');
const { synthesize } = require('../src/audio.js');
const { poseFor, modelSvg, ANIMATIONS } = require('../src/art.js');

const duel = options => new Match({ mode: 'duo', countdown: 0, seed: 23, ...options });
function tick(match, frames, input = [{}, {}]) {
  const events = [];
  for (let frame = 0; frame < frames; frame += 1) events.push(...match.step(typeof input === 'function' ? input(frame) : input));
  return events;
}
function position(match, distance = 125) {
  match.fighters[0].x = 540;
  match.fighters[1].x = 540 + distance;
}

test('构造校验与可复现随机数', () => {
  assert.throws(() => new Match({ mode: 'online' }), RangeError);
  assert.throws(() => new Match({ duration: 0 }), RangeError);
  assert.throws(() => new Match({ countdown: -1 }), RangeError);
  const first = randomSource(11);
  const second = randomSource(11);
  for (let sample = 0; sample < 100; sample += 1) assert.equal(first(), second());
});

test('三秒倒计时禁止移动攻击，战斗计时从开打后开始', () => {
  const match = new Match({ mode: 'duo' });
  const events = tick(match, 180, [{ right: true, attack: true, skill: true }, {}]);
  assert.equal(match.phase, 'fighting');
  assert.equal(match.remaining, 5400);
  assert.equal(match.fighters[0].x, 340);
  assert.equal(match.fighters[0].cooldown, 0);
  assert.deepEqual(events.filter(event => event.kind === 'countdown').map(event => event.number), [3, 2, 1]);
  assert.equal(events.filter(event => event.kind === 'fight').length, 1);
  match.step();
  assert.equal(match.remaining, 5399);
});

test('移动、奔跑、后退、相反方向中立和场地边界', () => {
  const walking = duel();
  const running = duel();
  tick(walking, 30, [{ right: true }, {}]);
  tick(running, 30, [{ right: true, run: true }, {}]);
  assert.ok(running.fighters[0].x > walking.fighters[0].x + 65);
  assert.equal(running.fighters[0].state, 'run');
  const previousX = walking.fighters[0].x;
  walking.step([{ right: true, left: true }, {}]);
  assert.equal(walking.fighters[0].x, previousX);
  walking.step([{ left: true }, {}]);
  assert.equal(walking.fighters[0].state, 'backstep');
  tick(walking, 250, [{ left: true }, { right: true }]);
  assert.equal(walking.fighters[0].x, CONFIG.left);
  assert.equal(walking.fighters[1].x, CONFIG.right);
});

test('角色实体相互阻挡，不会被挤出角落', () => {
  const match = duel();
  match.fighters[0].x = CONFIG.right - 160;
  match.fighters[1].x = CONFIG.right;
  tick(match, 120, [{ right: true, run: true }, {}]);
  assert.equal(match.fighters[1].x, CONFIG.right);
  assert.ok(match.fighters[1].x - match.fighters[0].x >= CONFIG.radius * 2 - 0.001);
});

test('二段跳、第三次跳跃无效、落地恢复跳数', () => {
  const match = duel();
  match.step([{ jump: true }, {}]);
  assert.equal(match.fighters[0].jumps, 1);
  assert.equal(match.fighters[0].grounded, false);
  tick(match, 9);
  match.step([{ jump: true }, {}]);
  assert.equal(match.fighters[0].jumps, 2);
  const velocity = match.fighters[0].velocityY;
  match.step([{ jump: true }, {}]);
  assert.equal(match.fighters[0].jumps, 2);
  assert.ok(match.fighters[0].velocityY > velocity);
  tick(match, 110);
  assert.equal(match.fighters[0].grounded, true);
  assert.equal(match.fighters[0].jumps, 0);
  assert.equal(match.fighters[0].y, CONFIG.ground);
});

test('跳过对手后换边且落地不重叠', () => {
  const match = duel(); position(match, 145);
  match.step([{ jump: true, right: true, run: true }, {}]);
  tick(match, 14, [{ right: true }, {}]);
  match.step([{ jump: true, right: true }, {}]);
  tick(match, 47, [{ right: true }, {}]);
  tick(match, 70);
  assert.ok(match.fighters[0].x > match.fighters[1].x);
  assert.equal(match.fighters[0].facing, -1);
  assert.equal(match.fighters[1].facing, 1);
  assert.ok(Math.abs(match.fighters[1].x - match.fighters[0].x) >= CONFIG.radius * 2);
});

test('下蹲降低碰撞高度，松开播放起身动作', () => {
  const match = duel();
  match.step([{ crouch: true }, {}]);
  assert.equal(match.fighters[0].state, 'crouch');
  assert.equal(hurtbox(match.fighters[0]).top, CONFIG.ground - CONFIG.crouchHeight);
  match.step();
  assert.equal(match.fighters[0].state, 'rise');
  tick(match, 10);
  assert.equal(match.fighters[0].state, 'idle');
});

test('普攻前摇不扣血，有效窗口只命中一次，后摇不能再发技能', () => {
  const match = duel(); position(match);
  match.step([{ attack: true }, {}]);
  tick(match, MOVES.attack.startup - 1);
  assert.equal(match.fighters[1].health, 100);
  match.step();
  assert.equal(match.fighters[1].health, 92);
  const attackId = match.fighters[0].move.id;
  tick(match, 12, [{ attack: true, skill: true }, {}]);
  assert.equal(match.fighters[1].health, 92);
  assert.equal(match.fighters[0].move.id, attackId);
  assert.equal(match.fighters[0].cooldown, 0);
  assert.equal(match.fighters[0].stats.hits, 1);
});

test('攻击距离和空中高度参与真实命中判定', () => {
  const distant = duel();
  distant.step([{ attack: true }, {}]); tick(distant, 30);
  assert.equal(distant.fighters[1].health, 100);
  const airborne = duel(); position(airborne);
  airborne.fighters[1].y = 190;
  airborne.fighters[1].grounded = false;
  airborne.step([{ attack: true }, {}]); tick(airborne, 13);
  assert.equal(airborne.fighters[1].health, 100);
});

test('地面正面防御减伤 80%，背后和空中不能格挡', () => {
  const front = duel(); position(front);
  front.step([{ attack: true }, { guard: true }]); tick(front, 8, [{}, { guard: true }]);
  assert.equal(front.fighters[1].health, 98.4);
  assert.equal(front.fighters[1].stats.blocked, 1);
  const behind = duel(); position(behind);
  behind.fighters[1].guarding = true;
  behind.fighters[1].facing = 1;
  behind.step([{ attack: true }, { guard: true }]); tick(behind, 8, [{}, { guard: true }]);
  assert.equal(behind.fighters[1].health, 92);
  const midair = duel();
  midair.step([{}, { jump: true }]); midair.step([{}, { guard: true }]);
  assert.equal(midair.fighters[1].guarding, false);
});

test('受击击退、硬直和恢复保护阻止无限锁死', () => {
  const match = duel(); position(match);
  const origin = match.fighters[1].x;
  match.step([{ attack: true }, {}]); tick(match, 8);
  assert.ok(match.fighters[1].stun > 0);
  assert.ok(match.fighters[1].protection > match.fighters[1].stun);
  tick(match, 6, [{}, { attack: true, skill: true, jump: true, left: true }]);
  assert.ok(match.fighters[1].x > origin);
  assert.equal(match.fighters[1].move, null);
  tick(match, 30);
  assert.equal(match.fighters[1].stun, 0);
  assert.equal(match.fighters[1].protection, 0);
  match.step([{}, { jump: true }]);
  assert.equal(match.fighters[1].grounded, false);
});

test('噜噜技能突进命中 18 伤害，三秒冷却不能重复施放', () => {
  const match = duel(); position(match, 265);
  const origin = match.fighters[0].x;
  match.step([{ skill: true }, {}]);
  assert.equal(match.fighters[0].cooldown, 180);
  tick(match, 46);
  assert.equal(match.fighters[1].health, 82);
  assert.ok(match.fighters[0].x > origin + 90);
  match.step([{ skill: true }, {}]);
  assert.equal(match.fighters[0].stats.skills, 1);
  tick(match, 134);
  assert.equal(match.fighters[0].cooldown, 0);
  match.step([{ skill: true }, {}]);
  assert.equal(match.fighters[0].stats.skills, 2);
});

test('噜妹泡泡有前摇与飞行过程，命中后销毁且伤害仅一次', () => {
  const match = duel(); position(match, 380);
  match.step([{}, { skill: true }]); tick(match, 16);
  assert.equal(match.projectiles.length, 0);
  match.step();
  assert.equal(match.projectiles.length, 1);
  assert.equal(match.fighters[0].health, 100);
  tick(match, 45);
  assert.equal(match.fighters[0].health, 84);
  assert.equal(match.projectiles.length, 0);
  tick(match, 90);
  assert.equal(match.fighters[0].health, 84);
});

test('未命中投射物会过期而不是永久滞留', () => {
  const match = duel();
  match.fighters[0].x = CONFIG.left;
  match.fighters[1].x = CONFIG.right;
  match.step([{}, { skill: true }]); tick(match, 150);
  assert.equal(match.projectiles.length, 0);
  assert.equal(match.fighters[0].health, 100);
});

test('双方同帧命中正常交换伤害，同时空血判平局', () => {
  const match = duel(); position(match);
  match.fighters.forEach(fighter => { fighter.health = 8; });
  match.step([{ attack: true }, { attack: true }]); tick(match, 8);
  assert.equal(match.phase, 'finished');
  assert.deepEqual(match.fighters.map(fighter => fighter.health), [0, 0]);
  assert.equal(match.result.winner, null);
  assert.equal(match.result.reason, 'ko');
});

test('单方空血判负，结束后输入不能改变血量或发射泡泡', () => {
  const match = duel(); position(match);
  match.fighters[1].health = 8;
  match.step([{ attack: true }, {}]); tick(match, 10);
  assert.equal(match.result.winner, 0);
  const time = match.remaining;
  tick(match, 120, [{ attack: true, skill: true, right: true }, { attack: true, skill: true }]);
  assert.deepEqual(match.fighters.map(fighter => fighter.health), [100, 0]);
  assert.equal(match.remaining, time);
  assert.equal(match.projectiles.length, 0);
  assert.equal(match.fighters[0].state, 'victory');
  assert.equal(match.fighters[1].state, 'defeat');
});

test('超时比较剩余生命，相等则平局', () => {
  for (const [health, winner] of [[100, null], [85, 0]]) {
    const match = duel({ duration: 1 });
    match.fighters[1].health = health;
    tick(match, 60);
    assert.equal(match.result.winner, winner);
    assert.equal(match.result.reason, 'time');
    assert.equal(match.remaining, 0);
  }
});

test('暂停冻结倒计时、战斗时间、冷却与投射物，恢复没有追帧', () => {
  const match = duel();
  match.step([{}, { skill: true }]); tick(match, 20);
  match.pause();
  const previousFrame = match.frame;
  const snapshot = JSON.stringify([match.frame, match.fighters, match.projectiles, match.remaining]);
  tick(match, 240, [{ attack: true }, { skill: true }]);
  assert.equal(JSON.stringify([match.frame, match.fighters, match.projectiles, match.remaining]), snapshot);
  match.pause(false); match.step();
  assert.equal(match.frame, previousFrame + 1);
  const countdown = new Match(); countdown.pause(); tick(countdown, 120);
  assert.equal(countdown.countdown, 180);
});

test('重开新对局完全重置血量、状态、技能、投射物与统计', () => {
  const previous = duel(); position(previous);
  previous.step([{ skill: true }, {}]); tick(previous, 50);
  const fresh = new Match({ mode: previous.mode });
  assert.equal(fresh.phase, 'countdown');
  assert.equal(fresh.projectiles.length, 0);
  for (const fighter of fresh.fighters) {
    assert.equal(fighter.health, 100);
    assert.equal(fighter.cooldown, 0);
    assert.equal(fighter.stun, 0);
    assert.equal(fighter.move, null);
    assert.equal(fighter.jumps, 0);
    assert.deepEqual(fighter.stats, { hits: 0, damage: 0, blocked: 0, skills: 0 });
  }
});

test('相同种子的人机对局可复现，观察延迟位于 180～320ms', () => {
  const first = duel({ aiBoth: true, seed: 17 });
  const second = duel({ aiBoth: true, seed: 17 });
  tick(first, 750); tick(second, 750);
  assert.deepEqual(first.fighters, second.fighters);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    first.fighters[0].brain.wait = 0;
    first.computerInput(first.fighters[0], first.fighters[1]);
    const reaction = (first.fighters[0].brain.wait + 1) / 60;
    assert.ok(reaction >= 0.18 && reaction <= 0.32);
  }
});

test('100 局自动对战：无越界、异常数值、超时卡死，覆盖人机全套行为', () => {
  const seenStates = new Set();
  let knockouts = 0;
  let totalHits = 0;
  let totalBlocks = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const match = duel({ aiBoth: true, seed });
    for (let frame = 0; frame < 5405 && match.phase !== 'finished'; frame += 1) {
      match.step();
      for (const fighter of match.fighters) {
        seenStates.add(fighter.state);
        assert.ok(Number.isFinite(fighter.x) && Number.isFinite(fighter.y) && Number.isFinite(fighter.health), `seed=${seed}`);
        assert.ok(fighter.x >= CONFIG.left && fighter.x <= CONFIG.right, `seed=${seed} x=${fighter.x}`);
        assert.ok(fighter.y <= CONFIG.ground && fighter.y > -500, `seed=${seed} y=${fighter.y}`);
        assert.ok(fighter.health >= 0 && fighter.health <= 100);
        assert.ok(fighter.jumps >= 0 && fighter.jumps <= 2);
      }
    }
    assert.equal(match.phase, 'finished', `seed=${seed} 对局未结束`);
    if (match.result.reason === 'ko') knockouts += 1;
    totalHits += match.fighters.reduce((sum, fighter) => sum + fighter.stats.hits, 0);
    totalBlocks += match.fighters.reduce((sum, fighter) => sum + fighter.stats.blocked, 0);
  }
  for (const state of ['walk', 'run', 'jump', 'attack', 'skill', 'guard', 'backstep', 'hit', 'crouch']) assert.ok(seenStates.has(state), `未出现 AI 行为：${state}`);
  assert.ok(knockouts > 60, `只有 ${knockouts} 场出现 KO`);
  assert.ok(totalHits > 500);
  assert.ok(totalBlocks > 30);
  console.log(`模拟结果：100 局全部结束，${knockouts} 场 KO，${totalHits} 次命中，${totalBlocks} 次格挡。`);
});

test('原创合成音频可运行，无 NaN 和超量程样本', () => {
  for (const name of ['garden', 'hit', 'guard', 'jump', 'finish']) {
    const samples = synthesize(name);
    assert.ok(samples.length > 500);
    assert.ok(samples.some(sample => Math.abs(sample) > 0.01));
    for (const sample of samples) assert.ok(Number.isFinite(sample) && Math.abs(sample) <= 1);
  }
});

test('分层美术覆盖16种动作，跳跃与下蹲包含真实关节/形变过渡', () => {
  assert.equal(Object.keys(ANIMATIONS).length, 16);
  for (const kind of ['lulu', 'lumei']) {
    assert.match(modelSvg(kind), /id="nearArm"/);
    assert.match(modelSvg(kind), /data-pivot/);
    const initial = poseFor({ kind, state: 'jump', jumpFrame: 0 }, 1);
    const airborne = poseFor({ kind, state: 'jump', jumpFrame: 15 }, 1);
    assert.notEqual(initial.nearArm, airborne.nearArm);
    assert.notEqual(initial.nearLeg, airborne.nearLeg);
    const crouching = poseFor({ kind, state: 'crouch', stateFrame: 0 }, 1);
    const crouched = poseFor({ kind, state: 'crouch', stateFrame: 8 }, 1);
    assert.ok(crouching.scaleY > crouched.scaleY);
  }
});
