const test = require('node:test');
const assert = require('node:assert/strict');
const { Keyboard } = require('../src/input.js');

function setup() {
  const target = new EventTarget();
  const keyboard = new Keyboard(target);
  keyboard.setEnabled(true);
  function dispatch(type, code, options = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({ code, timeStamp: 1000, repeat: false, ...options })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    return event;
  }
  return { keyboard, target, down: (code, options) => dispatch('keydown', code, options), up: code => dispatch('keyup', code) };
}

test('固定双人映射，同时移动、攻击互不干扰', () => {
  const { keyboard, down } = setup();
  down('KeyA'); down('KeyJ'); down('ArrowRight'); down('Numpad2');
  const [first, second] = keyboard.sample();
  assert.equal(first.left, true); assert.equal(first.attack, true); assert.equal(first.skill, false);
  assert.equal(second.right, true); assert.equal(second.skill, true); assert.equal(second.attack, false);
  assert.equal(down('ArrowDown').defaultPrevented, true);
  keyboard.destroy();
});

test('长按和操作系统 repeat 不重复触发跳跃、普攻和技能', () => {
  const { keyboard, down, up } = setup();
  down('KeyW'); down('KeyK');
  assert.equal(keyboard.sample()[0].jump, true);
  down('KeyW', { repeat: true }); down('KeyK', { repeat: true });
  assert.equal(keyboard.sample()[0].jump, false);
  assert.equal(keyboard.sample()[0].skill, false);
  down('KeyW');
  assert.equal(keyboard.sample()[0].jump, false);
  up('KeyW'); down('KeyW');
  assert.equal(keyboard.sample()[0].jump, true);
});

test('双击同方向并按住奔跑，松开结束，超时不奔跑', () => {
  const { keyboard, down, up } = setup();
  down('KeyD', { timeStamp: 1000 }); up('KeyD'); down('KeyD', { timeStamp: 1210 });
  assert.equal(keyboard.sample()[0].run, true);
  up('KeyD');
  assert.equal(keyboard.sample()[0].run, false);
  down('KeyD', { timeStamp: 1900 });
  assert.equal(keyboard.sample()[0].run, false);
});

test('小键盘 NumLock 开关不影响按键，主键区 1/2/3 作为额外兼容', () => {
  const { keyboard, down, up } = setup();
  down('Numpad1', { key: 'End' });
  assert.equal(keyboard.sample()[1].attack, true);
  up('Numpad1'); down('Numpad2', { key: 'ArrowDown' }); down('Numpad3', { key: 'PageDown' });
  const pad = keyboard.sample()[1];
  assert.equal(pad.skill, true); assert.equal(pad.guard, true);
  keyboard.clear(); down('Digit1'); down('Digit2'); down('Digit3');
  const main = keyboard.sample()[1];
  assert.equal(main.attack, true); assert.equal(main.skill, true); assert.equal(main.guard, true);
});

test('失焦、暂停和重新启用清空所有按键及双击历史', () => {
  const { keyboard, target, down } = setup();
  down('KeyA'); down('KeyW'); target.dispatchEvent(new Event('blur'));
  const input = keyboard.sample()[0];
  assert.equal(input.left, false); assert.equal(input.jump, false);
  keyboard.setEnabled(false); down('KeyD');
  assert.equal(keyboard.sample()[0].right, false);
  keyboard.setEnabled(true); down('KeyD');
  assert.equal(keyboard.sample()[0].run, false);
});

test('浏览器组合快捷键不拦截，销毁后解绑监听', () => {
  const { keyboard, down } = setup();
  assert.equal(down('KeyW', { metaKey: true }).defaultPrevented, false);
  assert.equal(keyboard.sample()[0].jump, false);
  keyboard.destroy(); down('KeyJ');
  assert.equal(keyboard.sample()[0].attack, false);
});
