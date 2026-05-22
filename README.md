# Robot Arm — 3D Industrial Arm with Cursor Tracking

A Three.js industrial robot arm that tracks your mouse cursor like a chained wolfhound — smooth, aggressive, and alive.

**Live Demo:** `npm run dev` → http://localhost:5173

## What It Does

- **360° cursor tracking** — the arm follows your mouse in real-time across the entire hemisphere
- **Predatory behavior system** — attention-based state machine (lurk → alert → stalk → lunge → snap → carry → release)
- **Pose weight middleware** — continuous weighted blending between pose anchors (stand/ready/lunge/reach) instead of hard state transitions. No jerky jumps, naturally smooth.
- **Factory scene** — conveyor belt with moving cargo boxes, overhead crane, industrial atmosphere

## Architecture Highlights

### Weight Thinking — Pose Middleware Layer

The core innovation: instead of a discrete state machine driving pose transitions, we insert a **continuous weight layer** between the behavior system and the joint controller.

```
Attention + Distance + Height (drivers)
         ↓
  4 Pose Anchors × Weights (0~1 continuous)
         ↓
  Weighted Average → Target joint values (j2, j3)
         ↓
  Lerp smoothing → Final pose
```

This means the arm can be "30% standing, 70% ready" — naturally smooth transitions without any easing code. See [Weight Thinking skill](https://github.com/) for the general methodology.

### File Structure

```
src/
├── main.js        — Scene, behavior system, pose weight middleware, main loop
├── RobotArm.js    — Robot arm 3D model (joints, links, gripper, hydraulic lift)
├── IKSolver.js    — 2-link IK solver with floor avoidance
└── FakeCursor.js  — Custom cursor that hides during grab sequences
```

## Tech Stack

- **Three.js** — 3D rendering
- **Vite** — dev server + bundler
- Zero frameworks, zero dependencies beyond Three.js

## Run

```bash
npm install
npm run dev
```

## License

MIT
