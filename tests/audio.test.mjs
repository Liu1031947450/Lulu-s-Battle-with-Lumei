import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import soundtrack from '../src/audio.js';
import { wav, readPcmWav } from '../scripts/wav.mjs';

const { Player, RATE } = soundtrack;
const voices = Object.fromEntries(['3', '2', '1', 'start'].map(cue => [cue, readPcmWav(readFileSync(new URL(`../assets/audio/voice-${cue}.wav`, import.meta.url)), RATE).toString('base64')]));

function playerWithAudio(data = voices) {
  const player = new Player(data);
  player.master = { gain: { setTargetAtTime() {} } };
  player.context = {
    state: 'running', currentTime: 0, sources: [],
    createBuffer(channels, length, sampleRate) {
      assert.equal(channels, 1);
      return { length, sampleRate, copyToChannel(samples) { this.samples = samples; } };
    },
    createBufferSource() {
      const source = { starts: 0, stops: 0, disconnects: 0, connect() {}, start() { this.starts += 1; }, stop() { this.stops += 1; }, disconnect() { this.disconnects += 1; } };
      this.sources.push(source);
      return source;
    }
  };
  return player;
}

test('四段中文语音均为短于一秒的有效 PCM，音量一致、无削波且内容不同', () => {
  const levels = [];
  assert.equal(new Set(Object.values(voices)).size, 4);
  for (const cue of Object.keys(voices)) {
    const player = playerWithAudio();
    const buffer = player.buffer(`voice-${cue}`);
    assert.ok(buffer.length / RATE > 0.12 && buffer.length / RATE < 1);
    assert.equal(buffer.sampleRate, RATE);
    assert.equal(buffer.samples[0], 0);
    assert.equal(buffer.samples.at(-1), 0);
    assert.ok(buffer.samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.851));
    const rms = Math.sqrt(buffer.samples.reduce((sum, sample) => sum + sample * sample, 0) / buffer.length);
    assert.ok(rms > 0.12 && rms < 0.2);
    levels.push(rms);
    assert.equal(player.buffer(`voice-${cue}`), buffer);
  }
  assert.ok(Math.max(...levels) / Math.min(...levels) < 1.2);
});

test('语音只保留当前一段，停止、静音与迟到的 ended 不会串入下一拍', () => {
  const player = playerWithAudio();
  assert.equal(player.playVoice('3'), true);
  const first = player.voice;
  const ended = first.onended;
  assert.equal(first.starts, 1);
  player.playVoice('2');
  const second = player.voice;
  assert.equal(first.stops, 1);
  assert.equal(first.onended, null);
  ended();
  assert.equal(player.voice, second);
  player.setEnabled(false);
  assert.equal(second.stops, 1);
  assert.equal(player.voice, null);
  assert.equal(player.playVoice('1'), false);
  player.setEnabled(true);
  assert.equal(player.voice, null);
  assert.equal(player.context.sources.length, 2);
  player.context.state = 'suspended';
  player.playVoice('start');
  const pending = player.voice;
  player.stopVoice(); player.stopVoice();
  assert.equal(pending.stops, 1);
  assert.equal(player.voice, null);
  player.context.state = 'running';
  assert.equal(player.context.sources.length, 3);
});

test('缺失或损坏语音回退到原提示音，音频不可用不抛错也不等待', () => {
  for (const data of [{}, { 3: '@@@@' }, { 3: 'AA==' }, { 3: Buffer.alloc(RATE * 2).toString('base64') }]) {
    const player = playerWithAudio(data);
    assert.equal(player.playVoice('3'), true);
    assert.equal(player.voice.buffer, player.buffer('countdown'));
    player.playVoice('start');
    assert.equal(player.voice.buffer, player.buffer('fight'));
    player.stopVoice();
  }
  const player = playerWithAudio();
  assert.equal(player.playVoice('unknown'), false);
  player.context.state = 'closed';
  assert.equal(player.playVoice('3'), false);
  assert.equal(new Player().playVoice('3'), false);
  player.context.state = 'running';
  player.context.createBufferSource = () => { throw new Error('音频设备不可用'); };
  assert.equal(player.playVoice('3'), false);
});

test('语音构建拒绝截断、错误采样率、声道及非 PCM WAV', () => {
  const buffer = wav(Float32Array.of(0, 0.5, -0.5, 0), RATE);
  assert.equal(readPcmWav(buffer, RATE).length, 8);
  assert.throws(() => readPcmWav(buffer.subarray(0, -1), RATE));
  assert.throws(() => readPcmWav(buffer, 44100));
  for (const offset of [20, 22, 34]) {
    const invalid = Buffer.from(buffer);
    invalid.writeUInt16LE(8, offset);
    assert.throws(() => readPcmWav(invalid, RATE));
  }
  const overflow = Buffer.from(buffer);
  overflow.writeUInt32LE(999999, 40);
  assert.throws(() => readPcmWav(overflow, RATE));
});
