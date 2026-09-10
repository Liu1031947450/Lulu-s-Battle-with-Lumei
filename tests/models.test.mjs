import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { AnimationMixer, Box3, LoopOnce } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyPose, bindRig } from '../src/character-rig.mjs';

const require = createRequire(import.meta.url);
const { ANIMATIONS, poseFor } = require('../src/art.js');

for (const kind of ['lulu', 'lumei']) {
  test(`${kind} GLB 可独立加载，包含三维设计特征及全部 16 种可播放动作`, async () => {
    const buffer = await readFile(new URL(`../assets/models/${kind}.glb`, import.meta.url));
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
    assert.equal(json.asset.version, '2.0');
    assert.equal(json.buffers.length, 1);
    assert.equal(json.buffers[0].uri, undefined);
    assert.equal(json.images?.length || 0, 0);
    assert.equal(json.materials.some(surface => surface.name === (kind === 'lulu' ? 'blue_iris' : 'blush_pink_cotton')), true);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    const model = gltf.scene.getObjectByName(kind);
    assert.ok(model);
    const rig = bindRig(model);
    const features = kind === 'lulu' ? ['two_leg_orange_shorts', 'green_fruit_stem'] : ['bonnet_full_back_cap', 'bonnet_scalloped_ruffle', 'puffed_romper', 'little_duck_badge', 'neckline_bow', 'left_green_sprout', 'right_green_sprout'];
    for (const name of ['sculpted_head_and_muzzle', 'small_round_yellow_tail', ...features]) assert.ok(model.getObjectByName(name), name);
    const bounds = new Box3().setFromObject(model);
    assert.ok(Math.abs(bounds.min.y) < 0.025, '脚底以 Y=0 为锚点');
    assert.ok(bounds.max.y > 3.4 && bounds.max.y < 4.3);
    assert.ok(bounds.max.z > 0.7 && bounds.min.z < -0.6, '模型具有真实前后体积');
    model.traverse(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.getAttribute('position');
      assert.ok(positions.count > 0);
      assert.ok(positions.array.every(Number.isFinite), object.name);
      assert.ok(object.geometry.getAttribute('normal').array.every(Number.isFinite), object.name);
    });
    assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), Object.keys(ANIMATIONS).sort());
    const mixer = new AnimationMixer(model);
    for (const clip of gltf.animations) {
      assert.equal(clip.validate(), true, clip.name);
      assert.ok(clip.duration > 0);
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();
      mixer.setTime(clip.duration * 0.5);
      model.traverse(object => {
        for (const value of [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]) assert.ok(Number.isFinite(value), `${clip.name}/${object.name}`);
      });
      mixer.stopAllAction();
    }
    const walk = mixer.clipAction(gltf.animations.find(clip => clip.name === 'walk'));
    walk.reset().play();
    mixer.setTime(0.08);
    const initial = rig.near_arm.quaternion.clone();
    mixer.setTime(0.3);
    assert.ok(initial.angleTo(rig.near_arm.quaternion) > 0.1, '关节动画不是静态立绘位移');
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    const fighter = { kind, state: 'attack', stateFrame: 9, move: { frame: 9 }, facing: 1 };
    const pose = poseFor(fighter, 1);
    applyPose(rig, pose, fighter, 1);
    assert.ok(rig.near_arm.rotation.z > 1);
    assert.ok(rig.near_arm.scale.y > 1);
    applyPose(rig, pose, { ...fighter, facing: -1 }, 1);
    assert.ok(rig.far_arm.rotation.z < -1, '换边时改用左侧出拳关节，而不是镜像服装徽章');
    assert.equal(rig.near_arm.scale.y, 1, '换边不遗留上一只手臂的伸长');
    assert.ok(model.scale.x > 0);
  });
}
