import * as THREE from 'three';

// --- 材质 ---
const metalDark = new THREE.MeshStandardMaterial({
  color: 0x3a3a42, metalness: 0.85, roughness: 0.35,
});
const metalBright = new THREE.MeshStandardMaterial({
  color: 0x8a8a96, metalness: 0.9, roughness: 0.2,
});
const accentMat = new THREE.MeshStandardMaterial({
  color: 0xe8621c, metalness: 0.7, roughness: 0.3, emissive: 0x331000,
});
const fingerMat = new THREE.MeshStandardMaterial({
  color: 0xcc3322, metalness: 0.6, roughness: 0.35, emissive: 0x220808,
});
const baseMat = new THREE.MeshStandardMaterial({
  color: 0x222228, metalness: 0.9, roughness: 0.25,
});

// --- 工具函数 ---
function cyl(rTop, rBot, h, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(
    Math.max(0.001, rTop), Math.max(0.001, rBot), Math.max(0.001, h), 24
  ), mat);
}

function torus(r, tube, mat) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(0.001, r), Math.max(0.001, tube), 12, 24), mat
  );
}

// --- 尺寸常量 ---
const LINK1_LEN = 1.2;   // 上臂
const LINK2_LEN = 1.0;   // 前臂（固定长度，强壮有力）
const WRIST_LEN = 0.3;   // 手腕长度
const FINGER_LEN = 0.22; // 手指长度
const GRIP_BASE_H = 0.05;

// 液压升降参数
const BASE_PLATE_Y = 0.04;   // 底板半高
const BASE_PLATE_TOP = 0.08; // 底板顶面
const OUTER_CYL_H = 0.55;    // 外缸体高度
const OUTER_CYL_BOTTOM = BASE_PLATE_TOP;                    // 0.08
const OUTER_CYL_TOP = BASE_PLATE_TOP + OUTER_CYL_H;         // 0.63
const PISTON_ROD_LEN = 0.48;  // 活塞杆长度（含活塞头）
const PISTON_HEAD_H = 0.04;   // 活塞头高度

// liftGroup 局部坐标：活塞头底面在 -PISTON_ROD_LEN - PISTON_HEAD_H/2
// 活塞头底面世界y = liftGroup.y - PISTON_ROD_LEN - PISTON_HEAD_H/2
// 最低限位：活塞头底面 ≥ 缸底
//   liftGroup.y ≥ OUTER_CYL_BOTTOM + PISTON_ROD_LEN + PISTON_HEAD_H/2
//   liftGroup.y ≥ 0.08 + 0.48 + 0.02 = 0.58
// 最高限位：活塞头顶面 ≤ 缸顶
//   liftGroup.y - PISTON_ROD_LEN + PISTON_HEAD_H/2 ≤ OUTER_CYL_TOP
//   liftGroup.y ≤ OUTER_CYL_TOP + PISTON_ROD_LEN - PISTON_HEAD_H/2
//   liftGroup.y ≤ 0.63 + 0.48 - 0.02 = 1.09
// 行程 = 1.09 - 0.58 = 0.51

const LIFT_MIN_Y = OUTER_CYL_BOTTOM + PISTON_ROD_LEN + PISTON_HEAD_H / 2;  // 0.58
const LIFT_MAX_Y = OUTER_CYL_TOP + PISTON_ROD_LEN - PISTON_HEAD_H / 2;      // 1.09
const BASE_REST_Y = LIFT_MIN_Y;  // 静止在最低位
const BASE_MAX_LIFT = LIFT_MAX_Y - LIFT_MIN_Y;  // 0.51

export { BASE_REST_Y, BASE_MAX_LIFT, LIFT_MIN_Y, LIFT_MAX_Y };

/**
 * 工业风 6-DOF 机械臂——底座液压升降版
 */
export function buildRobotArm() {
  const root = new THREE.Group();
  root.scale.setScalar(0.9);

  // ========== 底座底板 ==========
  const basePlate = cyl(0.45, 0.5, 0.08, baseMat);
  basePlate.position.y = BASE_PLATE_Y; root.add(basePlate);

  const baseRing1 = torus(0.35, 0.015, accentMat);
  baseRing1.rotation.x = Math.PI / 2; baseRing1.position.y = BASE_PLATE_TOP; root.add(baseRing1);

  // ========== 底座液压升降系统 ==========
  // 外缸体——固定在底板上的粗壮工业外壳
  const outerCyl = cyl(0.2, 0.24, OUTER_CYL_H, metalDark);
  outerCyl.position.y = BASE_PLATE_TOP + OUTER_CYL_H / 2; root.add(outerCyl);

  // 缸体底部法兰
  const cylBotRing = torus(0.22, 0.012, accentMat);
  cylBotRing.rotation.x = Math.PI / 2; cylBotRing.position.y = BASE_PLATE_TOP; root.add(cylBotRing);

  // 缸体顶部开口环——活塞杆从这里伸出
  const cylTopRing = torus(0.18, 0.008, metalBright);
  cylTopRing.rotation.x = Math.PI / 2; cylTopRing.position.y = OUTER_CYL_TOP; root.add(cylTopRing);

  // 缸体中部装饰线——加强工业感
  for (const frac of [0.3, 0.6]) {
    const band = torus(0.215, 0.005, metalBright);
    band.rotation.x = Math.PI / 2;
    band.position.y = BASE_PLATE_TOP + OUTER_CYL_H * frac;
    root.add(band);
  }

  // 升降平台——带着整个臂上下移动
  const liftGroup = new THREE.Group();
  liftGroup.position.y = BASE_REST_Y;
  root.add(liftGroup);

  // 内活塞杆——从升降平台向下伸入缸体
  const innerRod = cyl(0.11, 0.13, PISTON_ROD_LEN, metalBright);
  innerRod.position.y = -PISTON_ROD_LEN / 2; liftGroup.add(innerRod);

  // 活塞头——在缸体内部滑动，比缸内径略小
  const pistonHead = cyl(0.14, 0.16, PISTON_HEAD_H, accentMat);
  pistonHead.position.y = -PISTON_ROD_LEN; liftGroup.add(pistonHead);

  // ========== J1: 肩部偏航 ==========
  const j1 = new THREE.Group();
  liftGroup.add(j1);

  const shoulderDisk = cyl(0.2, 0.18, 0.06, metalBright);
  shoulderDisk.position.y = 0; j1.add(shoulderDisk);

  const shoulderRing = torus(0.2, 0.025, metalBright);
  shoulderRing.rotation.x = Math.PI / 2; shoulderRing.position.y = 0.03; j1.add(shoulderRing);

  // ========== J2: 肩部俯仰 ==========
  const j2 = new THREE.Group();
  j2.position.y = 0.06; j1.add(j2);

  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 20), metalBright);
  j2.add(shoulderBall);

  const sidePlateGeo = new THREE.BoxGeometry(0.04, 0.16, 0.12);
  const sideL = new THREE.Mesh(sidePlateGeo, metalDark);
  sideL.position.set(-0.1, 0.04, 0); j2.add(sideL);
  const sideR = new THREE.Mesh(sidePlateGeo, metalDark);
  sideR.position.set(0.1, 0.04, 0); j2.add(sideR);

  // ========== 上臂 ==========
  const upperArmGeo = new THREE.BoxGeometry(0.1, LINK1_LEN, 0.09);
  const upperArm = new THREE.Mesh(upperArmGeo, metalDark);
  upperArm.position.y = LINK1_LEN / 2; j2.add(upperArm);

  const upperLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, LINK1_LEN * 0.8, 0.095), accentMat
  );
  upperLine.position.y = LINK1_LEN / 2; j2.add(upperLine);

  // ========== J3: 肘部俯仰 ==========
  const j3 = new THREE.Group();
  j3.position.y = LINK1_LEN; j2.add(j3);

  const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), metalBright);
  j3.add(elbowBall);

  const elbowSleeve = cyl(0.08, 0.07, 0.12, metalDark);
  elbowSleeve.position.y = 0.06; j3.add(elbowSleeve);

  const upperArmCuff = cyl(0.07, 0.065, 0.06, metalDark);
  upperArmCuff.position.y = LINK1_LEN - 0.02; j2.add(upperArmCuff);
  const cuffAccent = cyl(0.072, 0.072, 0.01, accentMat);
  cuffAccent.position.y = LINK1_LEN - 0.02; j2.add(cuffAccent);

  const elbowSideGeo = new THREE.BoxGeometry(0.03, 0.1, 0.08);
  const eSideL = new THREE.Mesh(elbowSideGeo, metalDark);
  eSideL.position.set(-0.08, 0.02, 0); j3.add(eSideL);
  const eSideR = new THREE.Mesh(elbowSideGeo, metalDark);
  eSideR.position.set(0.08, 0.02, 0); j3.add(eSideR);

  // ========== 前臂（固定长度，强壮有力）==========
  const forearmGeo = new THREE.BoxGeometry(0.08, LINK2_LEN, 0.07);
  const forearm = new THREE.Mesh(forearmGeo, metalDark);
  forearm.position.y = LINK2_LEN / 2; j3.add(forearm);

  const forearmLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, LINK2_LEN * 0.75, 0.075), accentMat
  );
  forearmLine.position.y = LINK2_LEN / 2; j3.add(forearmLine);

  // ========== J4: 手腕偏航 ==========
  const j4 = new THREE.Group();
  j4.position.y = LINK2_LEN; j3.add(j4);

  const wristJoint = cyl(0.05, 0.05, 0.06, metalBright);
  wristJoint.position.y = 0.03; j4.add(wristJoint);

  // ========== J5: 手腕俯仰 ==========
  const j5 = new THREE.Group();
  j5.position.y = WRIST_LEN; j4.add(j5);

  const wristBar = cyl(0.03, 0.025, WRIST_LEN, metalDark);
  wristBar.position.y = WRIST_LEN / 2; j4.add(wristBar);

  const wristAccent = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, WRIST_LEN * 0.6, 0.03), accentMat
  );
  wristAccent.position.y = WRIST_LEN * 0.7; j4.add(wristAccent);

  const j5Ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), metalBright);
  j5.add(j5Ball);

  // ========== J6: 夹爪旋转 ==========
  const j6 = new THREE.Group();
  j5.add(j6);

  const gripBase = cyl(0.06, 0.07, GRIP_BASE_H, metalDark);
  gripBase.position.y = 0.025; j6.add(gripBase);

  const gripRing = torus(0.06, 0.008, accentMat);
  gripRing.rotation.x = Math.PI / 2; gripRing.position.y = 0.05; j6.add(gripRing);

  // ========== 手指 ==========
  function makeFinger(xOff) {
    const finger = new THREE.Group();
    finger.position.set(xOff, GRIP_BASE_H, 0);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.04, 0.03), metalBright
    );
    base.position.y = 0.02; finger.add(base);

    const mainBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, FINGER_LEN, 0.025), fingerMat
    );
    mainBar.position.y = 0.04 + FINGER_LEN / 2; finger.add(mainBar);

    for (let i = 0; i < 3; i++) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.015, 0.028), metalBright
      );
      tooth.position.set(xOff > 0 ? -0.008 : 0.008, 0.06 + i * 0.06, 0);
      finger.add(tooth);
    }

    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.02, 0.027), accentMat
    );
    tip.position.y = 0.04 + FINGER_LEN; finger.add(tip);

    return finger;
  }

  const leftFinger = makeFinger(-0.04);
  const rightFinger = makeFinger(0.04);
  j6.add(leftFinger);
  j6.add(rightFinger);

  const gripperTipOffset = GRIP_BASE_H + 0.04 + FINGER_LEN + 0.01;

  return {
    root,
    joints: { j1, j2, j3, j4, j5, j6 },
    fingers: { left: leftFinger, right: rightFinger },
    upperArmLength: LINK1_LEN,
    forearmLength: LINK2_LEN,
    wristLength: WRIST_LEN,
    gripperTipOffset,
    liftGroup,
    baseRestY: BASE_REST_Y,
    baseMaxLift: BASE_MAX_LIFT,
    liftMinY: LIFT_MIN_Y,
    liftMaxY: LIFT_MAX_Y,
    getGripperTip() {
      const tip = new THREE.Vector3(0, gripperTipOffset, 0);
      j6.localToWorld(tip);
      return tip;
    },
    getGripperCenter() {
      const center = new THREE.Vector3(0, gripperTipOffset - 0.03, 0);
      j6.localToWorld(center);
      return center;
    },
    getShoulderPos() {
      const pos = new THREE.Vector3();
      j2.getWorldPosition(pos);
      return pos;
    },
  };
}

export function setGrip(fingers, grip) {
  const maxOpen = 0.35;
  const minOpen = -0.05;
  const angle = maxOpen + (minOpen - maxOpen) * grip;
  fingers.left.rotation.z = angle;
  fingers.right.rotation.z = -angle;
}
