// 从 Wallpaper Engine「龙族:高速公路上的尼伯龙根」Scene 壁纸逆向移植的着色器。
// 原始为 WE 私有 GLSL（v_TexCoord / texSample2D / CAST4 / ApplyBlending），
// 这里改写为 three.js ShaderPass 约定的 GLSL1（vUv / texture2D / gl_FragColor）。
// clouds_256 资源不在包内，故用程序化值噪声替代。

/** 全屏四边形顶点着色器（供所有 ShaderPass 复用） */
export const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** 背景图 cover 适配的片元着色器（渲染到 RenderPass 的场景里） */
export const backgroundFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uBg;
uniform vec2 uResolution;
uniform vec2 uImageSize;

vec2 coverUv(vec2 uv, vec2 res, vec2 img) {
  vec2 s = res / img;
  float scale = max(s.x, s.y);
  vec2 size = img * scale;
  vec2 offset = (res - size) * 0.5;
  vec2 px = uv * res;
  return (px - offset) / size;
}

void main() {
  vec2 buv = coverUv(vUv, uResolution, uImageSize);
  buv = clamp(buv, 0.0, 1.0);
  vec3 col = texture2D(uBg, buv).rgb;
  // 提亮：曝光 + 暗部抬升，贴近原动态壁纸明亮感，保留红色尾灯
  col *= 1.18;
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;



/** waterflow：水面/气流畸变（来自 waterflow.frag，依靠 flow/phase 贴图） */
export const waterflowFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D uFlow;
uniform sampler2D uPhase;
uniform float uTime;
uniform float uSpeed;
uniform float uAmp;
uniform float uPhaseScale;

void main() {
  float flowPhase = (texture2D(uPhase, vUv * uPhaseScale).r - 0.5);
  vec2 flowColors = texture2D(uFlow, vUv).rg;
  vec2 flowMask = (flowColors - vec2(0.498, 0.498)) * 2.0;
  float flowAmount = length(flowMask);

  vec2 cycles = vec2(fract(uTime * uSpeed), fract(uTime * uSpeed + 0.5));
  float blend = 2.0 * abs(cycles.x - 0.5);
  blend = smoothstep(max(0.0, flowPhase), min(1.0, 1.0 + flowPhase), blend);

  vec2 off1 = flowMask * uAmp * 0.1 * cycles.x;
  vec2 off2 = flowMask * uAmp * 0.1 * cycles.y;

  vec4 base = texture2D(tDiffuse, vUv);
  vec4 fl = mix(texture2D(tDiffuse, vUv + off1), texture2D(tDiffuse, vUv + off2), blend);
  gl_FragColor = mix(base, fl, flowAmount);
}
`;



/** shake：屏幕抖动（来自 shake.frag，DIRECTION=0 居中） */
export const shakeFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D uFlow;
uniform sampler2D uPhase;
uniform float uTime;
uniform float uSpeed;
uniform float uAmp;
uniform vec2 uFriction;
uniform vec2 uBounds;

void main() {
  float flowPhase = texture2D(uPhase, vUv).r * 1.5707963;
  vec2 flowColors = texture2D(uFlow, vUv).rg;
  vec2 flowMask = (flowColors - vec2(0.498, 0.498)) * 2.0;

  float time = uSpeed * uTime + flowPhase;
  float offset = sin(fract(time / 1.5707963) * 1.5707963);
  offset = offset * 0.498 + 0.5;
  float base = step(0.0, cos(time));
  offset = mix(1.0 - pow(1.0 - offset, uFriction.x), pow(offset, uFriction.y), base);
  offset = clamp((offset - uBounds.x) * uBounds.y, 0.0, 1.0);
  offset = offset * 2.0 - 1.0;

  vec2 texCoordOffset = offset * uAmp * uAmp * flowMask;
  gl_FragColor = texture2D(tDiffuse, clamp(texCoordOffset + vUv, 0.0, 1.0));
}
`;

/** godrays：黄金瞳神光（来自 godrays_cast + combine，单趟径向累积 + 加性合成 + 闪电闪白） */
export const godraysFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uLength;
uniform float uIntensity;
uniform vec3 uColor;

void main() {
  vec2 dir = uCenter - vUv;
  float dist = length(dir);
  dir /= max(dist, 1e-4);
  dist *= uLength;
  vec2 tc = vUv + dir * dist;

  const int N = 14;
  vec3 rays = vec3(0.0);
  vec2 step = dir * dist / float(N - 1);
  for (int i = 0; i < N; i++) {
    vec3 s = texture2D(tDiffuse, clamp(tc, 0.0, 1.0)).rgb;
    tc -= step;
    rays += s * (float(i) / float(N - 1));
  }
  rays *= uColor;

  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 outc = base + uIntensity * 0.1 * rays;

  gl_FragColor = vec4(outc, 1.0);
}
`;
