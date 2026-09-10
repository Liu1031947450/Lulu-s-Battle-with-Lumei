import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyPose, bindRig, PIXELS_PER_UNIT } from './character-rig.mjs';
import luluData from '../assets/models/lulu.glb';
import lumeiData from '../assets/models/lumei.glb';

const models = new Map();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-2.25, 2.25, 2.2, -2.2, 0.1, 30);
camera.position.set(0, 1.95, 9);
camera.lookAt(0, 1.95, 0);
const views = { front: 0, battle: 0.3, side: Math.PI / 2, back: Math.PI };
let renderer;
let state = 'loading';
let failure = null;

async function initialize() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!context) {
      state = 'fallback';
      failure = 'WebGL 2 unavailable';
      return;
    }
    renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(720, 704, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    scene.environment = generator.fromScene(environment, 0.04).texture;
    scene.environmentIntensity = 0.3;
    environment.dispose();
    generator.dispose();
    scene.add(new THREE.HemisphereLight('#fff7eb', '#c4b493', 0.85));
    const key = new THREE.DirectionalLight('#fff5e5', 1.9);
    key.position.set(-3.5, 6.5, 5);
    key.target.position.set(0, 2, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 15;
    key.shadow.normalBias = 0.018;
    key.shadow.bias = -0.00015;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#edf3ff', 0.65);
    fill.position.set(4, 3.2, 4);
    scene.add(fill);
    const bounce = new THREE.DirectionalLight('#fff0ce', 0.85);
    bounce.position.set(0, -4, 3);
    scene.add(bounce);
    const rim = new THREE.DirectionalLight('#fff3dc', 1.5);
    rim.position.set(1, 5, -4);
    scene.add(rim);
    const loader = new GLTFLoader();
    for (const [kind, encoded] of [['lulu', luluData], ['lumei', lumeiData]]) {
      const data = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const gltf = await loader.parseAsync(data.buffer, '');
      const model = gltf.scene.getObjectByName(kind);
      if (!model) throw new Error(`GLB 缺少角色根节点：${kind}`);
      model.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      const rig = bindRig(model);
      models.set(kind, { model, rig, animations: gltf.animations });
      scene.add(model);
      model.visible = false;
    }
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); state = 'context-lost'; });
    canvas.addEventListener('webglcontextrestored', () => { state = 'ready'; });
    state = 'ready';
  } catch (error) {
    failure = error.message;
    state = 'fallback';
    renderer?.dispose();
    renderer = null;
    console.warn('3D 角色不可用，已保留二维角色与全部玩法。', error);
  }
}

export const ready = initialize();

export function status() {
  return { state, backend: state === 'ready' ? 'webgl2' : 'canvas2d', error: failure, models: [...models].map(([kind, entry]) => ({ kind, animations: entry.animations.map(clip => clip.name) })) };
}

export function draw(context, fighter, time, pose, view = 'battle') {
  if (state !== 'ready') return false;
  const entry = models.get(fighter.kind);
  if (!entry) return false;
  const facing = fighter.facing === -1 ? -1 : 1;
  for (const model of models.values()) model.model.visible = model === entry;
  entry.model.rotation.y = typeof view === 'number' && Number.isFinite(view) ? view : (views[view] ?? views.battle);
  if (view === 'battle') entry.model.rotation.y *= facing;
  applyPose(entry.rig, pose, fighter, time, false);
  renderer.render(scene, camera);
  context.save();
  context.scale(facing, 1);
  context.drawImage(renderer.domElement, -2.25 * PIXELS_PER_UNIT, -4.15 * PIXELS_PER_UNIT, 4.5 * PIXELS_PER_UNIT, 4.4 * PIXELS_PER_UNIT);
  context.restore();
  return true;
}
