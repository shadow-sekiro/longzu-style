// 从 WE 粒子预设（rainperspective / ember / fog2）移植的粒子系统。
// 在 NDC 空间（x,y ∈ [-1,1]，y 向上）中模拟，由 CPU 每帧更新。
import * as THREE from 'three';

function makeSoftCircle(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

let SOFT: THREE.Texture | null = null;
function soft() {
  if (!SOFT) SOFT = makeSoftCircle();
  return SOFT;
}

type System = { obj: THREE.Object3D; update: (dt: number, t: number) => void };

function createRain(count = 300): System {
  const positions = new Float32Array(count * 2 * 3);
  const drops = Array.from({ length: count }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    len: 0.012 + Math.random() * 0.03,
    speed: 0.28 + Math.random() * 0.55,
  }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.5, 0.62, 0.82),
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  const obj = new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  const update = (dt: number) => {
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.speed * dt;
      if (d.y < -1.15) {
        d.y = 1.15;
        d.x = Math.random() * 2 - 1;
      }
      const o = i * 6;
      positions[o] = d.x;
      positions[o + 1] = d.y;
      positions[o + 2] = 0;
      positions[o + 3] = d.x;
      positions[o + 4] = d.y - d.len;
      positions[o + 5] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { obj, update };
}

function createEmber(count = 70): System {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const data = Array.from({ length: count }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    vy: 0.04 + Math.random() * 0.12,
    vx: (Math.random() - 0.5) * 0.03,
    seed: Math.random() * 100,
    // 橙→金 随机色相
    warm: Math.random(),
  }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 7,
    map: soft(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    sizeAttenuation: false,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  const update = (_dt: number, t: number) => {
    for (let i = 0; i < count; i++) {
      const d = data[i];
      d.y += d.vy * 0.016;
      d.x += d.vx * 0.016 + Math.sin(t * 0.7 + d.seed) * 0.0006;
      if (d.y > 1.15) {
        d.y = -1.15;
        d.x = Math.random() * 2 - 1;
      }
      const flick = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.3 + d.seed));
      const r = 1.0;
      const g = 0.42 + d.warm * 0.35;
      const b = 0.08 + d.warm * 0.12;
      const o = i * 3;
      positions[o] = d.x;
      positions[o + 1] = d.y;
      positions[o + 2] = 0;
      colors[o] = r * flick;
      colors[o + 1] = g * flick;
      colors[o + 2] = b * flick;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { obj, update };
}

// 红色发光拖尾：复刻原 wallpaper spritetrail（火花拖尾）+ 湍流
// 视觉：每根「火花」是一段从车尾向斜下方喷出、随时间消散的线段，
// 浓烈橙红+闪烁。用 LineSegments（每粒子 2 个顶点 = 1 条线），
// 加性混合 + 顶点色衰减模拟火光头部亮、尾部暗。
function createCarGlow(
  center: [number, number],
  color: [number, number, number],
  count = 24,
  spread = 0.04,
  life = 1.0,
  rise = 0.35,
  angle = -1.2, // 拖尾方向（弧度），默认向左下方喷
): System {
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const data = Array.from({ length: count }, () => ({
    ox: center[0] + (Math.random() * 2 - 1) * spread,
    oz: center[1] + (Math.random() * 2 - 1) * spread,
    len: 0.05 + Math.random() * 0.10,
    phase: Math.random() * 100,
    jitter: (Math.random() * 2 - 1) * 0.3,
    flickerSpeed: 2.5 + Math.random() * 2.0,
  }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  const obj = new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  const update = (_dt: number, t: number) => {
    for (let i = 0; i < count; i++) {
      const d = data[i];
      // 0..1 生命周期
      const life01 = ((t * 0.6 + d.phase * 0.013) % life) / life;
      const distance = life01 * rise;
      const sway = Math.sin(t * d.jitter * 6 + d.phase) * 0.012;
      // 头部在中心+方向*distance；尾部在头部 - 方向*len
      const headX = d.ox + dirX * distance + sway;
      const headY = d.oz + dirY * distance;
      const tailX = headX - dirX * d.len;
      const tailY = headY - dirY * d.len;
      const headA = 1.0 - life01;
      const flick = 0.55 + 0.45 * Math.abs(Math.sin(t * d.flickerSpeed + d.phase));
      const aH = headA * flick;
      const aT = headA * 0.15 * flick;
      const o = i * 6;
      positions[o] = headX; positions[o + 1] = headY; positions[o + 2] = 0;
      positions[o + 3] = tailX; positions[o + 4] = tailY; positions[o + 5] = 0;
      colors[o] = color[0] * aH;
      colors[o + 1] = color[1] * aH;
      colors[o + 2] = color[2] * aH;
      colors[o + 3] = color[0] * aT;
      colors[o + 4] = color[1] * aT;
      colors[o + 5] = color[2] * aT;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { obj, update };
}

// 程序化闪电：复刻原壁纸「Lightning cloud」(colorn 0.878 1 0 黄绿闪电，
// 原在场景 3710,1099)，贴图 particle/lightning/* 不在包内，故用加性发光点串
// 生成锯齿状闪电，间歇闪烁。
function createLightning(
  center: [number, number],
  color: [number, number, number] = [0.75, 1.0, 0.35],
  span = 0.34,
  segs = 22,
): System {
  const positions = new Float32Array(segs * 3);
  const colors = new Float32Array(segs * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 11,
    map: soft(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    sizeAttenuation: false,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;

  let timer = 1 + Math.random() * 3;
  let flash = 0;
  let path: number[] = [];

  const genPath = () => {
    path = [];
    for (let i = 0; i < segs; i++) {
      const f = i / (segs - 1);
      const y = center[1] + span - f * span * 2;
      const jitter = i === 0 || i === segs - 1 ? 0 : (Math.random() * 2 - 1) * 0.06;
      const x = center[0] + jitter + Math.sin(f * 6.283 + Math.random()) * 0.015;
      path.push(x, y);
    }
  };

  const update = (dt: number) => {
    if (flash > 0) {
      flash -= dt;
      const flick = (Math.sin(flash * 55) * 0.5 + 0.5) * Math.min(1, flash * 6);
      for (let i = 0; i < segs; i++) {
        const o = i * 3;
        positions[o] = path[i * 2];
        positions[o + 1] = path[i * 2 + 1];
        positions[o + 2] = 0;
        const edge = Math.sin((i / (segs - 1)) * Math.PI); // 中段更亮
        colors[o] = color[0] * flick * edge;
        colors[o + 1] = color[1] * flick * edge;
        colors[o + 2] = color[2] * flick * edge;
      }
    } else {
      for (let i = 0; i < segs * 3; i++) colors[i] = 0;
      timer -= dt;
      if (timer <= 0) {
        genPath();
        flash = 0.16 + Math.random() * 0.12;
        timer = 2.5 + Math.random() * 3.5;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { obj, update };
}

export function createParticles(): {
  objects: THREE.Object3D[];
  update: (dt: number, t: number) => void;
} {
  const rain = createRain();
  const ember = createEmber();
  // 红色拖尾位置依据原 wallpaper scene.pkg 中 Ember / Discharge 发射器坐标
  // (bg.jpg 现在 4296×2338 与原 wallpaper 画布一致)，原 colorn 颜色忠实还原，
  // count/长度 调低以贴近原 wallpaper 微弱的视觉效果：
  //   Ember(885.7,731.9)       → NDC (-0.588, 0.374)  colorn (1, 0.192, 0)
  //   Discharge(2890.5,2245.1) → NDC (0.346, -0.92)  colorn (1, 0.608, 0)
  const emberRed = createCarGlow([-0.588, 0.374], [1.0, 0.192, 0.0], 14, 0.02, 1.2, 0.15, -1.5);
  const dischargeRed = createCarGlow([0.346, -0.92], [1.0, 0.608, 0.0], 10, 0.03, 1.4, 0.18, 1.5);
  const lightning = createLightning([0.727, 0.059], [0.75, 1.0, 0.35], 0.34, 22);
  const systems = [rain, ember, emberRed, dischargeRed, lightning];
  return {
    objects: systems.map((s) => s.obj),
    update: (dt, t) => systems.forEach((s) => s.update(dt, t)),
  };
}
