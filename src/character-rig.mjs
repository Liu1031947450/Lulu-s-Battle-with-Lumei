export const PIXELS_PER_UNIT = 78;

export function bindRig(model) {
  const names = ['motion', 'somersault', 'head_joint', 'far_arm', 'near_arm', 'far_leg', 'near_leg', 'eyes', 'closed_eyes', 'smile', 'open_mouth'];
  const rig = Object.fromEntries(names.map(name => {
    const joint = model.getObjectByName(name);
    if (!joint) throw new Error(`角色缺少关节：${name}`);
    return [name, joint];
  }));
  rig.headHeight = rig.head_joint.position.y;
  rig.kind = model.userData.kind;
  return rig;
}

export function applyPose(rig, pose, fighter, time, wholeBody = true) {
  const facing = fighter.facing === -1 ? -1 : 1;
  const nearArm = facing === 1 ? rig.near_arm : rig.far_arm;
  const farArm = facing === 1 ? rig.far_arm : rig.near_arm;
  const nearLeg = facing === 1 ? rig.near_leg : rig.far_leg;
  const farLeg = facing === 1 ? rig.far_leg : rig.near_leg;
  rig.motion.position.y = wholeBody ? -pose.bodyY / PIXELS_PER_UNIT : 0;
  rig.motion.rotation.z = wholeBody ? -pose.tilt * facing : 0;
  rig.motion.scale.set(wholeBody ? pose.scaleX : 1, wholeBody ? pose.scaleY : 1, 1);
  rig.somersault.rotation.z = wholeBody ? -pose.spin * facing : 0;
  rig.head_joint.position.y = rig.headHeight - pose.headY / PIXELS_PER_UNIT;
  rig.head_joint.rotation.z = -pose.headAngle * facing;
  farArm.rotation.set(pose.farArm * 0.16, 0, -pose.farArm * facing);
  nearArm.rotation.set(-pose.nearArm * 0.12, 0, -pose.nearArm * facing);
  farArm.scale.y = 1;
  nearArm.scale.y = 1 + Math.max(0, pose.reach) / 160;
  farLeg.rotation.set(pose.farLeg * 0.8, 0, -pose.farLeg * 0.35 * facing);
  nearLeg.rotation.set(pose.nearLeg * 0.8, 0, -pose.nearLeg * 0.35 * facing);
  const closed = pose.eyes !== 'normal';
  const blinking = (time + (fighter.id || 0) * 1.9) % 4.8 < 0.13;
  rig.eyes.scale.setScalar(closed ? 0.001 : 1);
  rig.eyes.scale.y *= blinking ? 0.06 : 1;
  rig.closed_eyes.scale.setScalar(closed ? 1 : 0.001);
  const open = rig.kind === 'lumei' || pose.smile === 'happy' || pose.smile === 'determined';
  rig.smile.scale.setScalar(open ? 0.001 : 1);
  rig.open_mouth.scale.set(open ? 1 : 0.001, open ? (pose.smile === 'determined' ? 0.55 : 1) : 0.001, 1);
}
