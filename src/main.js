import * as THREE from 'three';
import { buildRobotArm, setGrip, BASE_REST_Y, BASE_MAX_LIFT, LIFT_MIN_Y, LIFT_MAX_Y } from './RobotArm.js';
import { IKSolver } from './IKSolver.js';
import { FakeCursor } from './FakeCursor.js';

// ============================================================
// 渲染器
// ============================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d14);
scene.fog = new THREE.FogExp2(0x0d0d14, 0.04);

// 3/4 侧视角——工厂视角稍高
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4.0, 3.5, 5.0);
camera.lookAt(0, 1.0, 0.8);

// ============================================================
// 工厂灯光系统
// ============================================================
scene.add(new THREE.AmbientLight(0x222233, 0.8));

// 天窗主光——冷白工业照明
const skyLight = new THREE.DirectionalLight(0xdde4f0, 2.0);
skyLight.position.set(2, 10, 3);
skyLight.castShadow = true;
skyLight.shadow.mapSize.set(1024, 1024);
skyLight.shadow.camera.near = 0.5; skyLight.shadow.camera.far = 25;
skyLight.shadow.camera.left = -8; skyLight.shadow.camera.right = 8;
skyLight.shadow.camera.top = 8; skyLight.shadow.camera.bottom = -2;
scene.add(skyLight);

// 暖色补光——模拟焊接弧光
const weldLight = new THREE.DirectionalLight(0xffaa44, 0.5);
weldLight.position.set(-4, 3, -1); scene.add(weldLight);

// 冷色背光——天光反射
const backLight = new THREE.DirectionalLight(0x4466aa, 0.4);
backLight.position.set(0, 2, -3); scene.add(backLight);

// 工业顶灯阵列——6盏高天棚灯
const lampMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x99aabb, emissiveIntensity: 2 });
const lampPositions = [[-3, 6.8, 0], [-1, 6.8, 0], [1, 6.8, 0], [3, 6.8, 0],
                        [-2, 6.8, 3], [2, 6.8, 3]];
for (const [lx, ly, lz] of lampPositions) {
  const pl = new THREE.PointLight(0xccddff, 1.0, 12);
  pl.position.set(lx, ly - 0.2, lz); scene.add(pl);
  const lampBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), lampMat);
  lampBody.position.set(lx, ly, lz); scene.add(lampBody);
  // 灯杆
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), lampMat);
  rod.position.set(lx, ly + 0.22, lz); scene.add(rod);
}

// 焊接区补光
const areaLight = new THREE.PointLight(0xccddff, 0.6, 8);
areaLight.position.set(-3.5, 2.0, -4); scene.add(areaLight);

const warnLight = new THREE.PointLight(0xe8621c, 0.8, 4);
warnLight.position.set(0, 0.3, 1.2); scene.add(warnLight);

// ============================================================
// 工厂地板 + 生产线环境
// ============================================================
function createFactoryFloorTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  // 深灰混凝土地面
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, s, s);
  // 混凝土纹理——随机颗粒
  for (let i = 0; i < 50000; i++) {
    const v = 25 + Math.random() * 35;
    ctx.fillStyle = `rgba(${v},${v},${v + 2},0.06)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // 工位线——黄色安全线
  ctx.strokeStyle = '#8a7a20'; ctx.lineWidth = 4; ctx.setLineDash([20, 10]);
  ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.lineTo(s, s * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, s * 0.7); ctx.lineTo(s, s * 0.7); ctx.stroke();
  ctx.setLineDash([]);
  // 红色警示区
  ctx.strokeStyle = '#6a2222'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(s * 0.8, 0); ctx.lineTo(s * 0.8, s); ctx.stroke();
  // 油污渍
  for (let i = 0; i < 12; i++) {
    const cx = Math.random() * s, cy = Math.random() * s, r = 8 + Math.random() * 30;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(15,12,8,0.25)'); g.addColorStop(1, 'rgba(15,12,8,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(8, 8);
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ map: createFactoryFloorTexture(), metalness: 0.3, roughness: 0.7 })
);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// 工位标识——橙色发光圈
const baseGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 1.8),
  new THREE.MeshBasicMaterial({ color: 0xe8621c, transparent: true, opacity: 0.1, depthWrite: false })
);
baseGlow.rotation.x = -Math.PI / 2; baseGlow.position.set(0, 0.004, 1.0); scene.add(baseGlow);

// ---- 工厂建筑结构 ----
const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.85, metalness: 0.2 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.7, roughness: 0.4 });
const steelOrange = new THREE.MeshStandardMaterial({ color: 0xcc5511, metalness: 0.6, roughness: 0.35 });

// 后墙——巨大工业厂房墙壁
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), wallMat);
backWall.position.set(0, 4, -10); scene.add(backWall);
// 侧墙
const sideWallL = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), wallMat);
sideWallL.rotation.y = Math.PI / 2; sideWallL.position.set(-10, 4, 0); scene.add(sideWallL);
// 天花板
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 20),
  new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.9, metalness: 0.15 })
);
ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 7.2, 0); scene.add(ceiling);

// 钢柱——只保留角落4根，不挡视线
const pillarPositions = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
for (const [px, pz] of pillarPositions) {
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7.2, 0.18), steelMat);
  col.position.set(px, 3.6, pz); col.castShadow = true; scene.add(col);
}

// 天车横梁
for (const z of [-6, 2]) {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 0.25), steelMat);
  beam.position.set(0, 6.8, z); scene.add(beam);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(22, 0.04, 0.08), steelOrange);
  rack.position.set(0, 6.72, z); scene.add(rack);
}

// 天车（桥式起重机）——可动对象，存到变量用于动画
const crane = new THREE.Group();
const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 14), steelMat);
crane.add(craneBeam);
const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), steelMat);
hookBlock.position.set(0, -0.5, 0); crane.add(hookBlock);
const hookCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), steelMat);
hookCyl.position.set(0, -0.8, 0); crane.add(hookCyl);
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.0, 4), steelMat);
rope.position.set(0, -1.5, 0); crane.add(rope);
crane.position.set(-2, 6.5, -1); scene.add(crane);

// ---- 传送带系统 ----
const CONV_X = -5;
const CONV_Y = 0.55;
const CONV_Z_START = -9;
const CONV_Z_END = 5;
const CONV_LEN = CONV_Z_END - CONV_Z_START;
const CONV_W = 1.2;

// 皮带纹理
function createBeltTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2e';
  ctx.fillRect(0, 0, s, s);
  // 横条纹——皮带花纹
  for (let y = 0; y < s; y += 12) {
    ctx.fillStyle = y % 24 < 12 ? 'rgba(50,50,55,0.6)' : 'rgba(30,30,35,0.6)';
    ctx.fillRect(0, y, s, 12);
  }
  // 中线
  ctx.strokeStyle = '#3a3a3e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, CONV_LEN * 2);
  return tex;
}
const beltTex = createBeltTexture();
const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.75, metalness: 0.3 });

// 皮带主体——一整条
const beltMesh = new THREE.Mesh(
  new THREE.BoxGeometry(CONV_W - 0.1, 0.06, CONV_LEN),
  beltMat
);
beltMesh.position.set(CONV_X, CONV_Y, (CONV_Z_START + CONV_Z_END) / 2);
beltMesh.receiveShadow = true; scene.add(beltMesh);

// 两侧护栏
const railMat = new THREE.MeshStandardMaterial({ color: 0xccaa22, metalness: 0.5, roughness: 0.4 });
for (const side of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, CONV_LEN), railMat);
  rail.position.set(CONV_X + side * CONV_W / 2, CONV_Y + 0.08, (CONV_Z_START + CONV_Z_END) / 2);
  scene.add(rail);
}

// 支架腿——每隔一段一根
for (let z = CONV_Z_START + 1; z < CONV_Z_END; z += 2) {
  for (const lx of [CONV_X - 0.5, CONV_X + 0.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, CONV_Y, 0.05), steelMat);
    leg.position.set(lx, CONV_Y / 2, z); scene.add(leg);
  }
}

// 滚轮——皮带下方，连续排列
const conveyorRollers = [];
for (let z = CONV_Z_START + 0.5; z < CONV_Z_END; z += 0.8) {
  const roller = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, CONV_W - 0.15, 10),
    steelMat
  );
  roller.rotation.z = Math.PI / 2;
  roller.position.set(CONV_X, CONV_Y - 0.04, z);
  scene.add(roller);
  conveyorRollers.push(roller);
}

// 两端大滚筒
for (const z of [CONV_Z_START, CONV_Z_END]) {
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, CONV_W, 16),
    new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.6, roughness: 0.3 })
  );
  drum.rotation.z = Math.PI / 2;
  drum.position.set(CONV_X, CONV_Y - 0.02, z);
  scene.add(drum);
}

// ---- 汽车移到传送带旁的独立工位 ----
function makeCarBody(x, y, z, stage) {
  const car = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.9), steelMat);
  chassis.position.y = 0.06; car.add(chassis);
  if (stage >= 1) {
    const bodyLower = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.4, 0.85),
      new THREE.MeshStandardMaterial({ color: stage >= 3 ? 0x333340 : 0x555560, metalness: 0.5, roughness: 0.5 })
    );
    bodyLower.position.y = 0.32; car.add(bodyLower);
  }
  if (stage >= 2) {
    const bodyUpper = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.35, 0.8),
      new THREE.MeshStandardMaterial({ color: stage >= 3 ? 0x333340 : 0x444450, metalness: 0.5, roughness: 0.5 })
    );
    bodyUpper.position.y = 0.7; car.add(bodyUpper);
    for (const s of [-0.35, 0.35]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), steelMat);
      pillar.position.set(-0.4, 0.52, s); car.add(pillar);
      const pillar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), steelMat);
      pillar2.position.set(0.4, 0.52, s); car.add(pillar2);
    }
  }
  if (stage >= 3) {
    for (const wx of [-0.55, 0.55]) {
      for (const wz of [-0.42, 0.42]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16),
          new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.8 })
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.14, wz); car.add(wheel);
      }
    }
  }
  car.position.set(x, y, z);
  return car;
}

// 三辆车放在远处——不挡机械臂
const carPositions = [[-4.5, 0.5, -5], [-4.5, 0.5, -1], [-4.5, 0.5, 5]];
const carStages = [1, 2, 3];
for (let i = 0; i < 3; i++) {
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.5, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.4, roughness: 0.6 })
  );
  platform.position.set(carPositions[i][0], 0.25, carPositions[i][2]);
  platform.receiveShadow = true; platform.castShadow = true;
  scene.add(platform);
  scene.add(makeCarBody(carPositions[i][0], carPositions[i][1] + 0.25, carPositions[i][2], carStages[i]));
}

// ---- 货物箱材质 ----
function createCrateTexture(baseColor, labelColor) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, s, s);
  // 木纹/纸板纹理
  for (let i = 0; i < 3000; i++) {
    const v = Math.random() * 30;
    ctx.fillStyle = `rgba(${v},${v},${v},0.08)`;
    ctx.fillRect(0, Math.random() * s, s, 1 + Math.random() * 2);
  }
  // 边框线
  ctx.strokeStyle = labelColor; ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, s - 24, s - 24);
  // 中心标签
  ctx.fillStyle = labelColor;
  ctx.fillRect(s * 0.3, s * 0.3, s * 0.4, s * 0.4);
  // 箭头
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.35); ctx.lineTo(s * 0.6, s * 0.48);
  ctx.lineTo(s * 0.55, s * 0.48); ctx.lineTo(s * 0.55, s * 0.6);
  ctx.lineTo(s * 0.45, s * 0.6); ctx.lineTo(s * 0.45, s * 0.48);
  ctx.lineTo(s * 0.4, s * 0.48); ctx.closePath(); ctx.fill();
  // 角标
  for (const [cx, cy] of [[20, 20], [s - 20, 20], [20, s - 20], [s - 20, s - 20]]) {
    ctx.fillStyle = labelColor;
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const crateTex1 = createCrateTexture('#8B7355', '#D4A54A');
const crateTex2 = createCrateTexture('#5A6A5A', '#7A9A7A');
const crateTex3 = createCrateTexture('#6A5A4A', '#AA7744');
const crateTex4 = createCrateTexture('#4A5568', '#8899AA');

const crateMats = [
  new THREE.MeshStandardMaterial({ map: crateTex1, roughness: 0.8, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: crateTex2, roughness: 0.75, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: crateTex3, roughness: 0.8, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: crateTex4, roughness: 0.7, metalness: 0.1 }),
];

function makeCrate(w, h, d, matIdx) {
  const mat = crateMats[matIdx % crateMats.length];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---- 传送带上的移动货物 ----
const conveyorBoxes = [];
const BOX_SPEED = 0.8;

function spawnConveyorBox() {
  const size = 0.2 + Math.random() * 0.25;
  const h = size * (0.6 + Math.random() * 0.5);
  const box = makeCrate(size, h, size, Math.floor(Math.random() * 4));
  // 货物紧贴皮带顶面
  box.position.set(
    CONV_X + (Math.random() - 0.5) * 0.3,
    CONV_Y + 0.03 + h / 2,
    CONV_Z_START + 0.5
  );
  box.rotation.y = (Math.random() - 0.5) * 0.2;
  scene.add(box);
  conveyorBoxes.push({ mesh: box, speed: BOX_SPEED * (0.8 + Math.random() * 0.4) });
}

// 初始货物——沿整条传送带分布
for (let z = CONV_Z_START + 1; z < CONV_Z_END - 1; z += 1.2 + Math.random() * 0.8) {
  const size = 0.2 + Math.random() * 0.25;
  const h = size * (0.6 + Math.random() * 0.5);
  const box = makeCrate(size, h, size, Math.floor(Math.random() * 4));
  box.position.set(CONV_X + (Math.random() - 0.5) * 0.3, CONV_Y + 0.03 + h / 2, z);
  box.rotation.y = (Math.random() - 0.5) * 0.2;
  scene.add(box);
  conveyorBoxes.push({ mesh: box, speed: BOX_SPEED * (0.8 + Math.random() * 0.4) });
}

// ---- 背景货物堆（全在远处，不挡机械臂行程）----
// 左侧远处传送带尽头堆货
for (let i = 0; i < 12; i++) {
  const size = 0.3 + Math.random() * 0.4;
  const box = makeCrate(size, size, size * (0.8 + Math.random() * 0.4), i % 4);
  box.position.set(
    -8.5 + Math.random() * 1.5,
    size * 0.5 + Math.floor(i / 3) * size,
    -8 + (i % 3) * 1.5
  );
  box.rotation.y = Math.random() * 0.2;
  scene.add(box);
}

// 右侧远处深处货物堆——远离机械臂
for (let i = 0; i < 18; i++) {
  const size = 0.3 + Math.random() * 0.5;
  const box = makeCrate(size, size * (0.8 + Math.random() * 0.3), size, i % 4);
  const row = Math.floor(i / 6);
  const col = i % 6;
  box.position.set(
    7 + col * 0.8 + Math.random() * 0.1,
    size * 0.5 + row * size,
    -9 + Math.random() * 2
  );
  box.rotation.y = (Math.random() - 0.5) * 0.15;
  scene.add(box);
}

// 后墙附近大型托盘货
function makePallet(x, y, z) {
  const g = new THREE.Group();
  // 托盘底座
  const pallet = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9, metalness: 0.02 })
  );
  pallet.position.y = 0.04; g.add(pallet);
  // 托盘脚
  for (const [px, pz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3], [0, 0]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x7A6445, roughness: 0.9 })
    );
    foot.position.set(px, 0.03, pz); g.add(foot);
  }
  // 箱子层
  for (let layer = 0; layer < 2 + Math.floor(Math.random() * 2); layer++) {
    const s = 0.4 + Math.random() * 0.2;
    const box = makeCrate(s * 2, s, s * 1.5, Math.floor(Math.random() * 4));
    box.position.y = 0.08 + s * 0.5 + layer * s;
    box.rotation.y = layer % 2 === 0 ? 0 : Math.PI * 0.5;
    g.add(box);
  }
  g.position.set(x, y, z);
  return g;
}

scene.add(makePallet(-9, 0, 2));
scene.add(makePallet(-9, 0, 0));
scene.add(makePallet(-9, 0, -2));
scene.add(makePallet(8, 0, -1));
scene.add(makePallet(8, 0, 1));
scene.add(makePallet(8, 0, 3));

// 后墙货架——堆满货
const shelfBoardMat = new THREE.MeshStandardMaterial({ color: 0x4A4A52, metalness: 0.6, roughness: 0.4 });
for (let sx = -3; sx <= 3; sx += 3) {
  const shelfGroup = new THREE.Group();
  // 立柱
  for (const dx of [-0.5, 0.5]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.5, 0.04), shelfBoardMat);
    upright.position.set(dx, 1.25, 0); shelfGroup.add(upright);
  }
  // 4层隔板+货物
  for (let layer = 0; layer < 4; layer++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.5), shelfBoardMat);
    board.position.y = 0.3 + layer * 0.6; shelfGroup.add(board);
    // 每层放2-3个箱子
    for (let b = 0; b < 2 + Math.floor(Math.random() * 2); b++) {
      const bs = 0.15 + Math.random() * 0.12;
      const box = makeCrate(bs * 2, bs * 1.5, bs * 2, Math.floor(Math.random() * 4));
      box.position.set(-0.3 + b * 0.3, 0.3 + layer * 0.6 + bs * 0.75 + 0.015, 0);
      shelfGroup.add(box);
    }
  }
  shelfGroup.position.set(sx, 0, -11);
  scene.add(shelfGroup);
}

// ---- 工具车（放远处不挡臂）----
const toolCart = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), steelMat);
toolCart.position.set(-3.5, 0.25, 4); toolCart.castShadow = true; scene.add(toolCart);
const toolTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.55), steelMat);
toolTop.position.set(-3.5, 0.52, 4); scene.add(toolTop);
for (const wx of [-3.85, -3.15]) {
  for (const wz of [3.78, 4.22]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.8 })
    );
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.06, wz); scene.add(w);
  }
}

// 安全锥——放在远离机械臂的边缘
for (const pos of [[-4, 0, 4.5], [-5.5, 0, 4.5], [3.5, 0, 4.5], [5, 0, 4.5]]) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0x331000, emissiveIntensity: 0.5 })
  );
  cone.position.set(pos[0], 0.125, pos[2]); scene.add(cone);
  const coneBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xff6600 })
  );
  coneBase.position.set(pos[0], 0.01, pos[2]); scene.add(coneBase);
}

// 地面管线
for (const y of [0.08, 0.22]) {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 18, 8),
    new THREE.MeshStandardMaterial({ color: y < 0.15 ? 0x884422 : 0x224488, metalness: 0.6, roughness: 0.4 })
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, y, -9.5); scene.add(pipe);
}

// ============================================================
// 机械臂 + IK
// ============================================================
const arm = buildRobotArm();
arm.root.position.set(0, 0, 1.0);
scene.add(arm.root);

const wristOffset = arm.wristLength + arm.gripperTipOffset;
const sc = arm.root.scale.x;
const ik = new IKSolver(arm.upperArmLength * sc, arm.forearmLength * sc, wristOffset * sc);

const fakeCursor = new FakeCursor(scene);

// ============================================================
// 鼠标 → 世界坐标
// ============================================================
const mouseNDC = new THREE.Vector2(999, 999);
const mouseWorld = new THREE.Vector3(0, 1.5, 2.3);
const mouseSmooth = new THREE.Vector3(0, 1.5, 2.3);
const mousePrev = new THREE.Vector3(0, 1.5, 2.3);
let mouseSpeed = 0, mouseActive = false;

document.addEventListener('mousemove', (e) => {
  mouseActive = true;
  mouseNDC.x = (e.clientX / innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / innerHeight) * 2 + 1;
});

function updateMouseWorld(dt) {
  if (!mouseActive) return;

  // 射线→面向相机的平面投射
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouseNDC, camera);

  const shoulder = arm.getShoulderPos();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(camDir.negate(), shoulder);

  const hit = new THREE.Vector3();
  if (!rc.ray.intersectPlane(plane, hit)) {
    hit.copy(shoulder).add(new THREE.Vector3(0, 0, 1.5));
  }
  mouseWorld.copy(hit);

  // 伺机而动：鼠标平滑要慢，营造计算中的猎手感
  mouseSmooth.lerp(mouseWorld, 0.12);
  if (dt > 0) mouseSpeed = mouseSmooth.distanceTo(mousePrev) / dt;
  mousePrev.copy(mouseSmooth);
}

// ============================================================
// 工具
// ============================================================
function applyJoints(jc) {
  arm.joints.j1.rotation.y = jc.j1;
  arm.joints.j2.rotation.x = jc.j2;
  arm.joints.j3.rotation.x = jc.j3;
  arm.joints.j4.rotation.y = jc.j4;
  arm.joints.j5.rotation.x = jc.j5;
  arm.joints.j6.rotation.z = jc.j6;
  setGrip(arm.fingers, jc.grip);
}

function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function rand(a, b) { return a + Math.random() * (b - a); }

// ============================================================
// 姿态权重层——中间抽象层，基于场论工程
// ============================================================
// 姿态锚点：每种"身体姿态"的关节快照
// 权重由驱动源（注意力、鼠标高度、鼠标距离）连续计算
// 最终姿态 = 各锚点的加权平均——天然平滑，无离散跳变

const POSE_STAND  = { j2: 0.0, j3: 0.05 };   // 完全竖直——狼狗站起来
const POSE_READY  = { j2: 0.4, j3: 1.2 };     // 半弯蓄力——关注状态
const POSE_LUNGE  = { j2: 0.9, j3: 0.35 };    // 前扑——弯腰伸出
const POSE_REACH  = { j2: 1.2, j3: 0.15 };    // 极限前伸——链子拉到头

// 权重混合——只在hunt阶段介入，snap/carry/release由自己的逻辑控制
function applyPoseWeights(jc, dt) {
  if (grab.phase !== 'hunt') return;

  const shoulder = arm.getShoulderPos();
  const dist = shoulder.distanceTo(mouseSmooth);
  const maxReach = (arm.upperArmLength + arm.forearmLength + wristOffset) * sc;
  const distRatio = THREE.MathUtils.clamp(dist / maxReach, 0, 1);
  const heightRatio = THREE.MathUtils.clamp((mouseSmooth.y - shoulder.y + 1) / 3, 0, 1);
  const attVal = att.value;

  // ---- 权重计算 ----
  // w_stand: 注意力低 + 目标近 + 目标高 → 多站立
  // w_ready: 中等注意力 → 半弯
  // w_lunge: 高注意力 + 远距离 → 前扑
  // w_reach: 目标非常远 + 高注意力 → 极限伸

  let w_stand = 0, w_ready = 0, w_lunge = 0, w_reach = 0;

  // 基于注意力的基础分布
  if (attVal < att.alertAt) {
    // 低注意力：大部分时间站立，偶尔微弯
    w_stand = 0.7;
    w_ready = 0.3;
  } else if (attVal < att.pursueAt) {
    // 关注：从站逐渐过渡到蓄力
    const t = (attVal - att.alertAt) / (att.pursueAt - att.alertAt);
    w_stand = 0.6 * (1 - t);
    w_ready = 0.4 + 0.4 * t;
    w_lunge = 0.2 * t;
  } else if (attVal < att.lungeAt) {
    // 追击：蓄力到前扑的过渡
    const t = (attVal - att.pursueAt) / (att.lungeAt - att.pursueAt);
    w_stand = 0.1 * (1 - t);
    w_ready = 0.5 * (1 - t);
    w_lunge = 0.4 + 0.4 * t;
    w_reach = 0.1 * t;
  } else {
    // 冲刺：前扑为主，远距离加极限伸
    w_lunge = 0.5;
    w_reach = 0.3;
    w_ready = 0.2;
    w_stand = 0;
  }

  // 距离修正——目标越远越倾向于伸出
  if (distRatio > 0.7) {
    const far = (distRatio - 0.7) / 0.3; // 0~1
    w_reach += far * 0.3;
    w_lunge += far * 0.2;
    w_ready -= far * 0.3;
    w_stand -= far * 0.2;
  }

  // 高度修正——目标越高越倾向站直/蓄力
  if (heightRatio > 0.6) {
    const high = (heightRatio - 0.6) / 0.4;
    w_stand += high * 0.2;
    w_ready += high * 0.1;
    w_lunge -= high * 0.2;
    w_reach -= high * 0.1;
  }

  // 归一化
  const total = Math.max(w_stand, 0) + Math.max(w_ready, 0) + Math.max(w_lunge, 0) + Math.max(w_reach, 0);
  if (total < 0.01) return;
  w_stand = Math.max(w_stand, 0) / total;
  w_ready = Math.max(w_ready, 0) / total;
  w_lunge = Math.max(w_lunge, 0) / total;
  w_reach = Math.max(w_reach, 0) / total;

  // 加权混合得到目标 j2, j3
  const targetJ2 = w_stand * POSE_STAND.j2 + w_ready * POSE_READY.j2 + w_lunge * POSE_LUNGE.j2 + w_reach * POSE_REACH.j2;
  const targetJ3 = w_stand * POSE_STAND.j3 + w_ready * POSE_READY.j3 + w_lunge * POSE_LUNGE.j3 + w_reach * POSE_REACH.j3;

  // 平滑过渡——用lerp让变化不跳变
  const blendSpeed = attVal > att.lungeAt ? dt * 6 : dt * 3;
  jc.j2 = THREE.MathUtils.lerp(jc.j2, targetJ2, blendSpeed);
  jc.j3 = THREE.MathUtils.lerp(jc.j3, targetJ3, blendSpeed);

  // 安全地板保护——绝不让夹爪低于地板
  const tipY = arm.getShoulderPos().y + Math.sin(jc.j2) * arm.upperArmLength * sc;
  if (tipY < 0.15 && jc.j2 > 0.8) {
    jc.j2 = THREE.MathUtils.lerp(jc.j2, 0.3, dt * 4);
  }
}

// ============================================================
// 注意力——猎手嗅觉
// ============================================================
const att = {
  value: 0, alertAt: 0.12, pursueAt: 0.25, lungeAt: 0.45,
  aggression: 0.7 + Math.random() * 0.2,
  patience: 0.2 + Math.random() * 0.2,
  sneakiness: 0.4 + Math.random() * 0.4,
  impulseCD: 800 + Math.random() * 2000, impulseTimer: 0,
  pursueTime: 0, fatigueLimit: 4 + Math.random() * 3,
  isFatigued: false, retractTime: 0, coilTime: 0,
  coilReady: false, coilTarget: null, lungeTimer: 0,
};

function resetAtt() {
  att.value = 0; att.pursueTime = 0; att.isFatigued = false; att.retractTime = 0;
  att.fatigueLimit = 4 + Math.random() * 3;
  att.coilTime = 0; att.coilReady = false; att.coilTarget = null; att.lungeTimer = 0;
}

function updateAtt(dt) {
  const shoulder = arm.getShoulderPos();
  const maxReach = (arm.upperArmLength + arm.forearmLength + wristOffset) * sc + 0.5;
  const dist = shoulder.distanceTo(mouseSmooth);
  let delta = 0;

  if (!mouseActive) {
    delta = -2 * dt;
  } else if (dist > maxReach * 2) {
    // 很远——还能闻到
    delta = 0.12 * att.aggression * dt;
  } else if (dist > maxReach * 1.2) {
    const sb = THREE.MathUtils.clamp(mouseSpeed * 3, 0, 1);
    delta = (0.25 + sb * 0.35) * att.aggression * dt;
  } else {
    // 在范围内——全力感知
    const dr = 1 - THREE.MathUtils.clamp(dist / maxReach, 0, 1);
    const sb = THREE.MathUtils.clamp(mouseSpeed * 4, 0, 1);
    delta = (dr * 0.4 + sb * 0.6) * att.aggression * 2.5 * dt;
    if (dist < maxReach * 0.4) delta += 0.7 * dt;
  }

  // 猎手本能——随机冲动
  att.impulseTimer += dt * 1000;
  if (att.impulseTimer > att.impulseCD && att.value < 0.3) {
    att.value += 0.25 + Math.random() * 0.3;
    att.impulseTimer = 0;
    att.impulseCD = 1000 + Math.random() * 2500;
  }

  if (att.sneakiness > 0.3 && att.value < 0.1 && mouseActive) {
    delta += 0.15 * dt;
  }

  att.value = THREE.MathUtils.clamp(att.value + delta, 0, 1);
}

// ============================================================
// 空闲行为
// ============================================================
function genIdle() {
  const r = Math.random();
  if (r < 0.45) {
    return [
      { j1: 0, j2: 0.05, j3: 2.2, j4: 0, j5: 0, j6: 0, grip: 0.8, dur: rand(4, 8) },
      { j1: rand(-0.03, 0.03), j2: 0.03, j3: 2.3, j4: 0, j5: 0.02, j6: 0, grip: 0.75, dur: rand(3, 6) },
    ];
  } else if (r < 0.7) {
    return [
      { j1: 0, j2: 0.1, j3: 1.8, j4: 0, j5: 0, j6: 0, grip: 0.6, dur: 2 },
      { j1: rand(-0.3, 0.3), j2: 0.4, j3: 1.0, j4: 0.1, j5: 0.1, j6: 0, grip: 0.3, dur: 2.5 },
      { j1: 0, j2: 0.1, j3: 2.0, j4: 0, j5: 0, j6: 0, grip: 0.65, dur: 2 },
    ];
  } else if (r < 0.88) {
    return [
      { j1: 0, j2: 0.8, j3: 0.3, j4: 0, j5: 0.2, j6: 0.1, grip: 0.1, dur: 1.5 },
      { j1: rand(-0.2, 0.2), j2: 0.5, j3: 0.8, j4: 0, j5: -0.1, j6: 0, grip: 0.2, dur: 1.2 },
      { j1: 0, j2: 0.1, j3: 2.0, j4: 0, j5: 0, j6: 0, grip: 0.6, dur: 1.5 },
    ];
  } else {
    return [
      { j1: -0.4, j2: 0.2, j3: 1.5, j4: -0.1, j5: 0.05, j6: 0, grip: 0.4, dur: 0.8 },
      { j1: 0.4, j2: 0.2, j3: 1.5, j4: 0.1, j5: -0.05, j6: 0, grip: 0.4, dur: 0.8 },
      { j1: 0, j2: 0.1, j3: 2.0, j4: 0, j5: 0, j6: 0, grip: 0.6, dur: 1.5 },
    ];
  }
}

let idle = { kf: genIdle(), idx: 0, t: 0 };

function updateIdle(jc, dt, weight) {
  if (idle.idx >= idle.kf.length) { idle.kf = genIdle(); idle.idx = 0; idle.t = 0; }
  const kf = idle.kf[idle.idx];
  idle.t += dt / kf.dur;
  if (idle.t >= 1) { idle.idx++; idle.t = 0; return; }
  const t = easeIO(Math.min(idle.t, 1));
  const spd = weight * 0.1;
  for (const k of ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'grip']) {
    // j1使用lerpAngle
    if (k === 'j1') {
      jc[k] = lerpAngle(jc[k], kf[k], spd * (0.3 + t * 0.7));
    } else {
      jc[k] = THREE.MathUtils.lerp(jc[k], kf[k], spd * (0.3 + t * 0.7));
    }
  }
}

// ============================================================
// 行为层
// ============================================================
const COIL_POSE = { j1: 0, j2: -0.05, j3: 2.5, j4: 0, j5: 0, j6: 0, grip: 0.9 };

// ============================================================
// 防穿地板
// ============================================================
const FLOOR_Y = 0.08;

function maxSafePitch(elbowPitch) {
  const sy = arm.getShoulderPos().y;
  const L1 = arm.upperArmLength * sc;
  const L2ext = (arm.forearmLength + wristOffset) * sc;
  const A = L1 + L2ext * Math.cos(elbowPitch);
  const B = L2ext * Math.sin(elbowPitch);
  const R = Math.sqrt(A * A + B * B);
  const phi = Math.atan2(B, A);
  const rhs = (FLOOR_Y - sy) / R;
  const angleLimit = Math.acos(THREE.MathUtils.clamp(rhs, -1, 1)) - phi;
  return THREE.MathUtils.clamp(angleLimit, -Math.PI / 2, Math.PI);
}

function lerpAngle(current, target, t) {
  let diff = target - current;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return current + diff * t;
}

function applyIKToJC(jc, shoulder, target, speed) {
  const r = ik.solve(shoulder, target);
  if (!r) return;

  const clampedElbow = THREE.MathUtils.clamp(r.elbowPitch, 0.05, Math.PI - 0.05);
  // shoulderPitch不再强制-0.2到pitchLimit，而是直接使用解算出的pitch，通过maxSafePitch进行地面约束
  const pitchLimit = maxSafePitch(clampedElbow);
  const clampedPitch = THREE.MathUtils.clamp(r.shoulderPitch, -Math.PI / 2, pitchLimit); // 允许肩部更大幅度俯仰

  jc.j1 = lerpAngle(jc.j1, r.shoulderYaw, speed);
  jc.j2 = THREE.MathUtils.lerp(jc.j2, clampedPitch, speed);
  jc.j3 = THREE.MathUtils.lerp(jc.j3, clampedElbow, speed);

  // 手腕追踪
  const forearmEnd = new THREE.Vector3();
  arm.joints.j4.getWorldPosition(forearmEnd);
  const toTarget = new THREE.Vector3().subVectors(target, forearmEnd);
  const j3QuatInv = arm.joints.j3.getWorldQuaternion(new THREE.Quaternion()).invert();
  toTarget.applyQuaternion(j3QuatInv);

  const wYaw = Math.atan2(toTarget.x, toTarget.y);
  const wPitch = -Math.atan2(toTarget.z, Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y));

  const wristSpeed = Math.min(speed * 0.4, 0.12);
  jc.j4 = lerpAngle(jc.j4, wYaw, wristSpeed);
  jc.j5 = lerpAngle(jc.j5, wPitch, wristSpeed);
  jc.j5 = THREE.MathUtils.clamp(jc.j5, -1.5, 1.5); // 更大范围的手腕俯仰
}

function safeTarget(shoulder, raw) {
  const target = raw.clone();
  target.y = Math.max(target.y, 0.15); // 仍然保持一定高度防穿地
  const maxReach = (arm.upperArmLength + arm.forearmLength + wristOffset) * sc * 0.92;
  const dir = new THREE.Vector3().subVectors(target, shoulder);
  const dist = dir.length();
  if (dist > maxReach) {
    dir.normalize().multiplyScalar(maxReach);
    target.copy(shoulder).add(dir);
  }
  return target;
}

function runBehavior(jc, dt) {
  const shoulder = arm.getShoulderPos();
  const target = safeTarget(shoulder, mouseSmooth);

  // 蓄力弹出
  if (att.coilReady) {
    att.lungeTimer += dt;
    applyIKToJC(jc, shoulder, att.coilTarget || target, 0.35);
    jc.grip = THREE.MathUtils.lerp(jc.grip, 0.02, dt * 6);
    jc.j6 += (Math.random() - 0.5) * 0.015;
    if (att.lungeTimer > 1.5) { resetAtt(); att.value = 0.1; }
    return;
  }

  // 蓄力中
  if (att.isFatigued && att.retractTime > 0.5 && att.coilTime < 1.5) {
    att.coilTime += dt;
    for (const k of ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'grip']) {
      if (k === 'j1' || k === 'j4' || k === 'j5') {
        jc[k] = lerpAngle(jc[k], COIL_POSE[k], dt * 3);
      } else {
        jc[k] = THREE.MathUtils.lerp(jc[k], COIL_POSE[k], dt * 3);
      }
    }
    const dir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
    jc.j1 = lerpAngle(jc.j1, dir * 0.3, dt * 0.5);
    if (att.coilTime >= 1.0 + Math.random() * 0.5) {
      att.coilReady = true;
      att.coilTarget = target.clone();
      att.lungeTimer = 0;
    }
    return;
  }

  // 疲劳收回
  if (att.isFatigued) {
    att.retractTime += dt;
    for (const k of ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'grip']) {
      if (k === 'j1' || k === 'j4' || k === 'j5') {
        jc[k] = lerpAngle(jc[k], COIL_POSE[k], dt * 2.5);
      } else {
        jc[k] = THREE.MathUtils.lerp(jc[k], COIL_POSE[k], dt * 2.5);
      }
    }
    const dir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
    jc.j1 = lerpAngle(jc.j1, dir * 0.5, dt);
    return;
  }

  // 潜伏——只有头（j1）在转，身体交给权重层
  if (att.value < att.alertAt) {
    const dir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
    jc.j1 = lerpAngle(jc.j1, dir * 0.15, dt * 0.5);
    jc.grip = THREE.MathUtils.lerp(jc.grip, 0.7, dt * 0.5);
    return;
  }

  // 关注——头追踪，grip收紧，身体交给权重层
  if (att.value < att.pursueAt) {
    const bl = (att.value - att.alertAt) / (att.pursueAt - att.alertAt);
    const dir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
    jc.j1 = lerpAngle(jc.j1, dir, bl * dt * 3);
    jc.grip = THREE.MathUtils.lerp(jc.grip, 0.25, bl * dt);
    return;
  }

  // 追击——j1追踪目标方向，grip收紧，身体交给权重层
  if (att.value < att.lungeAt) {
    att.pursueTime += dt;
    const dir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
    const bl = (att.value - att.pursueAt) / (att.lungeAt - att.pursueAt);
    jc.j1 = lerpAngle(jc.j1, dir, THREE.MathUtils.lerp(0.04, 0.10, bl));
    jc.grip = THREE.MathUtils.lerp(jc.grip, 0.05, dt * 2);
    jc.j6 += (Math.random() - 0.5) * 0.006 * bl;
    if (att.pursueTime > att.fatigueLimit) {
      att.isFatigued = true; att.retractTime = 0; att.coilTime = 0; att.coilReady = false;
    }
    return;
  }

  // 冲刺——j1猛转，grip极紧，身体交给权重层
  att.pursueTime += dt;
  const sprintDir = Math.atan2(target.x - shoulder.x, target.z - shoulder.z);
  jc.j1 = lerpAngle(jc.j1, sprintDir, 0.35);
  jc.grip = THREE.MathUtils.lerp(jc.grip, 0.02, dt * 5);
  jc.j6 += (Math.random() - 0.5) * 0.012;
  if (att.pursueTime > att.fatigueLimit) {
    att.isFatigued = true; att.retractTime = 0; att.coilTime = 0; att.coilReady = false;
  }
}

// ============================================================
// 底座升降——根据目标高度动态调整
// ============================================================
function updateBaseLift(dt) {
  // 目标越高，底座升得越高——像人踮脚、跳跃
  const targetLiftRatio = THREE.MathUtils.clamp(
    (mouseSmooth.y - 0.5) / 2.5, 0, 1
  );
  let targetY = BASE_REST_Y + targetLiftRatio * BASE_MAX_LIFT;

  // 硬限位——确保活塞不穿帮
  targetY = THREE.MathUtils.clamp(targetY, LIFT_MIN_Y, LIFT_MAX_Y);

  // 平滑过渡，但冲刺时可以更快
  const liftSpeed = att.value > att.lungeAt ? 3.0 : 1.5;
  arm.liftGroup.position.y = THREE.MathUtils.lerp(arm.liftGroup.position.y, targetY, dt * liftSpeed);
}

// ============================================================
// 抓取状态机
// hunt → snap → carry → release → fall → vanish → hunt
// ============================================================
let grab = { phase: 'hunt', timer: 0, lastEnd: -99999, snapTarget: null };
let fallVel = new THREE.Vector3();
let fallPos = new THREE.Vector3();
const COOLDOWN = 2500;
const DROP_DURATION = 0.5; // 垂直坠落时长
const VANISH_PAUSE = 2.0; // 鼠标消失后的等待时长

const jc = { j1: 0, j2: 0.1, j3: 2.0, j4: 0, j5: 0, j6: 0, grip: 0.7 };

// ============================================================
// 主循环
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime() * 1000;

  updateMouseWorld(dt);
  updateBaseLift(dt);

  switch (grab.phase) {
    case 'hunt': {
      updateAtt(dt);
      runBehavior(jc, dt);

      // 条件满足：出其不意地出击
      if (att.value > att.lungeAt && (elapsed - grab.lastEnd) > COOLDOWN) {
        const tip = arm.getGripperTip();
        if (tip.distanceTo(mouseSmooth) < 0.5) {
          grab.phase = 'snap';
          grab.timer = 0;
          grab.snapTarget = mouseWorld.clone();
          break;
        }
      }
      if (att.value < 0.05) { idle.kf = genIdle(); idle.idx = 0; idle.t = 0; }
      break;
    }

    case 'snap': {
      grab.timer += dt;
      const snapDuration = 0.15;
      const t = Math.min(grab.timer / snapDuration, 1);

      const shoulder = arm.getShoulderPos();
      const safeSnap = safeTarget(shoulder, grab.snapTarget);
      const r = ik.solve(shoulder, safeSnap);
      if (r) {
        const snapSpeed = 0.6;
        const clampedElbow = THREE.MathUtils.clamp(r.elbowPitch, 0.05, Math.PI - 0.05);
        const pitchLimit = maxSafePitch(clampedElbow);
        const clampedPitch = THREE.MathUtils.clamp(r.shoulderPitch, -Math.PI / 2, pitchLimit);
        jc.j1 = lerpAngle(jc.j1, r.shoulderYaw, snapSpeed);
        jc.j2 = THREE.MathUtils.lerp(jc.j2, clampedPitch, snapSpeed);
        jc.j3 = THREE.MathUtils.lerp(jc.j3, clampedElbow, snapSpeed);

        const forearmEnd = new THREE.Vector3();
        arm.joints.j4.getWorldPosition(forearmEnd);
        const toTarget = new THREE.Vector3().subVectors(grab.snapTarget, forearmEnd);
        const j3QInv = arm.joints.j3.getWorldQuaternion(new THREE.Quaternion()).invert();
        toTarget.applyQuaternion(j3QInv);
        const wYaw = Math.atan2(toTarget.x, toTarget.y);
        const wPitch = -Math.atan2(toTarget.z, Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y));
        jc.j4 = lerpAngle(jc.j4, wYaw, snapSpeed * 0.4);
        jc.j5 = lerpAngle(jc.j5, wPitch, snapSpeed * 0.4);
        jc.j5 = THREE.MathUtils.clamp(jc.j5, -1.5, 1.5);
      }
      jc.grip = THREE.MathUtils.lerp(0.05, 1.0, easeIO(t));
      if (t < 0.8) jc.j6 += (Math.random() - 0.5) * 0.02 * (1 - t);

      if (t >= 1) {
        grab.phase = 'carry';
        grab.timer = 0;
        document.body.style.cursor = 'none';
        fakeCursor.show(arm.getGripperCenter());
        att.value = 1;
        resetAtt();
      }
      break;
    }

    case 'carry': {
      grab.timer += dt;
      const shoulder = arm.getShoulderPos();
      const carryTarget = safeTarget(shoulder, mouseSmooth);
      const r = ik.solve(shoulder, carryTarget);
      if (r) {
        const clampedElbow = THREE.MathUtils.clamp(r.elbowPitch, 0.05, Math.PI - 0.05);
        const pitchLimit = maxSafePitch(clampedElbow);
        const clampedPitch = THREE.MathUtils.clamp(r.shoulderPitch, -Math.PI / 2, pitchLimit);
        jc.j1 = lerpAngle(jc.j1, r.shoulderYaw, 0.25);
        jc.j2 = THREE.MathUtils.lerp(jc.j2, clampedPitch, 0.25);
        jc.j3 = THREE.MathUtils.lerp(jc.j3, clampedElbow, 0.25);

        const forearmEnd = new THREE.Vector3();
        arm.joints.j4.getWorldPosition(forearmEnd);
        const toTarget = new THREE.Vector3().subVectors(carryTarget, forearmEnd);
        const j3QInv = arm.joints.j3.getWorldQuaternion(new THREE.Quaternion()).invert();
        toTarget.applyQuaternion(j3QInv);
        const wYaw = Math.atan2(toTarget.x, toTarget.y);
        const wPitch = -Math.atan2(toTarget.z, Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y));
        jc.j4 = lerpAngle(jc.j4, wYaw, 0.1);
        jc.j5 = lerpAngle(jc.j5, wPitch, 0.1);
        jc.j5 = THREE.MathUtils.clamp(jc.j5, -1.5, 1.5);
      }
      jc.grip = THREE.MathUtils.lerp(jc.grip, 1, dt * 10);
      const gripperCenter = arm.getGripperCenter();
      fakeCursor.set(gripperCenter);
      jc.j6 = Math.sin(grab.timer * 5) * 0.03;

      if (grab.timer > 1.5 + Math.random() * 1.0) {
        grab.phase = 'release';
        grab.timer = 0;
        fallPos.copy(gripperCenter);
        fallVel.set(0, 0, 0); // 垂直坠落，不弹飞
        jc.grip = 0;
      }
      break;
    }

    case 'release': {
      grab.timer += dt;
      // 垂直坠落，不缩小
      fallVel.y -= 9.8 * dt;
      fallPos.addScaledVector(fallVel, dt);
      if (fallPos.y < 0.03) {
        fallPos.y = 0.03;
        fallVel.set(0, 0, 0); // 停止弹跳
      }
      fakeCursor.set(fallPos);

      att.value = THREE.MathUtils.lerp(att.value, 0.15, dt * 2);
      updateIdle(jc, dt, Math.max(0, 1 - grab.timer));

      if (grab.timer > DROP_DURATION) { // 坠落时长结束
        grab.phase = 'vanish';
        grab.timer = 0;
      }
      break;
    }

    case 'vanish': {
      grab.timer += dt;
      // 等待1秒
      att.value = THREE.MathUtils.lerp(att.value, 0, dt);
      updateIdle(jc, dt, 1);
      document.body.style.cursor = 'none';

      if (grab.timer > VANISH_PAUSE) { // 等待时长结束
        document.body.style.cursor = 'default';
        grab.lastEnd = elapsed;
        grab.phase = 'hunt';
        att.value = 0;
        att.impulseTimer = 0;
        att.impulseCD = 800 + Math.random() * 2000;
        resetAtt();
        idle.kf = genIdle(); idle.idx = 0; idle.t = 0;
      }
      break;
    }
  }

  applyPoseWeights(jc, dt);
  applyJoints(jc);

  // 工厂动画——传送带滚轮转动 + 皮带纹理滚动
  const rollerSpeed = 3 * dt;
  for (const roller of conveyorRollers) {
    roller.rotation.x += rollerSpeed;
  }
  beltTex.offset.y -= dt * 0.5;

  // 传送带货物移动
  for (let i = conveyorBoxes.length - 1; i >= 0; i--) {
    const b = conveyorBoxes[i];
    b.mesh.position.z += b.speed * dt;
    if (b.mesh.position.z > CONV_Z_END) {
      scene.remove(b.mesh);
      conveyorBoxes.splice(i, 1);
    }
  }
  if (Math.random() < dt * 0.5) {
    spawnConveyorBox();
  }

  // 天车缓慢移动
  crane.position.z += 0.3 * dt * Math.sin(elapsed * 0.0003);

  // 工厂氛围动画
  const pulse = Math.sin(elapsed * 0.002);
  warnLight.intensity = 0.6 + pulse * 0.3;
  baseGlow.material.opacity = 0.08 + pulse * 0.04;

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

applyJoints(jc);
animate();