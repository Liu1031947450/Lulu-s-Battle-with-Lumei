/* 场景、特效、共享动作姿势与二维兼容；统一角色入口优先渲染内嵌 GLB。 */
const Artwork = (() => {
  const shape = (path, fill, stroke = 'none', width = 1.2, volume) => ({ path, fill, stroke, width, volume });
  const ellipsePath = (centerX, centerY, radiusX, radiusY) => `M${centerX - radiusX},${centerY}a${radiusX},${radiusY} 0 1,0 ${radiusX * 2},0a${radiusX},${radiusY} 0 1,0 ${-radiusX * 2},0`;
  const headPath = 'M-4,-82 C-35,-82 -55,-68 -62,-43 C-69,-21 -85,-1 -84,24 C-83,54 -48,67 -2,67 C44,68 80,54 84,27 C87,4 75,-18 67,-42 C59,-68 33,-82 -4,-82Z';
  const sideHeadPath = 'M-18,-81 C-50,-80 -67,-49 -67,-7 C-69,30 -52,58 -18,65 C7,70 54,65 74,48 C94,31 95,8 82,-8 C73,-20 55,-25 43,-31 C37,-60 13,-83 -18,-81Z';
  const GRADIENTS = {
    skin: { box: [0, -3, 86, 91], colors: ['#ffe966', '#ffd728', '#fbc413', '#d69706'] },
    body: { box: [0, 4, 69, 67], focus: [-0.3, 0.08], colors: ['#ffe65d', '#ffda22', '#f4be0c', '#d89406'] },
    muzzle: { box: [1, 37, 100, 64], focus: [-0.12, -0.34], colors: ['#ffbf2b', '#ffb11a', '#ed9b09e6', '#fcb71600'] },
    sideMuzzle: { box: [54, 23, 65, 59], focus: [-0.28, -0.4], colors: ['#ffc23b', '#ffad17', '#ed950bee', '#fbc11400'] },
    arm: { box: [3, 30, 25, 51], colors: ['#ffe25b', '#ffd024', '#f4b714', '#d98c07'] },
    leg: { box: [1, 0, 25, 23], colors: ['#ffe565', '#ffd32b', '#efb00f', '#cb8109'] },
    ear: { box: [0, -5, 16, 19], colors: ['#ffe97b', '#ffd532', '#ecac10', '#c9850a'] },
    innerEar: { box: [0, -5, 10, 12], focus: [0.15, 0.5], colors: ['#f6bc28', '#efa517', '#d48a0b', '#b8790b'] },
    orange: { box: [0, -3, 23, 23], colors: ['#ffc044', '#ffa21a', '#ed830b', '#c86a0a'] },
    stem: { box: [1, -28, 7, 14], colors: ['#acd052', '#86ae35', '#608529', '#435f25'] },
    leaf: { box: [0, -37, 26, 20], colors: ['#c5db58', '#a5c33c', '#7d9e29', '#546f24'] },
    shorts: { box: [-2, -12, 72, 40], colors: ['#ffa137', '#f88919', '#e77310', '#bd500b'] },
    romper: { box: [0, -18, 69, 53], focus: [-0.3, -0.12], colors: ['#ffe2df', '#f6bec9', '#eaa3b6', '#c98097'] },
    sleeve: { box: [1, 6, 26, 25], colors: ['#ffdedc', '#f3bdc8', '#e5a1b5', '#c97f98'] },
    linen: { box: [0, -53, 90, 54], colors: ['#ffffff', '#fffdf2', '#eae4d7', '#c9c3b8'] },
    collar: { box: [0, 2, 45, 19], colors: ['#ffffff', '#fffaf1', '#ece2d7', '#ccbbae'] },
    cuff: { box: [0, 0, 23, 8], colors: ['#fff6ec', '#ffe6e1', '#e4b9c6', '#c58b9f'] },
    ring: { box: [0, -3, 34, 9], colors: ['#fff1c5', '#ffe4a2', '#ecc379', '#cf9954'] },
    eye: { box: [0, 0, 16, 20], colors: ['#ffffff', '#ffffff', '#eceff0', '#acb8b8'] },
    iris: { box: [0, 0, 8, 11], focus: [0.12, 0.5], colors: ['#63c5ef', '#3198d5', '#21699d', '#123d63'] },
    lumeiIris: { box: [0, 0, 8, 11], focus: [0.12, 0.5], colors: ['#594537', '#40342d', '#292627', '#171d23'] },
    tooth: { box: [0, 1, 15, 15], colors: ['#ffffff', '#fffef5', '#f5ecd7', '#d7c6a7'] },
    shadow: { box: [0, 0, 58, 15], focus: [0, 0], colors: ['#88501439', '#93591222', '#9c63110d', '#9c631100'] }
  };
  const leg = [
    shape('M-17,-16 C-23,-8 -25,7 -18,13 C-11,20 15,19 23,11 C28,4 22,-10 14,-16Z', 'leg'),
    shape('M-7,12 Q-7,15 -5,16 M2,12 Q3,15 4,16', 'none', '#c7912845', 1)
  ];
  const arm = [
    shape('M-10,-10 C-24,-4 -21,14 -16,34 C-12,52 -10,64 0,71 Q5,78 11,73 Q18,78 22,70 Q29,68 26,59 C26,48 21,39 21,23 L19,4 C18,-8 5,-14 -10,-10Z', 'arm'),
    shape('M6,61 Q7,67 10,68 M14,58 Q17,64 18,66', 'none', '#bf801348', 1.2)
  ];
  const sleeve = [
    shape('M-15,-9 C-29,-3 -25,15 -16,22 Q-1,29 22,18 C27,6 22,-9 9,-12Z', 'sleeve'),
    shape('M-15,20 Q-12,24 -9,21 Q-5,27 -1,23 Q5,28 9,22 Q16,24 21,18', 'none', '#fff2eb', 3),
    shape('M-15,-1 Q-19,6 -14,13 M14,-4 Q18,4 15,11', 'none', '#fff0e966', 1.5)
  ];
  const ear = [
    shape('M-12,9 C-21,-1 -16,-22 -3,-23 C11,-24 20,-8 12,6 Q4,13 -12,9Z', 'ear'),
    shape('M-7,3 C-13,-4 -9,-16 -2,-16 C6,-16 12,-6 6,1 Q0,6 -7,3Z', 'innerEar')
  ];
  const mouthShapes = {
    smile: [
      shape('M-17,-6 Q0,-1 18,-6 C20,4 11,13 0,13 C-11,13 -19,5 -17,-6Z', '#713515'),
      shape('M-11,-4 Q0,-2 11,-4 L10,5 Q0,10 -10,5Z', 'tooth'),
      shape('M-9,10 Q0,6 9,10 Q0,14 -9,10Z', '#dc8b69')
    ],
    happy: [
      shape('M-20,-8 Q0,-2 21,-8 C24,8 11,22 0,20 C-13,21 -24,7 -20,-8Z', '#733713'),
      shape('M-12,-5 Q0,-3 12,-5 L11,5 Q0,10 -11,5Z', 'tooth'),
      shape('M-11,16 Q0,7 13,16 Q0,22 -11,16Z', '#df8b70')
    ],
    hurt: [shape('M-15,6 Q0,-6 16,6', 'none', '#90521c', 2.2)],
    determined: [shape('M-15,-3 Q1,2 17,-4 L14,7 Q0,11 -13,7Z', '#824819'), shape('M-11,-1 Q0,2 13,-1 L10,5 Q0,8 -10,5Z', 'tooth')]
  };
  function eyeShapes(centers, iris = 'iris') {
    return centers.flatMap(centerX => [
      shape(ellipsePath(centerX, 0, 15, 19), 'shadow', 'none', 0, [centerX, 0, 18, 22]),
      shape(ellipsePath(centerX, 0, 13.5, 17), 'eye', 'none', 0, [centerX, 0, 14, 18]),
      shape(ellipsePath(centerX + 1, 1, 7.3, 10), iris, 'none', 0, [centerX + 1, 1, 7.3, 10]),
      shape(ellipsePath(centerX + 1, 0, 3.8, 6.4), '#101e26'),
      shape(ellipsePath(centerX - 1, -4, 2.1, 2.6), '#ffffff'),
      shape(ellipsePath(centerX + 3.5, 4, 0.9, 1.2), '#d4f3ffb0')
    ]);
  }

  const MODELS = {};
  const MODEL_VIEWS = {};
  for (const kind of ['lulu', 'lumei']) {
    const isLumei = kind === 'lumei';
    const limbs = isLumei ? [...arm, ...sleeve] : arm;
    const clothes = isLumei ? [
      shape('M-40,-70 Q0,-62 40,-70 C55,-55 62,-34 61,-10 C68,9 55,25 39,24 L16,24 Q4,20 0,11 Q-4,21 -18,24 L-41,24 C-59,23 -67,9 -61,-10 C-63,-32 -55,-55 -40,-70Z', 'romper'),
      shape('M-53,-13 Q0,-6 53,-13', 'none', '#d493a78a', 1),
      shape('M-46,-16 L-47,-8 M-33,-14 L-35,-6 M34,-14 L35,-6 M47,-16 L47,-8', 'none', '#ffebe780', 1.4),
      shape('M-55,17 Q-52,24 -47,21 Q-42,28 -37,24 Q-31,29 -27,25 Q-20,29 -14,24', 'none', '#fff0e8', 3.3),
      shape('M14,24 Q20,29 27,25 Q31,29 37,24 Q42,28 47,21 Q52,24 55,17', 'none', '#fff0e8', 3.3)
    ] : [
      shape('M-64,-22 Q0,-12 64,-22 L61,10 Q59,21 41,23 L15,22 Q4,20 0,10 Q-3,20 -15,22 L-40,23 Q-58,22 -61,12Z', 'shorts'),
      shape('M-62,-19 Q0,-9 62,-19 M0,-9 L0,10', 'none', '#b966174a', 1.2),
      shape('M-54,18 Q-35,22 -17,19 M17,19 Q34,22 54,18', 'none', '#ffb6545c', 1.2)
    ];
    const collar = {
      id: 'collar', x: 0, y: -109, shapes: [
        shape('M-40,-5 Q-19,2 -2,-5 Q-6,19 -23,16 Q-37,12 -40,-5Z M2,-5 Q21,2 40,-5 Q37,12 23,16 Q7,20 2,-5Z', 'collar'),
        shape('M-1,5 Q-13,0 -13,8 Q-14,15 -1,10 Q13,17 13,9 Q13,2 2,5Z', '#e7a8b9'),
        shape(ellipsePath(0, 8, 3, 3), '#f8d4d6')
      ]
    };
    const bonnetBack = {
      id: 'bonnetBack', x: 0, y: -167, shapes: [
        shape('M-69,-34 C-95,-87 -40,-107 0,-101 C42,-106 81,-83 82,-47 L89,-13 Q98,0 87,10 L78,25 Q59,8 57,-24Z', 'linen')
      ]
    };
    const bonnet = {
      id: 'bonnet', x: 0, y: -167, shapes: [
        shape('M-76,-48 C-70,-81 -42,-101 0,-101 C44,-101 72,-79 78,-44 L67,-41 Q65,-54 55,-53 Q45,-41 35,-59 Q25,-65 18,-54 Q8,-43 -2,-61 Q-12,-69 -21,-56 Q-31,-45 -41,-63 Q-53,-69 -59,-53 Q-63,-39 -76,-48Z', 'linen'),
        shape('M-65,-67 Q-62,-60 -62,-51 M-42,-79 Q-38,-66 -35,-59 M-16,-85 Q-12,-72 -9,-62 M12,-85 Q18,-75 19,-60 M42,-78 Q49,-68 51,-57 M64,-64 Q69,-56 69,-48', 'none', '#c9c1b647', 2),
        shape('M72,-47 Q85,-48 86,-33 Q81,-24 90,-14 Q98,-4 88,4 L78,11 Q67,0 75,-10 Q65,-19 73,-29 Q63,-39 72,-47Z', 'linen')
      ]
    };
    const orange = {
      id: 'orange', x: 0, y: isLumei ? -270 : -256, shapes: [
        shape(ellipsePath(0, 17, 29, 8), 'shadow', 'none', 0, [0, 17, 29, 8]),
        shape('M-22,-2 C-23,-17 -12,-26 0,-25 C14,-26 24,-16 23,-1 C26,12 16,18 1,18 C-14,19 -25,11 -22,-2Z', 'orange'),
        ...(isLumei ? [
          shape('M-32,-7 Q0,-12 33,-7 L32,-1 Q0,6 -32,-1Z', 'ring'),
          shape(ellipsePath(0, -7, 32, 5), 'ring')
        ] : []),
        shape('M-2,-24 Q-4,-33 1,-36 Q5,-38 6,-32 L4,-24Z', 'stem'),
        ...(isLumei ? [shape('M2,-30 C-14,-32 -24,-41 -19,-47 C-11,-53 0,-42 2,-30Z M3,-33 C4,-47 16,-54 22,-48 C28,-41 13,-33 3,-33Z', 'leaf')] : [])
      ]
    };
    const layers = [
      { id: 'farLeg', x: -32, y: -17, scaleX: -1, shapes: leg },
      { id: 'nearLeg', x: 32, y: -17, shapes: leg },
      { id: 'body', x: 0, y: -76, shapes: [shape('M-35,-62 C-53,-48 -65,-21 -65,7 C-70,32 -52,47 -19,48 C15,51 59,45 66,24 C72,8 59,-41 36,-61Z', 'body')] },
      { id: 'clothes', x: 0, y: -40, shapes: clothes },
      { id: 'farArm', x: -54, y: -111, scaleX: -1, shapes: limbs },
      ...(isLumei ? [collar, bonnetBack] : []),
      ...(!isLumei ? [
        { id: 'leftEar', x: -59, y: -215, scaleX: -1, shapes: ear },
        { id: 'rightEar', x: 59, y: -215, shapes: ear }
      ] : []),
      { id: 'neckShadow', x: 0, y: -103, shapes: [shape(ellipsePath(0, 0, 51, 11), 'shadow', 'none', 0, [0, 0, 51, 11])] },
      { id: 'head', x: 0, y: -167, shapes: [shape(headPath, 'skin')] },
      { id: 'muzzle', x: 0, y: -167, shapes: [shape(headPath, 'muzzle')] },
      { id: 'eyes', x: 0, y: -204, centers: [-29, 29], shapes: eyeShapes([-29, 29], isLumei ? 'lumeiIris' : 'iris') },
      { id: 'mouth', x: 1, y: -125, shapes: mouthShapes.smile },
      ...(isLumei ? [bonnet,
        { id: 'leftEar', x: -64, y: -205, scaleX: -1, shapes: ear },
        { id: 'rightEar', x: 64, y: -205, shapes: ear }
      ] : []),
      orange,
      { id: 'nearArm', x: 54, y: -109, shapes: limbs }
    ];
    MODELS[kind] = layers;
    const side = layers.filter(layer => !['leftEar', 'farArm', 'farLeg', 'bonnetBack'].includes(layer.id)).map(layer => {
      if (layer.id === 'body') return { ...layer, shapes: [shape('M-27,-62 C-57,-43 -59,-8 -49,26 C-39,48 26,51 50,33 C66,24 64,-19 34,-48Z', 'body')] };
      if (layer.id === 'clothes') return { ...layer, scaleX: 0.85, x: 2 };
      if (layer.id === 'nearLeg') return { ...layer, x: 9, scaleX: 1.1 };
      if (layer.id === 'head') return { ...layer, shapes: [shape(sideHeadPath, 'skin')] };
      if (layer.id === 'muzzle') return { ...layer, shapes: [shape(sideHeadPath, 'sideMuzzle')] };
      if (layer.id === 'rightEar') return { ...layer, x: -38, y: -210 };
      if (layer.id === 'eyes') return { ...layer, x: 24, y: -204, scaleX: 0.67, centers: [0], shapes: eyeShapes([0], isLumei ? 'lumeiIris' : 'iris') };
      if (layer.id === 'mouth') return { ...layer, x: 68, y: -125, scaleX: 0.64 };
      if (layer.id === 'orange') return { ...layer, x: -19 };
      if (layer.id === 'nearArm') return { ...layer, x: -5, y: -109 };
      if (layer.id === 'bonnet') return { ...layer, shapes: [shape('M-66,-28 C-80,-65 -54,-95 -22,-98 C3,-99 25,-88 36,-69 L23,-56 Q15,-65 8,-55 Q-1,-47 -9,-60 Q-19,-66 -23,-52 L-30,-31 Q-24,-14 -36,-7 Q-30,8 -44,13 Q-47,30 -61,22 L-73,10 Q-63,-1 -70,-13 Q-80,-20 -66,-28Z', 'linen', 'none', 0, [-24, -40, 53, 71]), shape('M-47,-77 Q-66,-51 -57,-31 M-21,-85 Q-38,-71 -36,-52 M4,-83 Q-5,-74 -3,-64', 'none', '#cec7bc66', 2)] };
      if (layer.id === 'collar') return { ...layer, x: 13, scaleX: 0.85 };
      return layer;
    });
    side.splice(1, 0, { id: 'tail', x: -48, y: -55, shapes: [shape(ellipsePath(0, 0, 13, 12), 'leg', 'none', 0, [0, 0, 13, 12])] });
    const back = layers.filter(layer => !['muzzle', 'eyes', 'mouth', 'collar', 'neckShadow', 'bonnetBack'].includes(layer.id)).map(layer => {
      if (layer.id === 'head') return { ...layer, shapes: [shape(headPath, 'skin')] };
      if (layer.id === 'clothes') return { ...layer, shapes: clothes.filter((item, index) => index !== 1) };
      if (layer.id === 'bonnet') return { ...layer, shapes: [shape('M-76,-37 C-87,-70 -52,-101 0,-101 C53,-101 86,-70 80,-36 L81,1 Q86,16 73,22 Q65,34 54,26 Q39,42 26,30 Q12,44 -1,32 Q-17,45 -29,32 Q-44,41 -56,27 Q-71,32 -75,20 Q-89,11 -81,-1Z', 'linen', 'none', 0, [0, -30, 88, 77]), shape('M-58,-65 Q-73,-24 -63,9 M-32,-82 Q-46,-29 -34,19 M0,-88 L0,23 M32,-82 Q46,-29 34,19 M58,-65 Q73,-24 63,9', 'none', '#c9c1b644', 2)] };
      return layer;
    });
    back.push({ id: 'tail', x: 0, y: -60, shapes: [shape(ellipsePath(0, 5, 17, 13), 'shadow', 'none', 0, [0, 5, 17, 13]), shape(ellipsePath(0, 0, 12, 12), 'leg', 'none', 0, [0, 0, 12, 12])] });
    MODEL_VIEWS[kind] = { front: layers, side, back };
  }

  const paths = new Map();
  function drawShapes(context, shapes) {
    for (const item of shapes) {
      if (!paths.has(item.path)) paths.set(item.path, new Path2D(item.path));
      const path = paths.get(item.path);
      if (item.fill !== 'none') {
        const material = GRADIENTS[item.fill];
        if (material) {
          const [centerX, centerY, radiusX, radiusY] = item.volume || material.box;
          const [focusX, focusY] = material.focus || [-0.3, -0.45];
          context.save();
          context.translate(centerX, centerY);
          context.scale(radiusX, radiusY);
          const gradient = context.createRadialGradient(focusX, focusY, 0, 0, 0, 1);
          material.colors.forEach((color, index) => gradient.addColorStop(index / (material.colors.length - 1), color));
          context.fillStyle = gradient;
          const normalizedKey = `${item.path}|${centerX},${centerY},${radiusX},${radiusY}`;
          if (!paths.has(normalizedKey)) {
            const normalized = new Path2D();
            normalized.addPath(path, new DOMMatrix([1 / radiusX, 0, 0, 1 / radiusY, -centerX / radiusX, -centerY / radiusY]));
            paths.set(normalizedKey, normalized);
          }
          context.fill(paths.get(normalizedKey));
          context.restore();
        } else {
          context.fillStyle = item.fill;
          context.fill(path);
        }
      }
      if (item.stroke !== 'none') {
        context.strokeStyle = item.stroke;
        context.lineWidth = item.width;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.stroke(path);
      }
    }
  }

  function modelSvg(kind, view = 'front') {
    const definitions = [];
    const layers = MODEL_VIEWS[kind][view].map(layer => {
      const shapes = layer.shapes.map((item, index) => {
        let fill = item.fill;
        const material = GRADIENTS[fill];
        if (material) {
          const identifier = `${kind}-${view}-${layer.id}-${index}`;
          const [centerX, centerY, radiusX, radiusY] = item.volume || material.box;
          const [focusX, focusY] = material.focus || [-0.3, -0.45];
          definitions.push(`<radialGradient id="${identifier}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" fx="${focusX}" fy="${focusY}" gradientTransform="translate(${centerX} ${centerY}) scale(${radiusX} ${radiusY})">${material.colors.map((color, index) => `<stop offset="${index / (material.colors.length - 1)}" stop-color="${color}"/>`).join('')}</radialGradient>`);
          fill = `url(#${identifier})`;
        }
        return `<path d="${item.path}" fill="${fill}" stroke="${item.stroke}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');
      return `<g id="${layer.id}" data-pivot="${layer.x},${layer.y}" transform="translate(${layer.x} ${layer.y}) scale(${layer.scaleX || 1} 1)">${shapes}</g>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -335 260 360" role="img" aria-label="${kind === 'lulu' ? '噜噜' : '噜妹'}自制分层二维模型 ${view}"><defs>${definitions.join('')}</defs>${layers}</svg>`;
  }

  const ANIMATIONS = {
    idle: { frames: 8, fps: 8, loop: true },
    walk: { frames: 8, fps: 12, loop: true },
    run: { frames: 8, fps: 18, loop: true },
    jump: { frames: 8, fps: 12, loop: false },
    'double-jump': { frames: 8, fps: 20, loop: false },
    crouch: { frames: 6, fps: 12, loop: false },
    rise: { frames: 6, fps: 30, loop: false },
    backstep: { frames: 8, fps: 12, loop: true },
    attack: { frames: 8, fps: 18, loop: false },
    skill: { frames: 12, fps: 18, loop: false },
    guard: { frames: 6, fps: 10, loop: true },
    hit: { frames: 6, fps: 18, loop: false },
    stun: { frames: 6, fps: 12, loop: true },
    defeat: { frames: 8, fps: 12, loop: false },
    victory: { frames: 8, fps: 10, loop: true },
    draw: { frames: 6, fps: 8, loop: true }
  };

  function poseFor(fighter, time) {
    const pose = { bodyY: Math.sin(time * 3) * 2, scaleX: 1, scaleY: 1, tilt: 0, farLeg: 0, nearLeg: 0, farArm: -0.045, nearArm: 0.045, reach: 0, headAngle: Math.sin(time * 1.7) * 0.012, headY: 0, smile: 'smile', eyes: 'normal', spin: 0 };
    const state = fighter.state;
    if (['walk', 'backstep', 'run'].includes(state)) {
      const pace = time * (state === 'run' ? 18 : 11);
      const swing = Math.sin(pace) * (state === 'run' ? 0.72 : 0.45);
      pose.farLeg = swing;
      pose.nearLeg = -swing;
      pose.farArm = -swing * 0.8;
      pose.nearArm = swing * 0.8;
      pose.bodyY = -Math.abs(Math.sin(pace)) * (state === 'run' ? 7 : 4);
      pose.tilt = state === 'backstep' ? -0.055 : state === 'run' ? 0.12 : 0.035;
      pose.headAngle = -pose.tilt * 0.5;
    }
    if (['jump', 'double-jump'].includes(state)) {
      const flight = (fighter.jumpFrame ?? fighter.stateFrame) / 18;
      pose.farArm = 2.1 + Math.sin(flight) * 0.2;
      pose.nearArm = -2.1 - Math.sin(flight + 0.4) * 0.25;
      pose.farLeg = -0.4 - Math.sin(flight) * 0.2;
      pose.nearLeg = 0.35 + Math.sin(flight + 0.5) * 0.25;
      pose.scaleX = 0.94;
      pose.scaleY = 1.02 + Math.sin(flight) * 0.035;
      pose.smile = 'happy';
      if (state === 'double-jump') pose.spin = Math.min(1, fighter.jumpFrame / 18) * Math.PI * 2;
    }
    if (state === 'crouch' || fighter.crouching) {
      const progress = state === 'crouch' ? Math.min(1, (fighter.stateFrame + 1) / 7) : 1;
      const eased = 1 - (1 - progress) ** 3;
      pose.scaleY = 1 - 0.34 * eased;
      pose.scaleX = 1 + 0.12 * eased;
      pose.nearLeg = -0.4;
      pose.farLeg = 0.4;
      pose.bodyY = 2;
    }
    if (state === 'rise') {
      const progress = Math.min(1, fighter.stateFrame / 8);
      pose.scaleY = 0.66 + progress * 0.34;
      pose.scaleX = 1.12 - progress * 0.12;
    }
    if (state === 'attack') {
      const frame = fighter.move?.frame ?? fighter.stateFrame % 27;
      const punch = frame < 7 ? -frame / 7 * 0.22 : frame < 12 ? 1 : Math.max(0, (27 - frame) / 15);
      pose.nearArm = -1.5 * punch;
      pose.reach = 48 * Math.max(0, punch);
      pose.tilt = 0.09 * punch;
      pose.farArm = 0.65;
      pose.smile = 'determined';
    }
    if (state === 'skill') {
      const frame = fighter.move?.frame ?? fighter.stateFrame % 45;
      if (fighter.kind === 'lulu') {
        pose.tilt = frame < 12 ? -0.13 : frame < 24 ? 0.32 : 0.12;
        pose.nearArm = -1.8;
        pose.farArm = -0.6;
        pose.reach = frame < 12 ? -8 : 26;
        pose.nearLeg = -0.6;
        pose.farLeg = 0.6;
        pose.scaleY = 0.92;
      } else {
        pose.nearArm = -1.6 - Math.sin(time * 8) * 0.16;
        pose.farArm = 1.5;
        pose.reach = 13;
        pose.headAngle = -0.09;
      }
      pose.smile = 'happy';
    }
    if (state === 'guard' || fighter.guarding) {
      pose.nearArm = -2.65;
      pose.farArm = 1;
      pose.reach = -9;
      pose.tilt = -0.045;
      pose.headY = 5;
      pose.smile = 'determined';
    }
    if (state === 'hit' || state === 'stun') {
      pose.tilt = -0.17;
      pose.headAngle = Math.sin(time * 37) * 0.045;
      pose.farArm = 1.25;
      pose.nearArm = -0.85;
      pose.smile = 'hurt';
      pose.eyes = 'hurt';
      pose.scaleX = 1.06;
      pose.scaleY = 0.94;
    }
    if (state === 'victory') {
      pose.bodyY = -Math.abs(Math.sin(time * 6)) * 16;
      pose.nearArm = -2.4 + Math.sin(time * 12) * 0.4;
      pose.farArm = 1.7;
      pose.smile = 'happy';
      pose.eyes = 'happy';
      pose.headAngle = Math.sin(time * 6) * 0.055;
    }
    if (state === 'defeat') {
      pose.tilt = -Math.min(1, fighter.stateFrame / 22) * 1.32;
      pose.scaleX = 0.9;
      pose.scaleY = 0.87;
      pose.bodyY = -7;
      pose.smile = 'hurt';
      pose.eyes = 'sleep';
      pose.nearArm = -0.8;
    }
    if (state === 'draw') {
      pose.nearArm = -1;
      pose.farArm = 1;
      pose.headAngle = Math.sin(time * 2) * 0.1;
      pose.smile = 'hurt';
    }
    return pose;
  }

  function oval(context, centerX, centerY, radiusX, radiusY, color) {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(centerX, centerY, Math.max(0.01, radiusX), Math.max(0.01, radiusY), 0, 0, Math.PI * 2);
    context.fill();
  }

  function rounded(context, left, top, width, height, radius, fill, stroke) {
    context.beginPath();
    context.roundRect(left, top, width, height, radius);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
  }

  function star(context, centerX, centerY, radius, color, rotation = 0) {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(rotation);
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = point * Math.PI / 5 - Math.PI / 2;
      const length = point % 2 === 0 ? radius : radius * 0.49;
      if (point === 0) context.moveTo(Math.cos(angle) * length, Math.sin(angle) * length);
      else context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function heart(context, centerX, centerY, size, color) {
    context.save();
    context.translate(centerX, centerY);
    context.scale(size / 20, size / 20);
    context.beginPath();
    context.moveTo(0, 17);
    context.bezierCurveTo(-38, -5, -13, -28, 0, -12);
    context.bezierCurveTo(13, -28, 38, -5, 0, 17);
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function drawFighter(context, fighter, time, { scale = 0.82, shadow = true, view = 'battle' } = {}) {
    const pose = poseFor(fighter, time);
    if (shadow && fighter.state === 'defeat' && ((fighter.x < 210 && fighter.facing === 1) || (fighter.x > 1070 && fighter.facing === -1))) pose.tilt *= -1;
    if (shadow) {
      const elevation = Math.max(0, 514 - fighter.y);
      oval(context, fighter.x, 518, Math.max(25, 64 - elevation * 0.12), 10, '#7f9e6940');
      oval(context, fighter.x, 517, Math.max(19, 43 - elevation * 0.1), 5, '#75925924');
    }
    context.save();
    context.translate(fighter.x, fighter.y + pose.bodyY);
    context.scale((fighter.facing || 1) * scale, scale);
    if (pose.spin) {
      context.translate(0, -125);
      context.rotate(pose.spin);
      context.translate(0, 125);
    }
    context.rotate(pose.tilt);
    context.scale(pose.scaleX, pose.scaleY);
    if (fighter.flash > 0 && fighter.flash % 3 === 0) context.globalAlpha = 0.72;
    if (fighter.state === 'skill' && fighter.kind === 'lulu' && (fighter.move?.frame ?? 15) >= 12) {
      for (let trail = 3; trail > 0; trail -= 1) oval(context, -30 - trail * 33, -93, 24 + trail * 10, 33 - trail * 5, `rgba(255,194,82,${0.2 - trail * 0.035})`);
    }
    const headLayers = new Set(['leftEar', 'rightEar', 'head', 'bonnetBack', 'bonnet', 'muzzle', 'eyes', 'mouth', 'orange']);
    const layers = globalThis.Character3D?.draw(context, fighter, time, pose, view) ? [] : MODEL_VIEWS[fighter.kind][view] || MODEL_VIEWS[fighter.kind].front;
    for (const layer of layers) {
      context.save();
      if (headLayers.has(layer.id)) {
        context.translate(0, -143 + pose.headY);
        context.rotate(pose.headAngle);
        context.translate(0, 143);
      }
      context.translate(layer.x, layer.y);
      if (layer.id === 'farLeg') context.rotate(pose.farLeg);
      if (layer.id === 'nearLeg') context.rotate(pose.nearLeg);
      if (layer.id === 'farArm') context.rotate(pose.farArm);
      if (layer.id === 'nearArm') { context.translate(pose.reach, 0); context.rotate(pose.nearArm); }
      if (layer.scaleX) context.scale(layer.scaleX, 1);
      if (layer.id === 'eyes' && pose.eyes !== 'normal') {
        context.strokeStyle = '#644637';
        context.lineWidth = 3.8;
        context.lineCap = 'round';
        for (const eyeX of layer.centers) {
          context.beginPath();
          if (pose.eyes === 'hurt') {
            context.moveTo(eyeX - 7, -8); context.lineTo(eyeX + 7, 6);
            context.moveTo(eyeX + 7, -8); context.lineTo(eyeX - 7, 6);
          } else if (pose.eyes === 'happy') {
            context.moveTo(eyeX - 10, 3); context.quadraticCurveTo(eyeX, -12, eyeX + 10, 3);
          } else {
            context.moveTo(eyeX - 10, 1); context.quadraticCurveTo(eyeX, 9, eyeX + 10, 0);
          }
          context.stroke();
        }
      } else if (layer.id === 'eyes') {
        const blinking = (time + fighter.id * 1.9) % 4.8 < 0.13;
        context.scale(1, blinking ? 0.12 : 1);
        drawShapes(context, layer.shapes);
      } else drawShapes(context, layer.id === 'mouth' ? mouthShapes[pose.smile] : layer.shapes);
      context.restore();
    }
    if (fighter.guarding || fighter.state === 'guard') {
      const shield = context.createLinearGradient(22, -120, 113, -100);
      shield.addColorStop(0, '#c1efe923'); shield.addColorStop(1, '#77d7c375');
      oval(context, 80, -119, 31, 77, shield);
      context.strokeStyle = '#f5fff8'; context.lineWidth = 3;
      context.beginPath(); context.ellipse(80, -119, 31, 77, -0.05, -1.6, 1.6); context.stroke();
      star(context, 84, -142, 10, '#ffffffbd', 0.1);
    }
    if (fighter.state === 'attack' && (fighter.move?.frame ?? 8) >= 7 && (fighter.move?.frame ?? 8) <= 13) {
      context.strokeStyle = '#fff9d5'; context.lineWidth = 10; context.lineCap = 'round';
      context.beginPath(); context.arc(69, -102, 49, -1.15, 0.45); context.stroke();
      context.strokeStyle = '#ffd177'; context.lineWidth = 4;
      context.beginPath(); context.arc(72, -102, 58, -0.95, 0.36); context.stroke();
    }
    context.restore();
  }

  function cloud(context, centerX, centerY, scale = 1, opacity = 1) {
    context.save(); context.translate(centerX, centerY); context.scale(scale, scale); context.globalAlpha = opacity;
    oval(context, 0, 12, 73, 19, '#fffdf0');
    oval(context, -31, 0, 30, 26, '#fffdf0');
    oval(context, 4, -10, 38, 36, '#fffdf0');
    oval(context, 39, 4, 28, 23, '#fffdf0');
    context.restore();
  }

  function tree(context, centerX, bottom, scale = 1) {
    context.save(); context.translate(centerX, bottom); context.scale(scale, scale);
    drawShapes(context, [shape('M-11,0 L-9,-131 L-39,-157 L-34,-165 L-5,-145 L12,-168 L18,-161 L9,-137 L14,0Z', '#baa979')]);
    oval(context, -43, -176, 51, 64, '#a7c992');
    oval(context, 42, -186, 60, 73, '#b3cf95');
    oval(context, -5, -216, 70, 74, '#bed89d');
    oval(context, 4, -237, 47, 43, '#c9dfa8');
    for (const [fruitX, fruitY] of [[-49, -193], [20, -252], [49, -186], [-7, -153], [-10, -223]]) {
      oval(context, fruitX + 1, fruitY + 2, 14, 15, '#d8a85555');
      oval(context, fruitX, fruitY, 14, 15, '#ffc168');
      oval(context, fruitX - 4, fruitY - 5, 4, 5, '#ffdb9a');
      context.save(); context.translate(fruitX + 4, fruitY - 13); context.rotate(-0.5); oval(context, 0, 0, 7, 3, '#8bad62'); context.restore();
    }
    context.restore();
  }

  function daisy(context, centerX, centerY, size, color = '#fffdf1') {
    for (let petal = 0; petal < 6; petal += 1) {
      const angle = petal * Math.PI / 3;
      oval(context, centerX + Math.cos(angle) * size * 0.6, centerY + Math.sin(angle) * size * 0.6, size * 0.52, size * 0.52, color);
    }
    oval(context, centerX, centerY, size * 0.36, size * 0.36, '#eebd69');
  }

  function drawBackdrop(context) {
    const sky = context.createLinearGradient(0, 0, 0, 510);
    sky.addColorStop(0, '#ddf0e7'); sky.addColorStop(0.58, '#f3f6d9'); sky.addColorStop(1, '#fff1cd');
    context.fillStyle = sky; context.fillRect(0, 0, 1280, 620);
    const sunlight = context.createRadialGradient(963, 107, 8, 963, 107, 208);
    sunlight.addColorStop(0, '#fff6c1bd'); sunlight.addColorStop(1, '#fff9d200');
    oval(context, 963, 107, 208, 208, sunlight);
    oval(context, 963, 107, 43, 43, '#ffdc96');
    oval(context, 952, 95, 26, 25, '#ffe5ac');
    for (let ray = 0; ray < 9; ray += 1) {
      const angle = ray / 9 * Math.PI * 2;
      context.strokeStyle = '#f5d48d'; context.lineWidth = 4; context.lineCap = 'round';
      context.beginPath(); context.moveTo(963 + Math.cos(angle) * 55, 107 + Math.sin(angle) * 55); context.lineTo(963 + Math.cos(angle) * 62, 107 + Math.sin(angle) * 62); context.stroke();
    }
    drawShapes(context, [shape('M-70,401 Q170,235 384,367 Q617,221 888,366 Q1102,231 1350,366 L1350,620 L-70,620Z', '#d5e7bb'), shape('M-100,430 Q80,335 246,403 Q465,301 650,417 Q825,334 1005,399 Q1205,310 1380,451 L1380,620 L-100,620Z', '#c5dca8')]);
    cloud(context, 721, 304, 0.66, 0.7);
    tree(context, 1191, 423, 0.67);
    tree(context, 110, 433, 0.7);
    /* 远景小屋与花园木栅栏。 */
    context.save(); context.translate(1007, 346);
    rounded(context, -48, -32, 96, 80, 18, '#fff3cf');
    drawShapes(context, [shape('M-66,-20 Q-70,-59 -33,-79 Q6,-98 48,-72 Q74,-58 66,-20Z', '#e6b786'), shape('M-59,-28 Q-42,-65 -13,-69', 'none', '#f4d0a0', 6)]);
    rounded(context, -18, 5, 32, 43, [16, 16, 0, 0], '#c7d3af');
    oval(context, 30, 2, 11, 13, '#c5dcd1');
    context.strokeStyle = '#fff9e2'; context.lineWidth = 3; context.beginPath(); context.moveTo(30, -9); context.lineTo(30, 14); context.moveTo(20, 2); context.lineTo(40, 2); context.stroke();
    context.restore();
    for (const start of [70, 803]) {
      rounded(context, start, 400, 410, 10, 5, '#eff0cf');
      rounded(context, start, 431, 410, 8, 4, '#e5e9c0');
      for (let post = 0; post < 10; post += 1) rounded(context, start + post * 43, 377 + Math.sin(post) * 3, 13, 75, [7, 7, 1, 1], '#fff4d4');
    }
    const grass = context.createLinearGradient(0, 408, 0, 620);
    grass.addColorStop(0, '#cadeac'); grass.addColorStop(1, '#e2e8b8');
    drawShapes(context, [shape('M0,437 Q211,413 411,441 Q729,413 958,438 Q1132,410 1280,434 L1280,620 L0,620Z', grass)]);
    for (let tuft = 0; tuft < 36; tuft += 1) {
      const tuftX = (tuft * 137 + 29) % 1280;
      const tuftY = 438 + (tuft * 37) % 140;
      context.strokeStyle = '#a5bf8466'; context.lineWidth = 2.1; context.lineCap = 'round';
      context.beginPath(); context.moveTo(tuftX, tuftY); context.lineTo(tuftX - 3, tuftY - 6); context.moveTo(tuftX, tuftY); context.lineTo(tuftX + 4, tuftY - 8); context.stroke();
    }
    oval(context, 640, 555, 590, 47, '#9caf8033');
    drawShapes(context, [shape('M54,496 L54,527 C77,615 1210,615 1226,527 L1226,496Z', '#d3b981'), shape('M54,497 C75,581 1208,581 1226,497 L1226,519 C1204,601 78,601 54,519Z', '#ead49c')]);
    oval(context, 640, 493, 586, 87, '#b0ce8e');
    oval(context, 640, 489, 571, 79, '#d5e5ae');
    oval(context, 640, 494, 532, 66, '#fff0c6');
    const pathLight = context.createLinearGradient(0, 442, 0, 560);
    pathLight.addColorStop(0, '#fff8d9'); pathLight.addColorStop(1, '#f5e7b5');
    oval(context, 640, 494, 512, 59, pathLight);
    context.strokeStyle = '#ead6a23d'; context.lineWidth = 2;
    for (const [lineX, lineY, length] of [[252, 490, 83], [804, 520, 121], [542, 457, 70], [423, 541, 98], [1020, 488, 39]]) {
      context.beginPath(); context.moveTo(lineX, lineY); context.quadraticCurveTo(lineX + length / 2, lineY + 3, lineX + length, lineY); context.stroke();
    }
    for (const [flowerX, flowerY, size, color] of [[100, 477, 11, '#fff9e9'], [180, 450, 7, '#fff8ea'], [1135, 472, 10, '#fff8e9'], [1215, 560, 13, '#f6d2cb'], [65, 566, 12, '#fff7e2'], [186, 581, 9, '#fff9e7'], [1045, 573, 10, '#fff8e8'], [353, 433, 6, '#fff8e8']]) daisy(context, flowerX, flowerY, size, color);
    context.save(); context.translate(30, 578); context.rotate(-0.1);
    oval(context, 0, 0, 30, 49, '#abc88c'); oval(context, 20, 19, 25, 34, '#bdd49a'); context.restore();
    context.save(); context.translate(1249, 590); context.rotate(0.35);
    oval(context, 0, 0, 27, 51, '#b4cc93'); oval(context, -25, 12, 25, 33, '#c0d6a0'); context.restore();
  }

  function drawScenery(context, time, { still = false } = {}) {
    if (!drawScenery.background) {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 620;
      drawBackdrop(canvas.getContext('2d'));
      drawScenery.background = canvas;
    }
    context.drawImage(drawScenery.background, 0, 0);
    const motion = still ? 0 : time;
    cloud(context, 222 + Math.sin(motion * 0.13) * 18, 116, 0.88, 0.87);
    cloud(context, 602 + Math.cos(motion * 0.11) * 15, 78, 0.67, 0.86);
    cloud(context, 1097 + Math.sin(motion * 0.1) * 13, 196, 0.64, 0.68);
    for (let leaf = 0; leaf < 7; leaf += 1) {
      const leafX = (leaf * 193 + 70 + motion * (5 + leaf % 3)) % 1340 - 30;
      const leafY = 192 + (leaf * 53) % 231 + Math.sin(motion * 1.2 + leaf) * 9;
      context.save(); context.translate(leafX, leafY); context.rotate(motion * 0.3 + leaf); context.globalAlpha = 0.46;
      oval(context, 0, 0, 6, 3, leaf % 3 === 0 ? '#efc66f' : '#a9c290'); context.restore();
    }
  }

  function drawProjectile(context, projectile, time) {
    const centerY = projectile.y + Math.sin(time * 8 + projectile.age * 0.1) * 3;
    const glow = context.createRadialGradient(projectile.x, centerY, 5, projectile.x, centerY, 43);
    glow.addColorStop(0, '#ffdbe99e'); glow.addColorStop(1, '#efb3d300');
    oval(context, projectile.x, centerY, 44, 44, glow);
    oval(context, projectile.x, centerY, 26, 26, '#f5c6dea8');
    context.strokeStyle = '#fff4f7'; context.lineWidth = 2.5;
    context.beginPath(); context.arc(projectile.x, centerY, 26, 0, Math.PI * 2); context.stroke();
    heart(context, projectile.x, centerY + 1, 12, '#e896b6');
    oval(context, projectile.x - 10, centerY - 14, 7, 4, '#ffffffd9');
    star(context, projectile.x + 18, centerY + 18, 6, '#fffbeb', time);
  }

  class Effects {
    constructor() { this.items = []; this.shake = 0; this.banner = null; }

    clear() { this.items = []; this.shake = 0; this.banner = null; }

    add(event, reducedMotion = false) {
      if (event.kind === 'fight') this.banner = { text: '开心开打！', life: 1.1, total: 1.1 };
      if (event.kind === 'finish') {
        this.banner = { text: event.winner === null ? '默契平手！' : '好耶！', life: 1.05, total: 1.05 };
        if (event.winner !== null) {
          for (let particle = 0; particle < (reducedMotion ? 10 : 44); particle += 1) this.items.push({ type: particle % 3 === 0 ? 'heart' : 'star', x: 180 + Math.random() * 920, y: 100 + Math.random() * 150, velocityX: (Math.random() - 0.5) * 140, velocityY: -80 - Math.random() * 180, life: 2 + Math.random(), total: 3, size: 5 + Math.random() * 8, color: ['#ffc36d', '#ecadb7', '#afcc96'][particle % 3], rotation: Math.random() * 6 });
        }
      }
      if (['hit', 'guard', 'jump', 'double-jump', 'land', 'skill', 'bubble'].includes(event.kind)) {
        const hit = event.kind === 'hit';
        const shield = event.kind === 'guard';
        const count = reducedMotion ? 4 : hit ? (event.special ? 18 : 12) : 7;
        if (hit && !reducedMotion) this.shake = event.special ? 6 : 3;
        for (let particle = 0; particle < count; particle += 1) {
          const angle = particle / count * Math.PI * 2;
          const speed = hit ? 95 + Math.random() * 140 : 35 + Math.random() * 70;
          this.items.push({ type: hit ? (particle % 4 === 0 ? 'heart' : 'star') : shield ? 'ring' : 'dust', x: event.x, y: event.y, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed - 35, life: hit ? 0.6 : 0.45, total: hit ? 0.6 : 0.45, size: hit ? 5 + Math.random() * 7 : 4 + Math.random() * 5, color: shield ? '#b8e4d7' : hit && event.character === 'lumei' ? '#edb0c5' : '#ffd686', rotation: angle });
        }
        if (hit || shield) this.items.push({ type: 'label', x: event.x, y: event.y - 57, velocityX: 0, velocityY: -37, life: 0.75, total: 0.75, text: shield ? '挡住啦' : event.special ? '好厉害！' : '啪叽！', color: shield ? '#659e91' : '#b17b4c' });
      }
      if (this.items.length > 180) this.items.splice(0, this.items.length - 180);
    }

    update(seconds) {
      this.shake = Math.max(0, this.shake - seconds * 22);
      if (this.banner) { this.banner.life -= seconds; if (this.banner.life <= 0) this.banner = null; }
      for (const particle of this.items) {
        particle.life -= seconds;
        particle.x += particle.velocityX * seconds;
        particle.y += particle.velocityY * seconds;
        if (particle.type !== 'label') particle.velocityY += 125 * seconds;
        particle.rotation = (particle.rotation || 0) + seconds * 2;
      }
      this.items = this.items.filter(particle => particle.life > 0);
    }

    draw(context) {
      for (const particle of this.items) {
        context.save(); context.globalAlpha = Math.min(1, particle.life / particle.total * 1.7);
        if (particle.type === 'star') star(context, particle.x, particle.y, particle.size, particle.color, particle.rotation);
        else if (particle.type === 'heart') heart(context, particle.x, particle.y, particle.size * 0.65, particle.color);
        else if (particle.type === 'label') {
          context.font = '800 18px "PingFang SC", "Microsoft YaHei", sans-serif'; context.textAlign = 'center'; context.lineWidth = 5; context.strokeStyle = '#fff9e9'; context.strokeText(particle.text, particle.x, particle.y); context.fillStyle = particle.color; context.fillText(particle.text, particle.x, particle.y);
        } else if (particle.type === 'ring') {
          context.strokeStyle = particle.color; context.lineWidth = 2; context.beginPath(); context.arc(particle.x, particle.y, particle.size * (2 - particle.life / particle.total), 0, Math.PI * 2); context.stroke();
        } else oval(context, particle.x, particle.y, particle.size, particle.size * 0.8, '#fff9e4b0');
        context.restore();
      }
    }
  }

  function drawHome(context, time, reducedMotion = false) {
    drawScenery(context, time, { still: reducedMotion });
    const fighters = [
      { id: 0, kind: 'lulu', x: 399, y: 510, facing: 1, state: 'idle', stateFrame: 0, flash: 0 },
      { id: 1, kind: 'lumei', x: 883, y: 510, facing: -1, state: 'idle', stateFrame: 0, flash: 0 }
    ];
    for (const fighter of fighters) drawFighter(context, fighter, reducedMotion ? 1 : time, { scale: 1.03 });
    context.save(); context.translate(643, 382); context.rotate(-0.09);
    oval(context, 0, 0, 52, 50, '#fff8df9c');
    context.font = '900 italic 44px ui-rounded, "Arial Rounded MT Bold", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#c38d52'; context.fillText('VS', -2, 2);
    star(context, -54, -30, 8, '#edc77b', time * 0.1); star(context, 55, 26, 10, '#e7b590', -0.2);
    context.restore();
    for (const [name, english, position, color] of [['噜噜', 'LULU', 399, '#ba894e'], ['噜妹', 'LUMEI', 883, '#b78691']]) {
      context.font = '800 21px "PingFang SC", sans-serif'; context.textAlign = 'center'; context.fillStyle = color; context.fillText(name, position, 559);
      context.font = '600 10px sans-serif'; context.fillStyle = '#a69b79'; context.fillText(english, position, 577);
    }
    context.textAlign = 'left';
  }

  return { MODELS, MODEL_VIEWS, ANIMATIONS, modelSvg, poseFor, drawFighter, drawBackdrop, drawScenery, drawProjectile, drawHome, Effects, star, heart, oval, rounded };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Artwork;
