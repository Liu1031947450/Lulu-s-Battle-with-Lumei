/* 战斗只处理固定帧输入；绘制、键盘与声音均不参与伤害判定。 */
const Battle = (() => {
  const CONFIG = Object.freeze({
    width: 1280,
    height: 620,
    ground: 514,
    left: 92,
    right: 1188,
    radius: 43,
    bodyHeight: 108,
    hurtHeight: 185,
    crouchHeight: 112,
    fps: 60,
    duration: 90,
    health: 100,
    walkSpeed: 230,
    runSpeed: 380,
    gravity: 2050,
    jumpSpeed: 710,
    doubleJumpSpeed: 640,
    cooldown: 180,
    countdown: 180
  });

  const MOVES = Object.freeze({
    attack: Object.freeze({ startup: 7, active: 5, recovery: 15, damage: 8, reach: 137, knockback: 235, stun: 15 }),
    lulu: Object.freeze({ startup: 12, active: 12, recovery: 23, damage: 18, reach: 131, knockback: 470, stun: 23 }),
    lumei: Object.freeze({ startup: 17, active: 1, recovery: 24, damage: 16, reach: 0, knockback: 350, stun: 21 })
  });

  const EMPTY_INPUT = Object.freeze({ left: false, right: false, run: false, jump: false, crouch: false, attack: false, skill: false, guard: false });
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function randomSource(seed = 1) {
    let value = seed >>> 0 || 1;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }

  function createFighter(index) {
    return {
      id: index,
      kind: index === 0 ? 'lulu' : 'lumei',
      name: index === 0 ? '噜噜' : '噜妹',
      x: index === 0 ? 340 : 940,
      y: CONFIG.ground,
      previousX: index === 0 ? 340 : 940,
      velocityX: 0,
      velocityY: 0,
      facing: index === 0 ? 1 : -1,
      health: CONFIG.health,
      jumps: 0,
      grounded: true,
      crouching: false,
      guarding: false,
      running: false,
      state: 'idle',
      stateFrame: 0,
      jumpFrame: 0,
      cooldown: 0,
      stun: 0,
      protection: 0,
      recovery: 0,
      flash: 0,
      move: null,
      stats: { hits: 0, damage: 0, blocked: 0, skills: 0 },
      brain: { wait: 0, input: { ...EMPTY_INPUT } }
    };
  }

  function hurtbox(fighter) {
    const height = fighter.crouching ? CONFIG.crouchHeight : CONFIG.hurtHeight;
    return { left: fighter.x - CONFIG.radius, right: fighter.x + CONFIG.radius, top: fighter.y - height, bottom: fighter.y - 5 };
  }

  function overlaps(first, second) {
    return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
  }

  function hitbox(fighter) {
    const move = fighter.move;
    if (!move || move.kind === 'lumei') return null;
    const definition = MOVES[move.kind];
    if (move.frame < definition.startup || move.frame >= definition.startup + definition.active) return null;
    const low = move.crouched ? 75 : 135;
    return {
      left: fighter.facing > 0 ? fighter.x + 12 : fighter.x - definition.reach,
      right: fighter.facing > 0 ? fighter.x + definition.reach : fighter.x - 12,
      top: fighter.y - low,
      bottom: fighter.y - (move.crouched ? 13 : 48)
    };
  }

  function setState(fighter, state) {
    if (fighter.state !== state) {
      fighter.state = state;
      fighter.stateFrame = 0;
    } else {
      fighter.stateFrame += 1;
    }
  }

  class Match {
    constructor({ mode = 'solo', seed = Date.now(), duration = CONFIG.duration, countdown = CONFIG.countdown, aiBoth = false } = {}) {
      if (!['solo', 'duo'].includes(mode)) throw new RangeError('未知对战模式');
      if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('对局时间必须大于零');
      if (!Number.isInteger(countdown) || countdown < 0) throw new RangeError('倒计时必须是非负整数帧');
      this.mode = mode;
      this.aiBoth = aiBoth;
      this.seed = seed;
      this.random = randomSource(seed);
      this.fighters = [createFighter(0), createFighter(1)];
      this.phase = countdown > 0 ? 'countdown' : 'fighting';
      this.paused = false;
      this.countdown = countdown;
      this.remaining = Math.round(duration * CONFIG.fps);
      this.frame = 0;
      this.finishedFrame = 0;
      this.projectiles = [];
      this.events = [];
      this.result = null;
      this.nextAttackId = 1;
    }

    emit(kind, details = {}) {
      this.events.push({ kind, ...details });
    }

    pause(value = true) {
      this.paused = Boolean(value);
      if (value) {
        for (const fighter of this.fighters) fighter.brain.input = { ...EMPTY_INPUT };
      }
    }

    startMove(fighter, kind) {
      fighter.move = { kind, frame: 0, id: this.nextAttackId++, hit: false, spawned: false, crouched: fighter.crouching };
      fighter.guarding = false;
      if (kind !== 'attack') {
        fighter.cooldown = CONFIG.cooldown;
        fighter.stats.skills += 1;
      }
      this.emit(kind === 'attack' ? 'swing' : 'skill', { player: fighter.id, x: fighter.x, y: fighter.y - 90, character: fighter.kind });
    }

    /* 人机只观察当前公开状态；等待帧在每次决策后重新抽样。 */
    computerInput(fighter, opponent) {
      const brain = fighter.brain;
      const input = { ...brain.input, attack: false, skill: false, jump: false };
      if (brain.wait > 0) {
        brain.wait -= 1;
        brain.input = input;
        return input;
      }
      brain.wait = 10 + Math.floor(this.random() * 9);
      Object.assign(input, EMPTY_INPUT);
      const distance = Math.abs(opponent.x - fighter.x);
      const towards = opponent.x > fighter.x ? 1 : -1;
      const hostileBubble = this.projectiles.some(projectile => projectile.owner !== fighter.id && Math.abs(projectile.x - fighter.x) < 270);
      const danger = (opponent.move && distance < 215) || hostileBubble;
      const chance = this.random();
      if (danger && chance < 0.58 && fighter.grounded) {
        input.guard = true;
      } else if (danger && chance < 0.75) {
        input.jump = fighter.jumps < 2;
        input.left = towards < 0;
        input.right = towards > 0;
      } else if (distance > 150) {
        input.left = towards < 0;
        input.right = towards > 0;
        input.run = distance > 380;
        input.jump = this.random() < 0.09 && fighter.grounded;
        if (fighter.cooldown === 0 && (fighter.kind === 'lumei' ? distance < 550 : distance < 285)) {
          input.skill = this.random() < 0.44;
        }
      } else if (chance < 0.14) {
        input.left = towards > 0;
        input.right = towards < 0;
      } else if (chance < 0.24) {
        input.crouch = true;
        input.attack = this.random() < 0.6;
      } else if (fighter.cooldown === 0 && chance > 0.71) {
        input.skill = true;
      } else {
        input.attack = chance < 0.91;
      }
      if (opponent.stun > 0 || (opponent.move && opponent.move.frame > 20)) {
        if (distance < 164 && !input.guard) input.attack = true;
      }
      brain.input = input;
      return { ...input };
    }

    updateFighter(fighter, opponent, requested) {
      const input = { ...EMPTY_INPUT, ...requested };
      fighter.previousX = fighter.x;
      fighter.cooldown = Math.max(0, fighter.cooldown - 1);
      fighter.protection = Math.max(0, fighter.protection - 1);
      fighter.flash = Math.max(0, fighter.flash - 1);
      fighter.recovery = Math.max(0, fighter.recovery - 1);
      fighter.jumpFrame += 1;
      const wasCrouching = fighter.crouching;
      const stunned = fighter.stun > 0;
      fighter.running = false;
      if (stunned) {
        fighter.stun -= 1;
        fighter.guarding = false;
        fighter.crouching = false;
        setState(fighter, 'hit');
        fighter.velocityX *= fighter.grounded ? 0.83 : 0.95;
      } else {
        if (!fighter.move && !fighter.guarding) fighter.facing = opponent.x >= fighter.x ? 1 : -1;
        fighter.guarding = input.guard && fighter.grounded && !fighter.move;
        fighter.crouching = input.crouch && fighter.grounded && !fighter.move;
        if (fighter.move) fighter.crouching = fighter.move.crouched && fighter.grounded;
        const canAct = !fighter.move && fighter.recovery === 0;
        if (input.jump && canAct && !fighter.guarding && fighter.jumps < 2) {
          fighter.jumps += 1;
          fighter.velocityY = -(fighter.jumps === 1 ? CONFIG.jumpSpeed : CONFIG.doubleJumpSpeed);
          fighter.grounded = false;
          fighter.crouching = false;
          fighter.jumpFrame = 0;
          this.emit(fighter.jumps === 1 ? 'jump' : 'double-jump', { player: fighter.id, x: fighter.x, y: fighter.y });
        }
        if (canAct && !fighter.guarding) {
          if (input.skill && fighter.cooldown === 0) this.startMove(fighter, fighter.kind);
          else if (input.attack) this.startMove(fighter, 'attack');
        }
        const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
        if (fighter.move) {
          const move = fighter.move;
          const definition = MOVES[move.kind];
          fighter.velocityX *= 0.74;
          if (move.kind === 'lulu' && move.frame >= definition.startup && move.frame < definition.startup + definition.active) {
            fighter.velocityX = fighter.facing * 640;
          }
          if (move.kind === 'lumei' && move.frame >= definition.startup && !move.spawned) {
            move.spawned = true;
            this.projectiles.push({ id: move.id, owner: fighter.id, x: fighter.x + fighter.facing * 82, y: fighter.y - (move.crouched ? 76 : 119), facing: fighter.facing, life: 94, age: 0 });
            this.emit('bubble', { player: fighter.id, x: fighter.x, y: fighter.y - 119 });
          }
          setState(fighter, move.kind === 'attack' ? 'attack' : 'skill');
        } else if (fighter.guarding) {
          fighter.velocityX = 0;
          setState(fighter, 'guard');
        } else if (fighter.crouching) {
          fighter.velocityX = 0;
          setState(fighter, 'crouch');
        } else {
          fighter.running = input.run && direction !== 0 && fighter.grounded;
          fighter.velocityX = direction * (fighter.running ? CONFIG.runSpeed : CONFIG.walkSpeed);
          if (!fighter.grounded) setState(fighter, fighter.jumps === 2 && fighter.jumpFrame < 19 ? 'double-jump' : 'jump');
          else if (direction !== 0) setState(fighter, direction !== fighter.facing ? 'backstep' : fighter.running ? 'run' : 'walk');
          else if (wasCrouching || (fighter.state === 'rise' && fighter.stateFrame < 8)) setState(fighter, 'rise');
          else setState(fighter, 'idle');
        }
      }
      fighter.x = clamp(fighter.x + fighter.velocityX / CONFIG.fps, CONFIG.left, CONFIG.right);
      if (!fighter.grounded) {
        fighter.velocityY += CONFIG.gravity / CONFIG.fps;
        fighter.y += fighter.velocityY / CONFIG.fps;
        if (fighter.y >= CONFIG.ground) {
          fighter.y = CONFIG.ground;
          fighter.velocityY = 0;
          fighter.grounded = true;
          fighter.jumps = 0;
          this.emit('land', { player: fighter.id, x: fighter.x, y: fighter.y });
        }
      }
    }

    separateFighters() {
      const [first, second] = this.fighters;
      const firstBody = { ...hurtbox(first), top: first.y - CONFIG.bodyHeight };
      const secondBody = { ...hurtbox(second), top: second.y - CONFIG.bodyHeight };
      if (!overlaps(firstBody, secondBody)) return;
      const sign = first.x === second.x ? (first.previousX <= second.previousX ? 1 : -1) : Math.sign(second.x - first.x);
      const overlap = CONFIG.radius * 2 - Math.abs(first.x - second.x);
      if (overlap <= 0) return;
      first.x = clamp(first.x - sign * overlap / 2, CONFIG.left, CONFIG.right);
      second.x = clamp(second.x + sign * overlap / 2, CONFIG.left, CONFIG.right);
      const remainder = CONFIG.radius * 2 - Math.abs(first.x - second.x);
      if (remainder > 0) {
        if (first.x === CONFIG.left || first.x === CONFIG.right) second.x = clamp(second.x + sign * remainder, CONFIG.left, CONFIG.right);
        else first.x = clamp(first.x - sign * remainder, CONFIG.left, CONFIG.right);
      }
    }

    collectHits() {
      const hits = [];
      for (const attacker of this.fighters) {
        const defender = this.fighters[1 - attacker.id];
        const attackBox = hitbox(attacker);
        if (attackBox && !attacker.move.hit && defender.protection === 0 && overlaps(attackBox, hurtbox(defender))) {
          attacker.move.hit = true;
          hits.push({ attacker, defender, definition: MOVES[attacker.move.kind], sourceX: attacker.x, direction: attacker.facing, special: attacker.move.kind !== 'attack' });
        }
      }
      for (const projectile of this.projectiles) {
        projectile.age += 1;
        projectile.life -= 1;
        const previousX = projectile.x;
        projectile.x += projectile.facing * 470 / CONFIG.fps;
        const defender = this.fighters[1 - projectile.owner];
        const sweptBox = { left: Math.min(previousX, projectile.x) - 25, right: Math.max(previousX, projectile.x) + 25, top: projectile.y - 25, bottom: projectile.y + 25 };
        if (projectile.life > 0 && defender.protection === 0 && overlaps(sweptBox, hurtbox(defender))) {
          projectile.life = 0;
          hits.push({ attacker: this.fighters[projectile.owner], defender, definition: MOVES.lumei, sourceX: previousX, direction: projectile.facing, special: true });
        }
      }
      this.projectiles = this.projectiles.filter(projectile => projectile.life > 0 && projectile.x > -50 && projectile.x < CONFIG.width + 50);
      return hits;
    }

    applyHits(hits) {
      /* 先收集、后结算：双方同帧命中可以交换伤害或同时倒地。 */
      const resolved = hits.map(hit => ({ ...hit, blocked: hit.defender.guarding && hit.defender.grounded && (hit.sourceX - hit.defender.x) * hit.defender.facing > 0 }));
      for (const { attacker, defender, definition, direction, special, blocked } of resolved) {
        const damage = Math.round(definition.damage * (blocked ? 0.2 : 1) * 10) / 10;
        const actual = Math.min(defender.health, damage);
        defender.health = Math.round(Math.max(0, defender.health - damage) * 10) / 10;
        defender.flash = blocked ? 5 : 10;
        defender.velocityX = direction * definition.knockback * (blocked ? 0.22 : 1);
        defender.stun = blocked ? 7 : definition.stun;
        defender.protection = blocked ? 8 : definition.stun + 10;
        defender.recovery = 0;
        defender.move = null;
        attacker.stats.hits += blocked ? 0 : 1;
        attacker.stats.damage = Math.round((attacker.stats.damage + actual) * 10) / 10;
        if (blocked) defender.stats.blocked += 1;
        else {
          defender.guarding = false;
          defender.crouching = false;
          setState(defender, 'hit');
        }
        this.emit(blocked ? 'guard' : 'hit', { player: defender.id, attacker: attacker.id, x: defender.x - direction * 30, y: defender.y - 105, damage, special, direction, character: attacker.kind });
      }
    }

    finish(reason) {
      const [first, second] = this.fighters;
      const winner = first.health === second.health ? null : first.health > second.health ? 0 : 1;
      this.result = { winner, reason, health: this.fighters.map(fighter => fighter.health), seconds: Math.ceil(this.remaining / CONFIG.fps) };
      this.phase = 'finished';
      this.finishedFrame = this.frame;
      this.projectiles = [];
      for (const fighter of this.fighters) {
        fighter.move = null;
        fighter.guarding = false;
        fighter.crouching = false;
        fighter.stun = 0;
        fighter.velocityX = 0;
        setState(fighter, winner === null ? 'draw' : winner === fighter.id ? 'victory' : 'defeat');
      }
      this.emit('finish', { winner, reason });
    }

    step(inputs = [EMPTY_INPUT, EMPTY_INPUT]) {
      this.events = [];
      if (this.paused) return this.events;
      this.frame += 1;
      if (this.phase === 'finished') {
        for (const fighter of this.fighters) {
          fighter.stateFrame += 1;
          if (!fighter.grounded) {
            fighter.velocityY += CONFIG.gravity / CONFIG.fps;
            fighter.y = Math.min(CONFIG.ground, fighter.y + fighter.velocityY / CONFIG.fps);
            if (fighter.y === CONFIG.ground) {
              fighter.grounded = true;
              fighter.velocityY = 0;
              fighter.jumps = 0;
            }
          }
        }
        return this.events;
      }
      if (this.phase === 'countdown') {
        if (this.countdown % CONFIG.fps === 0) this.emit('countdown', { number: this.countdown / CONFIG.fps });
        this.countdown -= 1;
        if (this.countdown === 0) {
          this.phase = 'fighting';
          this.emit('fight');
        }
        return this.events;
      }
      const frameInputs = this.fighters.map((fighter, index) => this.aiBoth || (this.mode === 'solo' && index === 1)
        ? this.computerInput(fighter, this.fighters[1 - index])
        : inputs[index] || EMPTY_INPUT);
      for (const fighter of this.fighters) this.updateFighter(fighter, this.fighters[1 - fighter.id], frameInputs[fighter.id]);
      this.separateFighters();
      this.applyHits(this.collectHits());
      for (const fighter of this.fighters) {
        if (!fighter.move) continue;
        fighter.move.frame += 1;
        const definition = MOVES[fighter.move.kind];
        if (fighter.move.frame >= definition.startup + definition.active + definition.recovery) {
          fighter.move = null;
          fighter.recovery = 1;
        }
      }
      this.remaining = Math.max(0, this.remaining - 1);
      if (this.fighters.some(fighter => fighter.health <= 0)) this.finish('ko');
      else if (this.remaining === 0) this.finish('time');
      return this.events;
    }
  }

  return { CONFIG, MOVES, EMPTY_INPUT, Match, createFighter, hurtbox, hitbox, overlaps, randomSource };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Battle;
