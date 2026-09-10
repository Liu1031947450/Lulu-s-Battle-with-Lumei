/* 原创短旋律与合成音效。浏览器播放和 WAV 导出复用同一合成器。 */
const Soundtrack = (() => {
  const RATE = 22050;
  const CLIPS = {
    swing: [[0, 490, 0.055, 0.21], [0.035, 340, 0.07, 0.12]],
    hit: [[0, 190, 0.08, 0.35], [0.025, 410, 0.11, 0.22], [0.07, 640, 0.07, 0.12]],
    guard: [[0, 960, 0.13, 0.2], [0.03, 1440, 0.17, 0.14]],
    jump: [[0, 430, 0.055, 0.17], [0.045, 580, 0.07, 0.17], [0.09, 740, 0.1, 0.12]],
    'double-jump': [[0, 640, 0.075, 0.14], [0.05, 820, 0.085, 0.16], [0.1, 1120, 0.13, 0.12]],
    land: [[0, 120, 0.08, 0.13]],
    skill: [[0, 330, 0.1, 0.22], [0.07, 490, 0.1, 0.2], [0.14, 740, 0.2, 0.15]],
    bubble: [[0, 830, 0.12, 0.15], [0.07, 1245, 0.15, 0.12]],
    countdown: [[0, 660, 0.15, 0.2]],
    fight: [[0, 660, 0.16, 0.2], [0.08, 880, 0.16, 0.2], [0.16, 1320, 0.2, 0.18]],
    finish: [[0, 523.25, 0.22, 0.22], [0.16, 659.25, 0.22, 0.22], [0.32, 783.99, 0.22, 0.22], [0.52, 1046.5, 0.6, 0.22]],
    click: [[0, 740, 0.08, 0.12], [0.03, 990, 0.08, 0.09]]
  };
  const MELODY = [76, 79, 81, 79, 76, 74, 72, 0, 74, 76, 79, 76, 74, 72, 69, 0, 72, 76, 79, 81, 79, 76, 74, 0, 74, 76, 72, 69, 67, 69, 72, 0, 76, 79, 84, 81, 79, 76, 74, 0, 74, 76, 79, 76, 74, 72, 69, 0, 72, 74, 76, 79, 81, 79, 76, 74, 72, 76, 74, 69, 67, 71, 72, 0];

  function addNote(samples, start, frequency, duration, volume, soft = false) {
    const offset = Math.floor(start * RATE);
    const length = Math.floor(duration * RATE);
    for (let sample = 0; sample < length && sample + offset < samples.length; sample += 1) {
      const seconds = sample / RATE;
      const envelope = Math.min(1, seconds / 0.008) * Math.exp(-seconds / (duration * 0.27)) * Math.min(1, (length - sample) / (RATE * 0.02));
      const phase = seconds * frequency * Math.PI * 2;
      const tone = Math.sin(phase) + Math.sin(phase * 2) * (soft ? 0.12 : 0.23) + Math.sin(phase * 3) * 0.04;
      samples[offset + sample] += tone * volume * envelope;
    }
  }

  function synthesize(name) {
    if (name === 'garden') {
      const samples = new Float32Array(RATE * 16);
      MELODY.forEach((note, index) => {
        if (note) addNote(samples, index * 0.25, 440 * 2 ** ((note - 69) / 12), 0.49, 0.105, true);
      });
      const bass = [48, 48, 45, 45, 53, 53, 55, 55, 48, 48, 45, 45, 53, 55, 48, 48];
      bass.forEach((note, index) => {
        addNote(samples, index, 440 * 2 ** ((note - 69) / 12), 0.72, 0.1, true);
        addNote(samples, index + 0.5, 440 * 2 ** ((note + 7 - 69) / 12), 0.43, 0.05, true);
      });
      for (let sample = 0; sample < samples.length; sample += 1) {
        const fade = Math.min(1, sample / 500, (samples.length - sample) / 1000);
        samples[sample] = Math.max(-0.9, Math.min(0.9, samples[sample] * fade));
      }
      return samples;
    }
    const notes = CLIPS[name];
    if (!notes) throw new RangeError(`未知音效：${name}`);
    const duration = Math.max(...notes.map(note => note[0] + note[2])) + 0.03;
    const samples = new Float32Array(Math.ceil(duration * RATE));
    notes.forEach(note => addNote(samples, ...note));
    return samples;
  }

  class Player {
    constructor() {
      this.context = null;
      this.master = null;
      this.buffers = new Map();
      this.music = null;
      this.enabled = true;
      this.active = false;
    }

    async unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      try {
        if (!this.context) {
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = this.enabled ? 0.47 : 0;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') await this.context.resume();
        return this.context.state === 'running';
      } catch {
        return false;
      }
    }

    buffer(name) {
      if (!this.buffers.has(name)) {
        const samples = synthesize(name);
        const buffer = this.context.createBuffer(1, samples.length, RATE);
        buffer.copyToChannel(samples, 0);
        this.buffers.set(name, buffer);
      }
      return this.buffers.get(name);
    }

    play(name) {
      if (!this.enabled || !this.context || this.context.state !== 'running' || !CLIPS[name]) return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffer(name);
      source.connect(this.master);
      source.start();
    }

    setMusic(active) {
      this.active = active;
      if (this.music) { this.music.stop(); this.music.disconnect(); this.music = null; }
      if (!active || !this.enabled || !this.context || this.context.state !== 'running') return;
      this.music = this.context.createBufferSource();
      this.music.buffer = this.buffer('garden');
      this.music.loop = true;
      this.music.connect(this.master);
      this.music.start();
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.47 : 0, this.context.currentTime, 0.025);
      this.setMusic(this.active);
    }
  }

  return { RATE, CLIPS, MELODY, synthesize, Player };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Soundtrack;
