import * as THREE from 'three';

/**
 * 逼真的小箭头光标——跟系统光标一样大
 * 使用 sizeAttenuation=false 保证屏幕上始终是像素级大小
 */
export class FakeCursor {
  constructor(scene) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);

    // 黑色描边
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(1, 1); ctx.lineTo(1, 22); ctx.lineTo(7, 17);
    ctx.lineTo(12, 26); ctx.lineTo(15, 25); ctx.lineTo(10, 16);
    ctx.lineTo(17, 16); ctx.closePath();
    ctx.stroke();

    // 白色填充
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(2, 2); ctx.lineTo(2, 20); ctx.lineTo(7, 16);
    ctx.lineTo(12, 25); ctx.lineTo(14, 24.5); ctx.lineTo(9, 15.5);
    ctx.lineTo(16, 15.5); ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false, // 关键：屏幕上固定像素大小
    });

    this.sprite = new THREE.Sprite(mat);
    // sizeAttenuation=false 时 scale 单位是像素除以屏幕高度
    // 0.03 ≈ 一个正常鼠标箭头大小
    this.sprite.scale.set(0.03, 0.03, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 999;
    scene.add(this.sprite);
  }

  show(p) { this.sprite.visible = true; this.sprite.position.copy(p); }
  set(p) { this.sprite.position.copy(p); }
  hide() { this.sprite.visible = false; }
}
