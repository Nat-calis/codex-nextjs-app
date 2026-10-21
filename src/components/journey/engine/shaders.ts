/**
 * GLSL for the GPGPU particle simulation and the point renderer.
 * The CPU fallback in CpuSimulation.ts mirrors `simCommon` + `velocityShader`
 * line for line, so keep the two in sync when tuning forces.
 */

const simCommon = /* glsl */ `
  uniform sampler2D tTargetA;
  uniform sampler2D tTargetB;
  uniform vec4 uXformA;
  uniform vec4 uXformB;
  uniform vec2 uRotA;
  uniform vec2 uRotB;
  uniform float uMix;
  uniform float uDelta;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 orient(vec3 p, vec2 rot) {
    float ca = cos(rot.x), sa = sin(rot.x);
    p = vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
    float ct = cos(rot.y), st = sin(rot.y);
    return vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
  }

  vec4 sampleTarget(vec2 uv, float seed) {
    vec4 a = texture2D(tTargetA, uv);
    vec4 b = texture2D(tTargetB, uv);
    vec3 pa = orient(a.xyz, uRotA) * uXformA.w + uXformA.xyz;
    vec3 pb = orient(b.xyz, uRotB) * uXformB.w + uXformB.xyz;
    // Each particle leaves on its own schedule so morphs read as a flock, not a crossfade.
    float m = smoothstep(seed * 0.4, 0.6 + seed * 0.4, uMix);
    return vec4(mix(pa, pb, m), mix(a.w, b.w, m));
  }
`;

export const velocityShader = /* glsl */ `
  ${simCommon}
  uniform float uTime;
  uniform float uSpring;
  uniform float uDamping;
  uniform float uNoise;
  uniform float uGravity;
  uniform float uSwirl;
  uniform float uEnergy;
  uniform float uIntro;
  uniform float uReduced;
  uniform vec3 uPointer;
  uniform vec3 uPointerVel;
  uniform float uPointerActive;
  uniform float uPress;
  uniform vec4 uShock;
  uniform vec4 uVoid;
  uniform float uVoidStrength;

  vec3 flow(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.3 + t) + sin(p.z * 0.7 - t * 0.6),
      sin(p.z * 1.1 + t * 0.8) + sin(p.x * 0.9 + t * 0.4),
      sin(p.x * 1.2 - t * 0.7) + sin(p.y * 0.8 + t * 0.5)
    ) * 0.5;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 p = texture2D(texturePosition, uv).xyz;
    vec3 v = texture2D(textureVelocity, uv).xyz;
    float seed = hash(uv);
    vec4 target = sampleTarget(uv, seed);

    vec3 acc = (target.xyz - p) * uSpring * (0.55 + 0.9 * seed) * uIntro;
    acc += flow(p * 0.45 + seed * 2.0, uTime * 0.35 + seed * 6.2831) * uNoise;
    acc.y -= uGravity * (0.4 + seed);

    vec3 center = mix(uXformA.xyz, uXformB.xyz, uMix);
    vec3 rel = p - center;
    acc += vec3(-rel.z, 0.0, rel.x) * uSwirl;

    // Cursor: slow hover attracts, fast strokes scatter along the stroke.
    vec2 d = uPointer.xy - p.xy;
    float dist = length(d) + 1e-4;
    vec2 dir = d / dist;
    float speed = length(uPointerVel.xy);
    float near = exp(-dist * dist * 0.9);
    float wide = exp(-dist * dist * 0.55);
    float attract = (1.0 - smoothstep(0.5, 4.0, speed)) * wide * 2.4;
    acc.xy += dir * attract * uPointerActive * uEnergy;
    float shove = smoothstep(0.3, 6.0, speed) * near * (1.0 - uReduced * 0.85);
    acc.xy += (uPointerVel.xy * 1.6 - dir * speed * 2.2) * shove * uPointerActive * uEnergy;
    acc.z += (seed - 0.5) * shove * speed * 3.0 * uPointerActive;

    // Press and hold: a gravity well with a little spin.
    float well = exp(-dist * 0.45) * uPress;
    acc.xy += (dir * 16.0 + vec2(-dir.y, dir.x) * 5.0 * near) * well;

    // Shockwave ring from a release or a story beat.
    if (uShock.w >= 0.0) {
      vec3 sd = p - uShock.xyz;
      float sl = length(sd) + 1e-4;
      float ring = exp(-pow(sl - uShock.w * 7.0, 2.0) * 1.5) * exp(-uShock.w * 1.6);
      acc += sd / sl * ring * 60.0 * (1.0 - uReduced * 0.8);
    }

    // Keep the active headline readable: particles part around it.
    vec2 q = (p.xy - uVoid.xy) / uVoid.zw;
    float ql = length(q);
    if (ql < 1.0) acc.xy += (q / (ql + 1e-4)) * (1.0 - ql) * uVoidStrength * 30.0;

    v += acc * uDelta;
    v *= pow(uDamping, uDelta * 60.0);
    float vs = length(v);
    if (vs > 18.0) v *= 18.0 / vs;
    gl_FragColor = vec4(v, 1.0);
  }
`;

export const positionShader = /* glsl */ `
  ${simCommon}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec3 v = texture2D(textureVelocity, uv).xyz;
    vec4 target = sampleTarget(uv, hash(uv));
    pos.xyz += v * uDelta;
    pos.w = mix(pos.w, target.w, 1.0 - exp(-uDelta * 2.5));
    gl_FragColor = pos;
  }
`;

export const pointsVertex = /* glsl */ `
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  uniform vec3 uPointer;
  uniform float uPointerActive;
  uniform float uPress;
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uCold;
  uniform float uDim;
  uniform float uIntro;
  attribute vec2 ref;
  varying vec3 vColor;
  varying float vAlpha;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec4 pos = texture2D(tPos, ref);
    vec3 vel = texture2D(tVel, ref).xyz;
    float seed = hash(ref);
    vec4 mv = modelViewMatrix * vec4(pos.xyz, 1.0);
    gl_Position = projectionMatrix * mv;

    float speed = length(vel);
    float d = length(pos.xy - uPointer.xy);
    float neon = smoothstep(1.7, 0.0, d) * uPointerActive * (0.75 + uPress * 0.6);
    neon = clamp(neon + smoothstep(2.5, 9.0, speed) * 0.55, 0.0, 1.0);

    vec3 gold = mix(vec3(0.78, 0.53, 0.2), vec3(1.0, 0.84, 0.52), seed);
    // A sparse subset breathes into blue/violet so the gold never feels flat.
    float glint = step(0.955, fract(seed * 13.7)) * (0.5 + 0.5 * sin(uTime * 0.5 + seed * 90.0));
    vec3 cool = mix(vec3(0.32, 0.46, 1.0), vec3(0.62, 0.34, 1.0), fract(seed * 7.3));
    vec3 color = mix(gold, cool, clamp(glint * 0.75 + pos.w * 0.85 + uCold * 0.55, 0.0, 1.0));
    vec3 neonColor = mix(vec3(0.15, 1.0, 0.92), vec3(1.0, 0.22, 0.86), fract(seed * 3.1 + uTime * 0.08));
    vColor = mix(color, neonColor * 1.5, neon);

    float size = uSize * (0.55 + seed * 0.95) * (1.0 + neon * 1.1);
    gl_PointSize = max(1.0, size * uScale / -mv.z);
    vAlpha = ((0.4 + 0.6 * seed) * uDim + neon * 0.45) * uIntro;
  }
`;

export const pointsFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float r = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, r);
    float a = core * core * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;
