import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './browser-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.LuluGame?.ready);
  const renderer = await page.evaluate(() => Character3D.status());
  if (renderer.backend !== 'webgl2') throw new Error(`导出必须使用真实 3D 模型，不能静默导出二维回退：${renderer.error}`);
  for (const directory of ['sprites', 'backgrounds', 'effects', 'portraits']) await mkdir(path.join(root, `assets/${directory}`), { recursive: true });
  const generated = await page.evaluate(() => {
    const files = [];
    const cellWidth = 416;
    const cellHeight = 352;
    const columns = 12;
    const animationNames = Object.keys(Artwork.ANIMATIONS);
    for (const kind of ['lulu', 'lumei']) {
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth * columns;
      canvas.height = cellHeight * animationNames.length;
      const context = canvas.getContext('2d');
      const atlas = { image: `${kind}.png`, size: [canvas.width, canvas.height], source: '../../src/characters.mjs', model: `../models/${kind}.glb`, animations: {} };
      animationNames.forEach((state, row) => {
        const animation = Artwork.ANIMATIONS[state];
        atlas.animations[state] = { fps: animation.fps, loop: animation.loop, frames: [] };
        for (let frame = 0; frame < animation.frames; frame += 1) {
          const seconds = frame / animation.fps;
          const elapsed = state === 'attack' ? Math.round(frame / (animation.frames - 1) * 26) : state === 'skill' ? Math.round(frame / (animation.frames - 1) * 45) : Math.round(seconds * 60);
          const fighter = { id: kind === 'lulu' ? 0 : 1, kind, facing: 1, x: cellWidth / 2, y: 286, state, stateFrame: elapsed, jumpFrame: Math.min(18, elapsed), guarding: state === 'guard', crouching: state === 'crouch', move: ['attack', 'skill'].includes(state) ? { frame: elapsed } : null };
          context.save(); context.translate(frame * cellWidth, row * cellHeight);
          Artwork.drawFighter(context, fighter, seconds + 1, { scale: 0.78, shadow: false });
          context.restore();
          const borders = [
            context.getImageData(frame * cellWidth, row * cellHeight, cellWidth, 1).data,
            context.getImageData(frame * cellWidth, (row + 1) * cellHeight - 1, cellWidth, 1).data,
            context.getImageData(frame * cellWidth, row * cellHeight, 1, cellHeight).data,
            context.getImageData((frame + 1) * cellWidth - 1, row * cellHeight, 1, cellHeight).data
          ];
          if (borders.some(border => border.some((value, index) => index % 4 === 3 && value > 0))) throw new Error(`${kind}/${state}/${frame} 超出精灵格边界`);
          atlas.animations[state].frames.push({ x: frame * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight, pivot: [cellWidth / 2, 286] });
        }
      });
      files.push({ path: `sprites/${kind}.png`, png: canvas.toDataURL('image/png').split(',')[1] });
      files.push({ path: `sprites/${kind}.json`, json: atlas });
      const portrait = document.createElement('canvas'); portrait.width = 512; portrait.height = 620;
      Artwork.drawFighter(portrait.getContext('2d'), { id: 0, kind, x: 250, y: 574, facing: 1, state: 'idle', stateFrame: 0 }, 1, { scale: 1.78, shadow: false, view: 'front' });
      files.push({ path: `portraits/${kind}.png`, png: portrait.toDataURL('image/png').split(',')[1] });
      const views = document.createElement('canvas'); views.width = 1800; views.height = 720;
      const viewContext = views.getContext('2d');
      viewContext.fillStyle = '#fcfaf7'; viewContext.fillRect(0, 0, views.width, views.height);
      for (const [index, view] of ['front', 'side', 'back'].entries()) {
        viewContext.fillStyle = '#786652'; viewContext.font = '20px system-ui'; viewContext.textAlign = 'center';
        viewContext.fillText(`${kind === 'lulu' ? '噜噜' : '噜妹'} · ${['正面', '侧面', '背面'][index]}`, index * 600 + 300, 38);
        Artwork.oval(viewContext, index * 600 + 300, 670, 124, 12, '#b1a18625');
        const fighter = { id: 0, kind, state: 'idle', stateFrame: 0 };
        const pose = { ...Artwork.poseFor(fighter, 1), bodyY: 0, headAngle: 0, farArm: 0, nearArm: 0 };
        viewContext.save(); viewContext.translate(index * 600 + 300, 666); viewContext.scale(1.96, 1.96);
        Character3D.draw(viewContext, fighter, 1, pose, view);
        viewContext.restore();
      }
      files.push({ path: `models/${kind}-views.png`, png: views.toDataURL('image/png').split(',')[1] });
    }
    const garden = document.createElement('canvas'); garden.width = 2560; garden.height = 1240;
    const gardenContext = garden.getContext('2d'); gardenContext.scale(2, 2); Artwork.drawScenery(gardenContext, 0, { still: true });
    files.push({ path: 'backgrounds/orange-cloud-garden.png', png: garden.toDataURL('image/png').split(',')[1] });
    const effects = document.createElement('canvas'); effects.width = 1024; effects.height = 512;
    const effectsContext = effects.getContext('2d');
    const sprites = [];
    ['star', 'heart', 'bubble', 'guard', 'dust', 'orange', 'spark', 'flower'].forEach((name, index) => {
      const centerX = (index % 4) * 256 + 128;
      const centerY = Math.floor(index / 4) * 256 + 128;
      if (name === 'star' || name === 'spark') Artwork.star(effectsContext, centerX, centerY, name === 'star' ? 52 : 28, '#efc075', 0.15);
      if (name === 'heart') Artwork.heart(effectsContext, centerX, centerY, 48, '#e6a4b9');
      if (name === 'bubble') { effectsContext.save(); effectsContext.translate(centerX, centerY); effectsContext.scale(2, 2); Artwork.drawProjectile(effectsContext, { x: 0, y: 0, age: 0 }, 0); effectsContext.restore(); }
      if (name === 'guard') { Artwork.oval(effectsContext, centerX, centerY, 44, 71, '#b6e1d077'); effectsContext.strokeStyle = '#7dbcaa'; effectsContext.lineWidth = 4; effectsContext.beginPath(); effectsContext.ellipse(centerX, centerY, 44, 71, 0, 0, Math.PI * 2); effectsContext.stroke(); Artwork.star(effectsContext, centerX, centerY - 13, 19, '#ffffff'); }
      if (name === 'dust') for (let puff = 0; puff < 4; puff += 1) Artwork.oval(effectsContext, centerX - 45 + puff * 29, centerY + Math.sin(puff) * 8, 24, 19, '#e6d4aa');
      if (name === 'orange') { Artwork.oval(effectsContext, centerX, centerY, 48, 45, '#f5b45b'); Artwork.oval(effectsContext, centerX + 9, centerY - 45, 18, 8, '#98b269'); Artwork.oval(effectsContext, centerX - 16, centerY - 16, 8, 11, '#ffdc99'); }
      if (name === 'flower') { for (let petal = 0; petal < 6; petal += 1) Artwork.oval(effectsContext, centerX + Math.cos(petal * Math.PI / 3) * 28, centerY + Math.sin(petal * Math.PI / 3) * 28, 20, 20, '#f7e6c5'); Artwork.oval(effectsContext, centerX, centerY, 17, 17, '#e8bb71'); }
      sprites.push({ name, x: (index % 4) * 256, y: Math.floor(index / 4) * 256, width: 256, height: 256 });
    });
    files.push({ path: 'effects/effects.png', png: effects.toDataURL('image/png').split(',')[1] });
    files.push({ path: 'effects/effects.json', json: { image: 'effects.png', sprites } });
    return files;
  });
  for (const file of generated) await writeFile(path.join(root, 'assets', file.path), file.png ? Buffer.from(file.png, 'base64') : `${JSON.stringify(file.json, null, 2)}\n`);
  console.log(`已导出 ${generated.length} 个图像 / 图集文件，包含每个角色全部 ${16} 种动画。`);
} finally {
  await browser.close();
}
