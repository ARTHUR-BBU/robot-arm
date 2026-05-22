import * as THREE from 'three';

/**
 * 两段式逆运动学求解器
 * 
 * 约定：手臂默认朝 +Y（竖直），j2.rotation.x > 0 使手臂朝 +Z 倾斜（向前/朝相机）
 * 
 * 解算目标：让夹爪咬合中心到达 targetWorld
 * L1 = 上臂, L2 = 前臂, wristOffset = 手腕+夹爪总长度
 */
export class IKSolver {
  constructor(L1, L2, wristOffset = 0) {
    this.L1 = L1;
    this.L2 = L2;
    this.wristOffset = wristOffset;
  }

  solve(shoulderWorld, targetWorld) {
    const dx = targetWorld.x - shoulderWorld.x;
    const dy = targetWorld.y - shoulderWorld.y;
    const dz = targetWorld.z - shoulderWorld.z;

    const yaw = Math.atan2(dx, dz);

    const r = Math.sqrt(dx * dx + dz * dz);
    const d3d = Math.sqrt(r * r + dy * dy);

    const { L1, L2, wristOffset } = this;

    // 扣除手腕+夹爪长度
    let effectiveDist = d3d - wristOffset;
    if (effectiveDist < 0.01) effectiveDist = 0.01;

    const maxReach = L1 + L2 - 0.01;
    const minReach = Math.abs(L1 - L2) + 0.01;

    // 超出范围：朝目标方向伸直
    if (effectiveDist >= maxReach) {
      const pitch = Math.atan2(r, dy);
      return {
        shoulderPitch: pitch,
        shoulderYaw: yaw,
        elbowPitch: 0.05,
      };
    }

    const dd = THREE.MathUtils.clamp(effectiveDist, minReach, maxReach);
    const ratio = dd / Math.max(d3d, 0.01);
    const effR = r * ratio;
    const effH = dy * ratio;

    const cosElbow = (L1 * L1 + L2 * L2 - dd * dd) / (2 * L1 * L2);
    const elbow = Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));

    const elevation = Math.atan2(effR, effH);
    const cosAlpha = (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd);
    const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));
    const pitch = elevation + alpha;

    return {
      shoulderPitch: pitch,
      shoulderYaw: yaw,
      elbowPitch: elbow,
    };
  }
}
