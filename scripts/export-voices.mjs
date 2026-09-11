import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { wav, readPcmWav } from './wav.mjs';

const rate = 22050;
const output = new URL('../assets/audio/', import.meta.url);
const temporary = await mkdtemp(path.join(tmpdir(), 'lulu-voices-'));
try {
  await mkdir(output, { recursive: true });
  for (const [cue, text] of [['3', '三！'], ['2', '二！'], ['1', '一！'], ['start', '开始！']]) {
    const filename = path.join(temporary, `${cue}.wav`);
    execFileSync('say', ['-v', 'Tingting', '-r', '175', '--file-format=WAVE', '--data-format=LEI16@22050', '-o', filename, text]);
    const pcm = readPcmWav(await readFile(filename), rate);
    const samples = Float32Array.from({ length: pcm.length / 2 }, (sample, index) => pcm.readInt16LE(index * 2) / 32768);
    const threshold = 0.006;
    const first = samples.findIndex(sample => Math.abs(sample) > threshold);
    const last = samples.findLastIndex(sample => Math.abs(sample) > threshold);
    if (first < 0) throw new Error(`${cue} 语音为空`);
    const trimmed = samples.slice(Math.max(0, first - Math.round(rate * 0.02)), Math.min(samples.length, last + Math.round(rate * 0.045)));
    if (trimmed.length >= rate) throw new Error(`${cue} 超过一秒，请提高生成语速`);
    const peak = trimmed.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
    const rms = Math.sqrt(trimmed.reduce((total, sample) => total + sample * sample, 0) / trimmed.length);
    const gain = Math.min(0.14 / rms, 0.85 / peak);
    trimmed.forEach((sample, index) => {
      const fade = Math.min(1, index / (rate * 0.006), (trimmed.length - index - 1) / (rate * 0.012));
      trimmed[index] = sample * gain * fade;
    });
    await writeFile(new URL(`voice-${cue}.wav`, output), wav(trimmed, rate));
    console.log(`voice-${cue}.wav：${text} ${(trimmed.length / rate).toFixed(3)} 秒，Tingting / 175 wpm`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
