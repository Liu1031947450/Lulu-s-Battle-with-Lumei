const Controls = (() => {
  const BINDINGS = [
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], crouch: ['KeyS'], attack: ['KeyJ'], skill: ['KeyK'], guard: ['KeyL'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], crouch: ['ArrowDown'], attack: ['Numpad1', 'Digit1'], skill: ['Numpad2', 'Digit2'], guard: ['Numpad3', 'Digit3'] }
  ];
  const ALL_KEYS = new Set(BINDINGS.flatMap(binding => Object.values(binding).flat()));

  class Keyboard {
    constructor(target) {
      this.target = target;
      this.enabled = false;
      this.held = new Set();
      this.edges = new Set();
      this.running = new Set();
      this.lastTap = new Map();
      this.down = event => this.keyDown(event);
      this.up = event => this.keyUp(event);
      this.blur = () => this.clear();
      target.addEventListener('keydown', this.down);
      target.addEventListener('keyup', this.up);
      target.addEventListener('blur', this.blur);
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      this.clear();
    }

    keyDown(event) {
      if (!this.enabled || !ALL_KEYS.has(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      if (event.repeat || this.held.has(event.code)) return;
      this.held.add(event.code);
      this.edges.add(event.code);
      const directions = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
      if (directions.includes(event.code)) {
        const time = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
        const previous = this.lastTap.get(event.code);
        if (previous !== undefined && time >= previous && time - previous <= 260) this.running.add(event.code);
        this.lastTap.set(event.code, time);
      }
    }

    keyUp(event) {
      if (!ALL_KEYS.has(event.code)) return;
      if (this.enabled) event.preventDefault();
      this.held.delete(event.code);
      this.running.delete(event.code);
    }

    sample() {
      const result = BINDINGS.map(binding => {
        const input = {};
        for (const [action, codes] of Object.entries(binding)) {
          const source = ['jump', 'attack', 'skill'].includes(action) ? this.edges : this.held;
          input[action] = codes.some(code => source.has(code));
        }
        input.run = [...binding.left, ...binding.right].some(code => this.running.has(code) && this.held.has(code));
        return input;
      });
      this.edges.clear();
      return result;
    }

    clear() {
      this.held.clear();
      this.edges.clear();
      this.running.clear();
      this.lastTap.clear();
    }

    destroy() {
      this.target.removeEventListener('keydown', this.down);
      this.target.removeEventListener('keyup', this.up);
      this.target.removeEventListener('blur', this.blur);
      this.clear();
    }
  }

  return { BINDINGS, Keyboard };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Controls;
