import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyPose, bindRig, PIXELS_PER_UNIT } from '../src/character-rig.mjs';

const require = createRequire(import.meta.url);
const { ANIMATIONS, poseFor } = require('../src/art.js');
const output = new URL('../assets/models/', import.meta.url);
const sphere = new THREE.SphereGeometry(1, 48, 32);
const clamp = THREE.MathUtils.clamp;

function material(name, color, options = {}) {
  const result = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, ...options });
  result.name = name;
  return result;
}

function group(parent, name, position = [0, 0, 0]) {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}

function mesh(parent, name, geometry, surface, position = [0, 0, 0], scale = [1, 1, 1]) {
  const result = new THREE.Mesh(geometry, surface);
  result.name = name;
  result.position.set(...position);
  result.scale.set(...scale);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

function oval(parent, name, surface, position, scale) {
  return mesh(parent, name, sphere, surface, position, scale);
}

function surfaceGeometry(columns, rows, point) {
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) positions.push(...point(column / columns, row / rows));
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const offset = row * (columns + 1) + column;
      indices.push(offset, offset + columns + 1, offset + 1, offset + 1, offset + columns + 1, offset + columns + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const welded = mergeVertices(geometry, 0.00001);
  geometry.dispose();
  const triangles = [];
  const weldedIndex = welded.getIndex();
  for (let triangle = 0; triangle < weldedIndex.count; triangle += 3) {
    const first = weldedIndex.getX(triangle);
    const second = weldedIndex.getX(triangle + 1);
    const third = weldedIndex.getX(triangle + 2);
    if (first !== second && second !== third && first !== third) triangles.push(first, second, third);
  }
  welded.setIndex(triangles);
  welded.computeVertexNormals();
  return welded;
}

function tube(parent, name, surface, points, radius = 0.01, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), closed);
  return mesh(parent, name, new THREE.TubeGeometry(curve, Math.max(20, points.length * 3), radius, 8, closed), surface);
}

function ringPoints(radiusX, radiusZ, height, count = 80) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return [Math.sin(angle) * radiusX, height, Math.cos(angle) * radiusZ];
  });
}

function ruffle(parent, name, surface, radiusX, radiusZ, height, width, folds = 18) {
  const geometry = surfaceGeometry(144, 12, (around, across) => {
    const angle = around * Math.PI * 2;
    const section = across * Math.PI * 2;
    const wave = Math.sin(angle * folds);
    const flare = Math.cos(section) * 0.017 + wave * 0.009;
    return [Math.sin(angle) * (radiusX + flare), height - width * 0.5 + Math.sin(section) * width * 0.43 + wave * 0.011, Math.cos(angle) * (radiusZ + flare)];
  });
  return mesh(parent, name, geometry, surface);
}

function roundedBox(position, center, halfSize, radius) {
  const distances = position.map((coordinate, index) => Math.abs(coordinate - center[index]) - halfSize[index] + radius);
  return Math.hypot(...distances.map(value => Math.max(value, 0))) + Math.min(Math.max(...distances), 0) - radius;
}

function ellipsoidDistance(position, center, radii) {
  const local = position.map((coordinate, index) => coordinate - center[index]);
  const first = Math.hypot(...local.map((coordinate, index) => coordinate / radii[index]));
  const second = Math.hypot(...local.map((coordinate, index) => coordinate / radii[index] ** 2));
  return second < 0.00001 ? -Math.min(...radii) : first * (first - 1) / second;
}

function smoothUnion(first, second, width) {
  const blend = clamp(0.5 + 0.5 * (second - first) / width, 0, 1);
  return second * (1 - blend) + first * blend - width * blend * (1 - blend);
}

function sculptPants(pink, fabric) {
  const resolution = 80;
  const extent = 1.02;
  const centerHeight = 0.77;
  const field = new MarchingCubes(resolution, fabric, false, false, 70000);
  field.isolation = 0;
  for (let depth = 0; depth < resolution; depth += 1) {
    for (let row = 0; row < resolution; row += 1) {
      for (let column = 0; column < resolution; column += 1) {
        const position = [(column / resolution * 2 - 1) * extent, (row / resolution * 2 - 1) * extent + centerHeight, (depth / resolution * 2 - 1) * extent];
        let distance;
        if (pink) {
          distance = ellipsoidDistance(position, [0, 0.91, 0], [0.84, 0.435, 0.505]);
          for (const side of [-1, 1]) distance = smoothUnion(distance, ellipsoidDistance(position, [side * 0.39, 0.68, 0], [0.354, 0.215, 0.385]), 0.14);
          distance = smoothUnion(distance, ellipsoidDistance(position, [0, 0.545, 0], [0.25, 0.17, 0.32]), 0.11);
          const fold = Math.sin(Math.atan2(position[2], position[0]) * 34 + position[1] * 4);
          distance += fold * 0.007 * Math.exp(-(((position[1] - 1.0) / 0.2) ** 2));
        } else {
          const depthScale = 1 + 0.075 * Math.max(0, 1 - (position[0] / 0.76) ** 2) * Math.exp(-(((position[1] - 0.75) / 0.27) ** 2));
          distance = roundedBox([position[0], position[1], position[2] / depthScale], [0, 0.755, 0], [0.758, 0.282, 0.427], 0.14);
        }
        if (!pink) distance = Math.max(distance, -roundedBox(position, [0, 0.30, 0], [0.094, 0.29, 0.65], 0.04));
        field.field[depth * resolution * resolution + row * resolution + column] = -distance;
      }
    }
  }
  field.update();
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const attribute = field.geometry.getAttribute(name);
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array.slice(0, field.geometry.drawRange.count * 3), 3));
  }
  geometry.scale(extent, extent, extent);
  geometry.translate(0, centerHeight, 0);
  const welded = mergeVertices(geometry, 0.00001);
  geometry.dispose();
  field.geometry.dispose();
  return welded;
}

function createCharacter(kind) {
  const pink = kind === 'lumei';
  const skin = material('warm_yellow_skin', '#ffda35', { roughness: 0.6 });
  const earInside = material('ear_inner_honey', '#eeb324');
  const muzzleColor = new THREE.Color('#ffac13');
  const fabric = material(pink ? 'blush_pink_cotton' : 'tangerine_shorts', pink ? '#f4b9b4' : '#ee8014', { roughness: 0.88, sheen: pink ? 0.25 : 0, sheenColor: new THREE.Color('#ffe7dc'), side: THREE.DoubleSide });
  const seam = material('cloth_seams', pink ? '#d99d98' : '#d97a20', { roughness: 0.95 });
  const cream = material('ivory_cotton', '#fff3e6', { roughness: 0.9, sheen: 0.28, sheenColor: new THREE.Color('#fff7ed'), side: THREE.DoubleSide });
  const creamSeam = material('bonnet_seam', '#e9d9c8', { roughness: 0.95 });
  const ribbon = material('pink_ribbon', '#f6c1b8', { roughness: 0.78 });
  const white = material('eye_white', '#fffdf5', { roughness: 0.25 });
  const iris = material(pink ? 'dark_brown_iris' : 'blue_iris', pink ? '#3d352d' : '#639bd8', { roughness: 0.25 });
  const black = material('glossy_pupil', '#11171d', { roughness: 0.12, clearcoat: 0.8 });
  const highlight = material('eye_catchlight', '#ffffff', { roughness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const smileMaterial = material('smile_line', '#805121', { roughness: 0.8 });
  const mouthMaterial = material('mouth_interior', '#702018', { roughness: 0.92 });
  const tongue = material('tongue', '#dc6d59', { roughness: 0.76 });
  const orange = material('orange_peel', '#ff9f13', { roughness: 0.69 });
  const green = material('green_stem', '#73942e', { roughness: 0.85 });
  const leaf = material('spring_green_leaves', '#a8c744', { roughness: 0.66, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.name = kind;
  root.userData = { kind, design: pink ? 'pink-romper-ivory-bonnet' : 'orange-shorts-blue-eyes', units: 'meters', forward: '+Z', pixelsPerUnit: PIXELS_PER_UNIT, reference: 'User-supplied front, side and rear character sheets' };
  const motion = group(root, 'motion');
  const somersault = group(motion, 'somersault', [0, 125 / PIXELS_PER_UNIT, 0]);
  const body = group(somersault, 'body', [0, -125 / PIXELS_PER_UNIT, 0]);
  const headJoint = group(body, 'head_joint', [0, 1.72, 0]);
  const headHeight = pink ? 2.38 : 2.36;
  const headRadius = [pink ? 1.015 : 0.96, pink ? 0.895 : 0.84, pink ? 0.735 : 0.7];
  const cheekWidth = normalizedY => 1 + 0.075 * Math.exp(-(((normalizedY + 0.27) / 0.48) ** 2)) - 0.025 * normalizedY;
  const radialAt = normalizedY => Math.sqrt(Math.max(0, 1 - Math.abs(normalizedY) ** (2 / 0.88))) ** 0.8;
  const protrusion = normalizedY => 0.335 * Math.exp(-(((normalizedY + 0.43) / 0.56) ** 6)) * Math.min(1, radialAt(normalizedY) * 3);
  const faceDepth = (horizontal, height) => {
    const normalizedY = (height - headHeight) / headRadius[1];
    const radial = radialAt(normalizedY);
    const cosine = Math.sqrt(Math.max(0, 1 - (horizontal / (headRadius[0] * cheekWidth(normalizedY) * radial)) ** 2));
    return headRadius[2] * radial * cosine + protrusion(normalizedY) * cosine ** 6;
  };
  const headGeometry = surfaceGeometry(128, 96, (around, vertical) => {
    const longitude = around * Math.PI * 2;
    const latitude = vertical * Math.PI;
    const normalizedY = Math.sign(Math.cos(latitude)) * Math.abs(Math.cos(latitude)) ** 0.88;
    const radial = Math.sin(latitude) ** 0.8;
    return [headRadius[0] * radial * Math.sin(longitude) * cheekWidth(normalizedY), headHeight - 1.72 + headRadius[1] * normalizedY, headRadius[2] * radial * Math.cos(longitude) + protrusion(normalizedY) * Math.max(0, Math.cos(longitude)) ** 6];
  });
  const colors = [];
  const position = headGeometry.getAttribute('position');
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const horizontal = position.getX(vertex);
    const vertical = position.getY(vertex) + 1.72;
    const depth = position.getZ(vertex);
    const faceEllipse = (horizontal / (headRadius[0] * 0.93)) ** 2 + ((vertical - (headHeight - 0.27)) / (pink ? 0.51 : 0.485)) ** 2;
    const blend = (1 - THREE.MathUtils.smoothstep(faceEllipse, 0.92, 1.18)) * THREE.MathUtils.smoothstep(depth, 0.18, 0.49);
    const color = skin.color.clone().lerp(muzzleColor, blend);
    colors.push(color.r, color.g, color.b);
  }
  headGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const faceMaterial = material('continuous_yellow_orange_face', '#ffffff', { vertexColors: true, roughness: 0.57 });
  mesh(headJoint, 'sculpted_head_and_muzzle', headGeometry, faceMaterial);

  for (const side of [-1, 1]) {
    const ear = group(headJoint, side < 0 ? 'left_ear' : 'right_ear', [side * (pink ? 0.88 : 0.83), 2.94 - 1.72, 0.025]);
    ear.rotation.z = -side * 0.42;
    oval(ear, 'outer_ear', skin, [0, 0, 0], [0.157, 0.205, 0.105]);
    oval(ear, 'inner_ear', earInside, [0, 0.007, 0.087], [0.085, 0.128, 0.027]);
  }

  const eyesHeight = pink ? 2.72 : 2.7;
  const eyes = group(headJoint, 'eyes', [0, eyesHeight - 1.72, 0]);
  const closedEyes = group(headJoint, 'closed_eyes', [0, eyesHeight - 1.72, 0]);
  for (const side of [-1, 1]) {
    const horizontal = side * (pink ? 0.398 : 0.368);
    const depth = faceDepth(horizontal, eyesHeight) - 0.008;
    const eye = group(eyes, side < 0 ? 'left_eye' : 'right_eye', [horizontal, 0, depth]);
    eye.rotation.y = side * 0.18;
    eye.rotation.z = -side * 0.1;
    oval(eye, 'eye_sclera', white, [0, 0, 0], [pink ? 0.177 : 0.164, 0.193, 0.053]);
    oval(eye, 'iris', iris, [0.009, -0.016, 0.045], [pink ? 0.135 : 0.117, 0.153, 0.02]);
    oval(eye, 'pupil', black, [0.012, -0.02, 0.06], [pink ? 0.117 : 0.089, 0.124, 0.017]);
    oval(eye, 'large_catchlight', highlight, [-0.025, 0.067, 0.078], [0.032, 0.034, 0.01]);
    oval(eye, 'small_catchlight', highlight, [0.043, -0.061, 0.077], [0.012, 0.013, 0.005]);
    tube(closedEyes, 'closed_eyelid', smileMaterial, [[horizontal - 0.116, -0.022, depth + 0.072], [horizontal, 0.036, depth + 0.094], [horizontal + 0.116, -0.022, depth + 0.072]], 0.014);
    if (pink) tube(headJoint, 'delicate_eyebrow', smileMaterial, [[horizontal - 0.063, eyesHeight + 0.254 - 1.72, depth - 0.077], [horizontal, eyesHeight + 0.284 - 1.72, depth - 0.06], [horizontal + 0.063, eyesHeight + 0.26 - 1.72, depth - 0.077]], 0.009);
  }
  const mouthHeight = pink ? 1.925 : 1.9;
  const mouthDepth = faceDepth(0, mouthHeight) + 0.008;
  const smile = group(headJoint, 'smile', [0, mouthHeight - 1.72, mouthDepth]);
  tube(smile, 'gentle_smile', smileMaterial, [[-0.172, 0.016, -0.018], [-0.09, -0.015, 0], [0, -0.024, 0.007], [0.09, -0.015, 0], [0.172, 0.016, -0.018]], 0.008);
  const openMouth = group(headJoint, 'open_mouth', [0, mouthHeight - 1.72, mouthDepth]);
  oval(openMouth, 'mouth_cavity', mouthMaterial, [0, 0, 0.012], [pink ? 0.175 : 0.19, 0.11, 0.023]);
  oval(openMouth, 'soft_tongue', tongue, [0, -0.033, 0.03], [0.115, 0.061, 0.019]);
  if (!pink) oval(openMouth, 'small_front_teeth', white, [0, 0.052, 0.03], [0.105, 0.032, 0.018]);
  for (const patch of openMouth.children) {
    const geometry = patch.geometry.clone();
    geometry.scale(...patch.scale.toArray());
    geometry.translate(...patch.position.toArray());
    const positions = geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const depth = faceDepth(positions.getX(vertex), mouthHeight + positions.getY(vertex)) - mouthDepth;
      positions.setZ(vertex, depth + 0.003 + positions.getZ(vertex) * 0.13);
    }
    geometry.computeVertexNormals();
    patch.geometry = geometry;
    patch.position.set(0, 0, 0);
    patch.scale.set(1, 1, 1);
  }

  if (pink) {
    const bonnet = group(headJoint, 'ivory_bonnet');
    const bonnetPoint = (around, polar, frill = 0) => {
      const angle = around * Math.PI * 2;
      const edge = 1.205 + 0.645 * Math.sin(angle);
      const wave = Math.sin(angle * 14);
      const latitude = edge * polar + frill * wave * 0.065;
      const pleat = Math.sin(angle * 22 + 0.3) * 0.013 * polar ** 7;
      const extra = pleat + frill * (0.085 + wave * 0.023);
      return [(1.084 + extra) * Math.sin(latitude) * Math.cos(angle), headHeight + 0.025 - 1.72 + (0.958 + extra) * Math.sin(latitude) * Math.sin(angle), -0.035 - (0.829 + extra) * Math.cos(latitude) + frill * wave * 0.024];
    };
    mesh(bonnet, 'bonnet_full_back_cap', surfaceGeometry(144, 64, (around, radial) => bonnetPoint(around, radial)), cream);
    mesh(bonnet, 'bonnet_scalloped_ruffle', surfaceGeometry(216, 20, (around, across) => bonnetPoint(around, 0.975 + across * 0.31, across)), cream);
    tube(bonnet, 'bonnet_gathered_seam', creamSeam, Array.from({ length: 120 }, (_, index) => bonnetPoint(index / 120, 0.978)), 0.0065, true);
    tube(bonnet, 'bonnet_soft_hem', cream, Array.from({ length: 180 }, (_, index) => bonnetPoint(index / 180, 1.285, 1)), 0.016, true);
  }

  const fruitHeight = pink ? 3.435 : 3.335;
  const fruit = group(headJoint, 'orange_topper', [0, fruitHeight - 1.72, -0.02]);
  const fruitGeometry = surfaceGeometry(72, 48, (around, vertical) => {
    const longitude = around * Math.PI * 2;
    const latitude = vertical * Math.PI;
    const ridges = 1 + Math.cos(longitude * 10) * Math.sin(latitude) * 0.016;
    return [0.26 * Math.sin(latitude) * Math.sin(longitude) * ridges, 0.17 * Math.cos(latitude), 0.237 * Math.sin(latitude) * Math.cos(longitude) * ridges];
  });
  mesh(fruit, 'single_mandarin', fruitGeometry, orange);
  tube(fruit, 'green_fruit_stem', green, [[0, 0.14, 0], [0.008, 0.21, 0], [0.02, pink ? 0.24 : 0.265, -0.007]], 0.023);
  if (pink) {
    const brim = mesh(fruit, 'cream_topper_ring', new THREE.TorusGeometry(0.375, 0.063, 16, 96), material('buttercream_ring', '#ffe7b0', { roughness: 0.67 }), [0, 0.015, 0], [1.18, 1, 1]);
    brim.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const geometry = surfaceGeometry(24, 36, (around, length) => {
        const angle = around * Math.PI * 2;
        const width = Math.sin(length * Math.PI) ** 0.82;
        return [0.103 * width * Math.cos(angle), length * 0.43, 0.023 * width * Math.sin(angle) + Math.sin(length * Math.PI) * 0.035];
      });
      const sprout = mesh(fruit, side < 0 ? 'left_green_sprout' : 'right_green_sprout', geometry, leaf, [0, 0.19, 0]);
      sprout.rotation.z = side * 0.75;
      sprout.rotation.y = side * 0.2;
    }
  }

  oval(body, pink ? 'cotton_bodice' : 'yellow_torso', pink ? fabric : skin, [0, pink ? 1.29 : 1.265, 0], [pink ? 0.749 : 0.731, pink ? 0.515 : 0.65, pink ? 0.478 : 0.449]);
  mesh(body, pink ? 'puffed_romper' : 'two_leg_orange_shorts', sculptPants(pink, fabric), fabric);
  tube(body, 'waist_seam', seam, ringPoints(pink ? 0.766 : 0.731, pink ? 0.475 : 0.412, pink ? 1.085 : 0.994), pink ? 0.008 : 0.009, true);
  if (!pink) {
    for (const side of [-1, 1]) tube(body, 'shorts_pocket_stitch', seam, [[side * 0.59, 0.956, 0.332], [side * 0.54, 0.82, 0.409], [side * 0.425, 0.73, 0.434]], 0.0045);
  }
  for (const side of [-1, 1]) {
    const leg = group(body, side < 0 ? 'far_leg' : 'near_leg', [side * 0.397, 0.625, 0]);
    const legProfile = [[0, -0.625], [0.17, -0.625], [0.216, -0.621], [0.24, -0.605], [0.252, -0.573], [0.257, -0.525], [0.255, -0.445], [0.246, -0.30], [0.24, -0.12], [0.226, 0.02], [0.19, 0.075], [0, 0.083]].map(point => new THREE.Vector2(...point));
    mesh(leg, 'rounded_bare_foot', new THREE.LatheGeometry(legProfile, 48), skin, [0, 0, 0.043], [pink ? 1.09 : 1, 1, 1.15]);
    for (const toe of [-1, 1]) tube(leg, 'subtle_toe_crease', earInside, [[toe * 0.077, -0.542, 0.323], [toe * 0.078, -0.578, 0.307], [toe * 0.076, -0.603, 0.282]], 0.0035);
    if (pink) ruffle(leg, 'romper_gathered_leg_hem', ribbon, 0.295, 0.335, -0.12, 0.064, 18).position.z = 0.043;
    const arm = group(body, side < 0 ? 'far_arm' : 'near_arm', [side * (pink ? 0.742 : 0.714), 1.665, 0]);
    const armGeometry = surfaceGeometry(48, 40, (around, vertical) => {
      const angle = around * Math.PI * 2;
      const latitude = vertical * Math.PI;
      const radial = Math.sin(latitude) ** 0.74;
      return [side * (0.025 + Math.sin(latitude) * 0.068) + (pink ? 0.182 : 0.167) * radial * Math.sin(angle), -0.382 + 0.398 * Math.cos(latitude), 0.02 + 0.185 * radial * Math.cos(angle)];
    });
    mesh(arm, 'soft_arm_and_hand', armGeometry, skin);
    if (pink) {
      const sleeve = surfaceGeometry(64, 40, (around, vertical) => {
        const longitude = around * Math.PI * 2;
        const latitude = vertical * 2.3;
        const folds = Math.sin(longitude * 15) * 0.009 * Math.sin(latitude) ** 2;
        return [side * 0.07 + (0.244 + folds) * Math.sin(latitude) * Math.sin(longitude), -0.132 + 0.271 * Math.cos(latitude), (0.251 + folds) * Math.sin(latitude) * Math.cos(longitude)];
      });
      mesh(arm, 'puff_sleeve', sleeve, fabric);
      ruffle(arm, 'sleeve_ruffled_cuff', ribbon, 0.188, 0.196, -0.315, 0.079, 16).position.x = side * 0.07;
    } else {
      for (const finger of [-1, 0, 1]) oval(arm, 'rounded_fingertip', skin, [side * 0.04 + finger * 0.065, -0.738 + Math.abs(finger) * 0.015, 0.043], [0.042, 0.049, 0.065]);
    }
  }
  oval(body, 'small_round_yellow_tail', skin, [0, pink ? 0.745 : 0.739, pink ? -0.495 : -0.444], [pink ? 0.166 : 0.12, pink ? 0.168 : 0.123, pink ? 0.163 : 0.13]);

  if (pink) {
    for (const front of [-1, 1]) {
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.055);
        shape.bezierCurveTo(0.14, 0.13, 0.44, 0.16, 0.555, 0.048);
        shape.bezierCurveTo(0.505, -0.174, 0.23, -0.218, 0.02, -0.012);
        shape.closePath();
        const border = shape.getSpacedPoints(96);
        const geometry = surfaceGeometry(96, 16, (around, radial) => {
          const point = border[Math.round(around * 96)];
          const horizontal = 0.27 + (point.x - 0.27) * radial;
          const vertical = -0.025 + (point.y + 0.025) * radial;
          return [horizontal, vertical, -0.265 * (horizontal / 0.59) ** 2 + 0.033 * (1 - radial ** 2)];
        });
        const collar = group(body, front > 0 ? 'peter_pan_front_collar' : 'peter_pan_back_collar', [0, 1.54, front * 0.535]);
        collar.scale.set(side, 1, front);
        mesh(collar, 'soft_collar_petal', geometry, cream);
        tube(collar, 'collar_rolled_edge', cream, border.slice(0, -1).map(point => [point.x, point.y, -0.265 * (point.x / 0.59) ** 2]), 0.013, true);
      }
    }
    const bow = group(body, 'neckline_bow', [0, 1.474, 0.458]);
    for (const side of [-1, 1]) {
      const loop = oval(bow, 'bow_loop', ribbon, [side * 0.094, -0.032, 0], [0.115, 0.051, 0.038]);
      loop.rotation.z = side * 0.55;
      const streamer = oval(bow, 'bow_ribbon_tail', ribbon, [side * 0.095, -0.18, 0.045], [0.059, 0.177, 0.025]);
      streamer.rotation.z = side * 0.34;
    }
    oval(bow, 'bow_center_knot', ribbon, [0, 0, 0.029], [0.049, 0.061, 0.043]);
    oval(body, 'ivory_front_button', cream, [0, 1.136, 0.462], [0.051, 0.051, 0.018]);
    const badge = group(body, 'little_duck_badge', [-0.348, 1.282, 0.427]);
    oval(badge, 'badge_ivory_base', cream, [0, 0, 0], [0.086, 0.065, 0.011]);
    oval(badge, 'duck_body', skin, [0, -0.009, 0.011], [0.058, 0.035, 0.013]);
    oval(badge, 'duck_head', skin, [-0.019, 0.04, 0.014], [0.033, 0.037, 0.016]);
    oval(badge, 'duck_beak', orange, [0.018, 0.038, 0.023], [0.023, 0.012, 0.01]);
    oval(badge, 'duck_eye', black, [-0.012, 0.05, 0.03], [0.005, 0.005, 0.003]);
    oval(badge, 'duck_wing', orange, [0.015, -0.013, 0.023], [0.025, 0.017, 0.007]);
  }
  return root;
}

function animationsFor(model) {
  const rig = bindRig(model);
  const animated = Object.values(rig).filter(value => value?.isObject3D);
  const clips = [];
  for (const [state, definition] of Object.entries(ANIMATIONS)) {
    const duration = state === 'attack' ? 27 / 60 : state === 'skill' ? 45 / 60 : definition.frames / definition.fps;
    const samples = Math.max(8, Math.ceil(duration * 30));
    const times = Array.from({ length: samples + 1 }, (_, index) => index / samples * duration);
    const values = animated.map(() => ({ position: [], quaternion: [], scale: [] }));
    for (let sample = 0; sample <= samples; sample += 1) {
      const seconds = definition.loop && sample === samples ? 0 : times[sample];
      const elapsed = Math.round(seconds * 60);
      const fighter = { id: model.userData.kind === 'lulu' ? 0 : 1, kind: model.userData.kind, state, stateFrame: elapsed, jumpFrame: Math.min(18, elapsed), crouching: state === 'crouch', guarding: state === 'guard', move: ['attack', 'skill'].includes(state) ? { frame: elapsed } : null };
      applyPose(rig, poseFor(fighter, seconds + 1), fighter, seconds + 1);
      animated.forEach((joint, index) => {
        values[index].position.push(...joint.position.toArray());
        values[index].quaternion.push(...joint.quaternion.toArray());
        values[index].scale.push(...joint.scale.toArray());
      });
    }
    const tracks = animated.flatMap((joint, index) => [
      new THREE.VectorKeyframeTrack(`${joint.name}.position`, times, values[index].position),
      new THREE.QuaternionKeyframeTrack(`${joint.name}.quaternion`, times, values[index].quaternion),
      new THREE.VectorKeyframeTrack(`${joint.name}.scale`, times, values[index].scale)
    ]);
    const clip = new THREE.AnimationClip(state, duration, tracks);
    clip.optimize();
    clips.push(clip);
  }
  const neutral = { bodyY: 0, scaleX: 1, scaleY: 1, tilt: 0, farLeg: 0, nearLeg: 0, farArm: 0, nearArm: 0, reach: 0, headAngle: 0, headY: 0, smile: 'smile', eyes: 'normal', spin: 0 };
  applyPose(rig, neutral, { id: 0 }, 1);
  return clips;
}

export async function exportModels() {
  if (!globalThis.FileReader) {
    globalThis.FileReader = class {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }, error => this.onerror?.(error));
      }
    };
  }
  await mkdir(output, { recursive: true });
  const summary = { format: 'glTF 2.0 binary', units: 'meters', forward: '+Z', up: '+Y', source: '../../scripts/export-models.mjs', models: {} };
  for (const kind of ['lulu', 'lumei']) {
    const model = createCharacter(kind);
    const animations = animationsFor(model);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.deleteAttribute('uv');
      object.geometry.normalizeNormals();
    });
    const scene = new THREE.Scene();
    scene.add(model);
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false });
    const buffer = Buffer.from(result);
    await writeFile(new URL(`${kind}.glb`, output), buffer);
    let triangles = 0;
    let meshes = 0;
    model.traverse(object => {
      if (!object.isMesh) return;
      meshes += 1;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    const bounds = new THREE.Box3().setFromObject(model);
    summary.models[kind] = { file: `${kind}.glb`, bytes: buffer.length, triangles, meshes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, animations: animations.map(clip => ({ name: clip.name, duration: clip.duration, loop: ANIMATIONS[clip.name].loop })) };
    console.log(`${kind}.glb：${meshes} 个网格，${triangles} 个三角面，16 种动作，${(buffer.length / 1024).toFixed(0)} KiB`);
  }
  await writeFile(new URL('manifest.json', output), `${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await exportModels();
