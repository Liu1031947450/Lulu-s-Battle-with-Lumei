export function wav(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2));
  return buffer;
}

export function readPcmWav(buffer, rate) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) throw new Error('无效或不完整的 WAV');
  let validFormat = false;
  let pcm;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error('WAV 数据越界');
    if (kind === 'fmt ') {
      validFormat = length >= 16 && buffer.readUInt16LE(start) === 1 && buffer.readUInt16LE(start + 2) === 1 && buffer.readUInt32LE(start + 4) === rate && buffer.readUInt32LE(start + 8) === rate * 2 && buffer.readUInt16LE(start + 12) === 2 && buffer.readUInt16LE(start + 14) === 16;
    }
    if (kind === 'data') pcm = buffer.subarray(start, start + length);
    offset = start + length + length % 2;
  }
  if (!validFormat || !pcm?.length || pcm.length % 2) throw new Error(`语音必须为单声道 ${rate} Hz / 16-bit PCM WAV`);
  return pcm;
}
