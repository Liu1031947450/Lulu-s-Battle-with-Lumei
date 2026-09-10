# 噜噜与噜妹 · 3D 角色交付

依据本次提供的正面、侧面、背面参考重建，沿用游戏原有命名：**噜噜 `lulu` 是橙色短裤款，噜妹 `lumei` 是粉色围兜连体衣款**。

## 文件与预览

| 文件 | 内容 |
| --- | --- |
| `assets/models/lulu.glb` | 黄色圆润头身、蓝眼睛、橘子与绿蒂、橙色短裤、圆尾巴 |
| `assets/models/lumei.glb` | 胖嘟嘟体型、完整后脑软帽与荷叶边、双叶橘子头饰、奶白圆领、粉色蝴蝶结、鸭子徽章、泡泡袖与蓬松连体衣、圆尾巴 |
| `assets/models/preview.html` | 可直接离线打开的正 / 侧 / 背 / 转台及动作预览；按钮可下载相邻 GLB |
| `assets/models/lulu-views.png`、`assets/models/lumei-views.png` | 从实际 3D 网格渲染的 1800×720 三视图，不是另画的替代图 |
| `assets/models/manifest.json` | 三角面数、尺寸、文件体积、动作时长与循环方式 |
| `assets/portraits/`、`assets/sprites/` | 同一模型导出的透明立绘及 16 状态 / 120 帧 PNG 图集 |

两份 GLB 均为独立 glTF 2.0 二进制，包含网格、PBR 材质、面部顶点色及动画；**没有外部贴图、远程 CDN 或额外 `.bin` 依赖**。坐标为 **+Y 向上、+Z 正面、脚底 Y=0**，单位为米；游戏映射为每单位 78 像素。模型约 3.6 / 4 米高，在其他场景中按需统一缩放。

## 当前项目如何使用

直接打开根目录 `index.html` 即可体验。构建时 `scripts/build.mjs` 将 Three.js、加载器和两份 GLB 内嵌进单文件，`src/characters.mjs` 从内存导入模型，在离屏 WebGL 画布中渲染，再合成到原游戏画布。

`src/art.js` 的 `Artwork.drawFighter()` 是已有统一入口，首页、对战、HUD、胜负立绘及资源导出均走此路径。战斗逻辑、碰撞、伤害、输入、音频和胜负规则没有变更。实时关节由原来的 `poseFor()` 驱动；导出的 GLB 动画由同一套姿势采样，避免改动出招时机。

WebGL 2 不可用或上下文丢失时，游戏使用原二维分层角色继续运行；不会把旧 SVG 冒充新 3D 模型。`Character3D.status()` 可查看实际渲染后端。原 `lulu.svg`、`lumei.svg` 仅是兼容回退资源，不是此次三维交付。

## 在 Three.js 场景中导入并播放

以下示例用于已配置 Three.js 模块解析和静态资源服务的项目；URL 以该项目公开资源根目录为准。普通 `GLTFLoader.loadAsync()` 不适合直接跨文件读取 `file://`，需要免服务器预览时打开本目录 `preview.html`。

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(640, 720);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fcfaf7');
scene.add(new THREE.HemisphereLight(0xffffff, 0xbda888, 2));
const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(-3, 6, 5);
scene.add(key);
const camera = new THREE.PerspectiveCamera(35, 640 / 720, 0.1, 100);
camera.position.set(0, 2, 8);
camera.lookAt(0, 2, 0);

const gltf = await new GLTFLoader().loadAsync('/assets/models/lumei.glb');
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
const idle = THREE.AnimationClip.findByName(gltf.animations, 'idle');
mixer.clipAction(idle).play();
let previous = 0;
renderer.setAnimationLoop(milliseconds => {
  mixer.update(previous ? Math.min((milliseconds - previous) / 1000, 0.1) : 0);
  previous = milliseconds;
  renderer.render(scene, camera);
});
```

更换为 `/assets/models/lulu.glb` 可加载橙裤款。`gltf.animations` 包含：

`idle`、`walk`、`run`、`jump`、`double-jump`、`crouch`、`rise`、`backstep`、`attack`、`skill`、`guard`、`hit`、`stun`、`defeat`、`victory`、`draw`。

单次动作使用 `action.setLoop(THREE.LoopOnce, 1)`；下蹲、倒地等停在末帧时设置 `action.clampWhenFinished = true`。循环规则与精确时长见 `manifest.json`。

## 可编辑来源与再生成

```sh
npm ci
npm run models
npm run build
npm run assets
npm test
npm run test:browser
```

- `scripts/export-models.mjs`：头身曲面、连续口鼻顶点色、帽壳、褶边、服装、五官、装饰与 GLB 导出。
- `src/character-rig.mjs`：头部、四肢、翻转、表情的共享关节映射。
- `src/model-preview.html`：离线预览页面源模板。
- `npm run models` 只再生成模型；`npm run build` 会同时生成模型并更新游戏 / 预览内嵌副本。改动几何后应再运行 `npm run assets`，同步 PNG。

## 交付边界

这是按图片观察重建的可编辑程序化三维网格，并非从参考图片提取的官方原始模型，不宣称逐像素或工业扫描级一致。角色采用**分部件关节层级动画**，不是 Humanoid 蒙皮骨架；可直接播放附带动画，但未提供人体骨骼重定向、布料物理或 `.fbx`。GLB 已是本项目直接使用的标准格式，不需要额外格式转换。
