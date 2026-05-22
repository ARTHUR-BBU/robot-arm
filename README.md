# Robot Arm · 拴住的狼狗 🐺⛓️

[中文](#中文) | [English](#english)

---

## English

An industrial robot arm that tracks your mouse cursor like a chained wolfhound — aggressive, smooth, and alive. Built with Three.js.

**Try it:**

```bash
git clone https://github.com/ARTHUR-BBU/robot-arm.git
cd robot-arm
npm install
npm run dev
# Open http://localhost:5173 in your browser
```

### How to Play

Move your mouse around the page. The robot arm will:

1. **Notice you** — head turns toward the cursor, body still calm
2. **Get interested** — starts bending toward you, grip tightening
3. **Stalk** — slowly closes in like a cat
4. **Lunge** — sudden explosive snap at the cursor
5. **Grab** — snatches the cursor, carries it around
6. **Release** — drops it, waits for you to move again

The arm has limited reach — like a wolfhound on a chain. It can lunge out fast but always snaps back. Try moving the mouse far away to see it stretch to its limit.

### Core Innovation: Pose Weight Middleware

Instead of hard-switching between poses (stand → crouch → lunge), we use **continuous weighted blending**:

```
Attention + Distance + Height (drivers)
         ↓
  4 Pose Anchors × Weights (0~1 continuous)
         ↓
  Weighted Average → Target joint values
         ↓
  Lerp → Final smooth pose
```

The arm can be "30% standing + 70% ready" — smooth transitions happen naturally, no easing code needed.

| Anchor | Shoulder (j2) | Elbow (j3) | Meaning |
|--------|--------------|-----------|---------|
| STAND | 0.0 | 0.05 | Upright |
| READY | 0.4 | 1.2 | Coiled |
| LUNGE | 0.9 | 0.35 | Striking |
| REACH | 1.2 | 0.15 | Max extension |

### File Structure

```
src/
├── main.js        — Scene, behavior system, pose weight middleware, main loop
├── RobotArm.js    — Robot arm 3D model (joints, links, gripper, hydraulic lift)
├── IKSolver.js    — 2-link IK solver with floor avoidance
└── FakeCursor.js  — Custom cursor hidden during grab sequences
```

### Tech Stack

- Three.js (3D rendering)
- Vite (dev server)
- Zero other dependencies

---

## 中文

一只Three.js工业机械臂，像被链子拴住的狼狗一样追踪你的鼠标——凶猛、顺滑、充满攻击性。

**试一下：**

```bash
git clone https://github.com/ARTHUR-BBU/robot-arm.git
cd robot-arm
npm install
npm run dev
# 浏览器打开 http://localhost:5173
```

### 怎么玩

在页面上移动鼠标，机械臂会：

1. **发现你** — 头转向光标方向，身体还没动
2. **产生兴趣** — 身体开始压低，夹爪微微收紧
3. **悄悄靠近** — 像猫科动物一样慢慢逼近
4. **猛扑** — 突然爆发出击，抓向光标
5. **叼住** — 一把抓住光标，带着它移动
6. **松口** — 把光标扔掉，等你再动

机械臂的臂长有限——就像链子拴住的狼狗。它能猛扑出去，但总会被拉回来。试试把鼠标移到很远的地方，看它伸到极限的样子。

### 核心创新：姿态权重中间层

传统做法：站着 → 硬切 → 弯腰 → 硬切 → 前扑。每次跳变生硬，需要写一堆缓动。

我们的做法：**连续权重混合**——

```
注意力 + 距离 + 高度（驱动源）
          ↓
  4个姿态锚点 × 权重（0~1 连续值）
          ↓
  加权平均 → 目标关节值
          ↓
  lerp 平滑 → 最终姿态
```

机械臂可以同时是"30%站立 + 70%蓄力"——平滑过渡自然发生，不需要任何缓动代码。

| 锚点 | 肩俯仰 (j2) | 肘弯曲 (j3) | 含义 |
|------|------------|------------|------|
| STAND | 0.0 | 0.05 | 竖直站立 |
| READY | 0.4 | 1.2 | 半弯蓄力 |
| LUNGE | 0.9 | 0.35 | 前扑 |
| REACH | 1.2 | 0.15 | 极限伸直 |

### 文件结构

```
src/
├── main.js        — 场景、行为系统、姿态权重中间层、主循环
├── RobotArm.js    — 机械臂3D模型（关节、连杆、夹爪、液压升降）
├── IKSolver.js    — 2连杆IK求解器 + 地板防穿
└── FakeCursor.js  — 自定义光标（抓取时隐藏系统光标）
```

### 技术栈

- Three.js（3D渲染）
- Vite（开发服务器）
- 零其他依赖

---

## License

MIT
