import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { exportModels } from './export-models.mjs';
import { wav, readPcmWav } from './wav.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const artwork = require('../src/art.js');
const soundtrack = require('../src/audio.js');
await exportModels();
const characters = await build({
  entryPoints: [path.join(root, 'src/characters.mjs')], bundle: true, write: false,
  format: 'iife', globalName: 'Character3D', minify: true, target: 'es2022',
  loader: { '.glb': 'base64' }, supported: { 'template-literal': false }, legalComments: 'inline'
});
const template = await readFile(path.join(root, 'src/page.html'), 'utf8');
const styles = await readFile(path.join(root, 'src/style.css'), 'utf8');
const sourceNames = ['engine', 'input', 'art', 'audio', 'app'];
const sources = await Promise.all(sourceNames.map(name => readFile(path.join(root, `src/${name}.js`), 'utf8')));
const networkSource = await readFile(path.join(root, 'src/network.mjs'), 'utf8');
const gameBuild = createHash('sha256').update(sources.join('\n') + networkSource).digest('hex').slice(0, 16);
const network = await build({
  entryPoints: [path.join(root, 'src/network.mjs')], bundle: true, write: false,
  format: 'iife', globalName: 'Online', minify: true, target: 'es2022',
  define: { __LULU_BUILD__: JSON.stringify(gameBuild) }, legalComments: 'inline'
});
const voices = {};
for (const cue of ['3', '2', '1', 'start']) {
  const pcm = readPcmWav(await readFile(path.join(root, `assets/audio/voice-${cue}.wav`)), soundtrack.RATE);
  if (pcm.length >= soundtrack.RATE * 2) throw new Error(`voice-${cue}.wav 必须短于一秒`);
  voices[cue] = pcm.toString('base64');
}
const audioIndex = sourceNames.indexOf('audio');
if (!sources[audioIndex].includes('/*__VOICE_PCM__*/{}')) throw new Error('缺少语音数据占位符');
sources[audioIndex] = sources[audioIndex].replace('/*__VOICE_PCM__*/{}', JSON.stringify(voices));
if (!template.includes('/*__GAME_CSS__*/') || !template.includes('<!--__GAME_SCRIPT__-->')) throw new Error('缺少发布模板占位符');
const bundle = [characters.outputFiles[0].text, network.outputFiles[0].text, ...sources].join('\n\n').replace(/<\/script/gi, '<\\/script');
const html = template.replace('/*__GAME_CSS__*/', () => styles).replace('<!--__GAME_SCRIPT__-->', () => `<script>\n${bundle}\n</script>`);
await writeFile(path.join(root, 'index.html'), html);
const preview = await readFile(path.join(root, 'src/model-preview.html'), 'utf8');
const previewBundle = `${characters.outputFiles[0].text}\n${sources[sourceNames.indexOf('art')]}`.replace(/<\/script/gi, '<\\/script');
await writeFile(path.join(root, 'assets/models/preview.html'), preview.replace('<!--__MODEL_SCRIPT__-->', () => `<script>${previewBundle}</script>`));
await mkdir(path.join(root, 'assets/models'), { recursive: true });
await mkdir(path.join(root, 'assets/audio'), { recursive: true });
for (const kind of ['lulu', 'lumei']) await writeFile(path.join(root, `assets/models/${kind}.svg`), artwork.modelSvg(kind));
await writeFile(path.join(root, 'assets/animation-definitions.json'), `${JSON.stringify({ format: 'glTF-2.0', models: ['models/lulu.glb', 'models/lumei.glb'], source: '../src/art.js', fallback: 'layered-2d', animations: artwork.ANIMATIONS }, null, 2)}\n`);

for (const name of ['garden', ...Object.keys(soundtrack.CLIPS)]) {
  await writeFile(path.join(root, `assets/audio/${name}.wav`), wav(soundtrack.synthesize(name), soundtrack.RATE));
}
console.log(`已构建 index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)，内嵌 3D 引擎与两套 GLB；已导出模型预览、二维回退 SVG 和 WAV。`);
