'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import {
  fullscreenVert,
  backgroundFrag,
  waterflowFrag,
  shakeFrag,
  godraysFrag,
} from '@/lib/scene/glsl';
import { createParticles } from '@/lib/scene/particles';

/**
 * 从 Wallpaper Engine「龙族:高速公路上的尼伯龙根」Scene 壁纸逆向移植的
 * three.js 全屏动态背景：背景图 + 粒子层（雨/飞火/雾）经后处理链
 * waterflow 畸变 → nitro 暗金雾 → shake 抖动 → godrays 黄金瞳神光。
 */
export function SceneBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let running = true;
    const disposables: { dispose: () => void }[] = [];

    const dpr = Math.min(window.devicePixelRatio || 1, 1.0);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x05060a, 1);
    disposables.push(renderer);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    // 占位贴图，避免背景未载入时空 sampler
    const placeholder = new THREE.DataTexture(
      new Uint8Array([10, 10, 15, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    placeholder.needsUpdate = true;

    // 全屏背景四边形（cover 适配 + 暗调冷色）
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: backgroundFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBg: { value: placeholder },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uImageSize: { value: new THREE.Vector2(4296, 2338) },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
    quad.frustumCulled = false;
    scene.add(quad);

    // 粒子层（雨 / 飞火 / 雾）
    const particles = createParticles();
    particles.objects.forEach((o) => scene.add(o));

    // 后处理链
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(dpr);
    composer.addPass(new RenderPass(scene, camera));

    const mkPass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new ShaderPass({ uniforms, vertexShader: fullscreenVert, fragmentShader });

    const waterflow = mkPass(waterflowFrag, {
      tDiffuse: { value: null },
      uFlow: { value: null },
      uPhase: { value: null },
      uTime: { value: 0 },
      uSpeed: { value: 0.05 },
      uAmp: { value: 0.4 },
      uPhaseScale: { value: 1.0 },
    });
    const shake = mkPass(shakeFrag, {
      tDiffuse: { value: null },
      uFlow: { value: null },
      uPhase: { value: null },
      uTime: { value: 0 },
      uSpeed: { value: 0.3 },
      uAmp: { value: 0.012 },
      uFriction: { value: new THREE.Vector2(1, 1) },
      uBounds: { value: new THREE.Vector2(0, 1) },
    });
    const godrays = mkPass(godraysFrag, {
      tDiffuse: { value: null },
      uCenter: { value: new THREE.Vector2(0.5, 0.62) },
      uLength: { value: 0.6 },
      uIntensity: { value: 0.7 },
      uColor: { value: new THREE.Vector3(1.0, 0.72, 0.32) },
    });
    godrays.renderToScreen = true;

    composer.addPass(waterflow);
    composer.addPass(shake);
    composer.addPass(godrays);
    disposables.push(composer);

    // 贴图载入
    const loadTex = (url: string, srgb = false) =>
      new Promise<THREE.Texture>((resolve) => {
        new THREE.TextureLoader().load(url, (tex) => {
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
          resolve(tex);
        });
      });

    let loaded = 0;
    const onLoaded = () => {
      loaded += 1;
    };

    loadTex('/scene/bg.jpg', true).then((tex) => {
      bgMat.uniforms.uBg.value = tex;
      if (tex.image) {
        bgMat.uniforms.uImageSize.value.set(tex.image.width, tex.image.height);
      }
      onLoaded();
    });
    loadTex('/scene/masks/waterflow.png').then((tex) => {
      waterflow.uniforms.uFlow.value = tex;
      shake.uniforms.uFlow.value = tex;
      onLoaded();
    });
    loadTex('/scene/waterflowphase.png').then((tex) => {
      waterflow.uniforms.uPhase.value = tex;
      shake.uniforms.uPhase.value = tex;
      onLoaded();
    });


    // 尺寸
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bgMat.uniforms.uResolution.value.set(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // 时间驱动（无闪白调度；神光中心固定，原壁纸不跟随鼠标）
    const clock = new THREE.Clock();

    const onVis = () => {
      running = !document.hidden;
      if (running) {
        clock.getDelta();
        loop();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    const frameInterval = 1 / 30;
    let acc = 0;
    const loop = () => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      acc += dt;
      if (acc < frameInterval) return; // 仅按 30fps 阈值渲染，仍保持时钟连续
      const t = clock.elapsedTime;

      particles.update(dt, t);

      waterflow.uniforms.uTime.value = t;
      shake.uniforms.uTime.value = t;

      composer.render();
      acc = 0;
    };
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((obj) => {
        const any = obj as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        any.geometry?.dispose();
        any.material?.dispose();
      });
      particles.objects.forEach((o) => {
        const any = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        any.geometry?.dispose();
        any.material?.dispose();
      });
      disposables.forEach((d) => d.dispose());
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
