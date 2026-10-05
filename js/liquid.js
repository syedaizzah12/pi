/*
  Liquid surface
  --------------
  Renders a <video> through a WebGL shader that behaves like molten metal / liquid glass:
  an idle swell, ripples that spread from every touch or pointer move, a dent under the
  pointer, refraction with chromatic split, and a gold specular sheen computed from the
  surface normal. One instance per [data-liquid] element. Falls back to the plain video
  when WebGL is unavailable or the user prefers reduced motion.
*/
import * as THREE from 'three';

const MAX_POINTS = 24;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */`
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2  uRes;
  uniform float uTexAspect;
  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uHover;
  uniform vec4  uPoints[${MAX_POINTS}];
  uniform float uStrength;
  uniform float uMetal;
  varying vec2 vUv;

  vec2 cover(vec2 uv) {
    float sa = uRes.x / uRes.y;
    vec2 s = (sa > uTexAspect) ? vec2(1.0, uTexAspect / sa) : vec2(sa / uTexAspect, 1.0);
    return (uv - 0.5) * s + 0.5;
  }

  float height(vec2 p) {
    float h = 0.0;
    // idle molten swell
    h += 0.014 * sin(p.x * 7.0 + uTime * 0.55) * sin(p.y * 6.0 - uTime * 0.4);
    h += 0.008 * sin(p.x * 13.0 - uTime * 0.8 + p.y * 4.0);
    // ripples from touches
    for (int i = 0; i < ${MAX_POINTS}; i++) {
      vec4 pt = uPoints[i];
      float age = uTime - pt.z;
      if (pt.w <= 0.0 || age < 0.0 || age > 3.2) continue;
      float dist = length(p - pt.xy);
      float wave = sin(dist * 40.0 - age * 8.5);
      float env  = exp(-dist * 6.0) * exp(-age * 1.5) * smoothstep(0.0, 0.1, age);
      h += wave * env * 0.06 * pt.w;
    }
    // dent that follows the finger
    float dm = length(p - uMouse);
    h -= uHover * 0.07 * exp(-dm * dm * 70.0);
    return h;
  }

  void main() {
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 p = vUv * asp;
    float e = 0.0035;
    float h  = height(p);
    float hx = height(p + vec2(e, 0.0));
    float hy = height(p + vec2(0.0, e));
    vec2 grad = vec2(hx - h, hy - h) / e;
    vec3 n = normalize(vec3(-grad * 0.55, 1.0));

    vec2 uv = cover(vUv) + grad * 0.04 * uStrength;
    float ca = 0.006 * uStrength * min(length(grad), 2.0);
    vec3 col;
    col.r = texture2D(uTex, uv + grad * ca).r;
    col.g = texture2D(uTex, uv).g;
    col.b = texture2D(uTex, uv - grad * ca).b;

    // metal sheen
    vec3 L = normalize(vec3(0.35, 0.65, 0.7));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 60.0);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 gold = vec3(0.82, 0.94, 1.0);
    col += gold * spec * (0.5 + 0.9 * uMetal);
    col += gold * fres * (0.15 + 0.35 * uMetal);
    col *= 1.0 - clamp(abs(h) * 6.0, 0.0, 0.35) * uMetal;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

class LiquidSurface {
  constructor(el) {
    this.el = el;
    this.video = el.querySelector('video');
    this.canvas = el.querySelector('canvas');
    this.strength = parseFloat(el.dataset.strength || '1');
    this.metal = parseFloat(el.dataset.metal || '0');
    this.points = new Array(MAX_POINTS).fill(0).map(() => new THREE.Vector4(0, 0, -10, 0));
    this.head = 0;
    this.visible = false;
    this.running = false;
    this.hover = 0;
    this.hoverTarget = 0;
    this.mouse = new THREE.Vector2(-10, -10);
    this.lastEmit = 0;
    this.start = performance.now();
    this.init();
  }

  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.uniforms = {
      uTex: { value: this.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTexAspect: { value: 1 },
      uTime: { value: 0 },
      uMouse: { value: this.mouse },
      uHover: { value: 0 },
      uPoints: { value: this.points },
      uStrength: { value: this.strength },
      uMetal: { value: this.metal },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.el);
    new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; this.visible ? this.play() : this.pause(); }, { rootMargin: '10%' }).observe(this.el);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.visible && this.play()));

    const onMeta = () => { this.uniforms.uTexAspect.value = this.video.videoWidth / this.video.videoHeight || 1; };
    this.video.readyState >= 1 ? onMeta() : this.video.addEventListener('loadedmetadata', onMeta, { once: true });
    const ready = () => this.el.classList.add('is-ready');
    this.video.readyState >= 2 ? ready() : this.video.addEventListener('loadeddata', ready, { once: true });
    this.video.play().catch(() => {});

    this.bindPointer();
    this.play();
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.uniforms.uRes.value.set(w, h);
  }

  toSurface(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = 1 - (clientY - r.top) / r.height;
    return new THREE.Vector2(x * (r.width / r.height), y);
  }

  emit(clientX, clientY, strength = 1) {
    const p = this.toSurface(clientX, clientY);
    const v = this.points[this.head];
    v.set(p.x, p.y, (performance.now() - this.start) / 1000, strength);
    this.head = (this.head + 1) % MAX_POINTS;
  }

  bindPointer() {
    // Listen on the window so content layered over the surface still passes touches through.
    const inside = (x, y) => { const r = this.el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    window.addEventListener('pointermove', (e) => {
      if (!this.visible) return;
      if (!inside(e.clientX, e.clientY)) { this.hoverTarget = 0; return; }
      this.mouse.copy(this.toSurface(e.clientX, e.clientY));
      this.hoverTarget = 1;
      const now = performance.now();
      if (now - this.lastEmit > 70) { this.emit(e.clientX, e.clientY, 0.5); this.lastEmit = now; }
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => { if (this.visible && inside(e.clientX, e.clientY)) this.emit(e.clientX, e.clientY, 1.6); }, { passive: true });
    window.addEventListener('pointerleave', () => { this.hoverTarget = 0; });
    this.el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]; if (!t) return;
      this.mouse.copy(this.toSurface(t.clientX, t.clientY)); this.hoverTarget = 1;
      const now = performance.now();
      if (now - this.lastEmit > 60) { this.emit(t.clientX, t.clientY, 0.8); this.lastEmit = now; }
    }, { passive: true });
    this.el.addEventListener('touchend', () => { this.hoverTarget = 0; }, { passive: true });
  }

  play() {
    if (this.running || !this.renderer) return;
    this.running = true;
    this.video.play().catch(() => {});
    const loop = () => {
      if (!this.running) return;
      this.uniforms.uTime.value = (performance.now() - this.start) / 1000;
      this.hover += (this.hoverTarget - this.hover) * 0.08;
      this.uniforms.uHover.value = this.hover;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (!this.visible) this.video.pause();
  }

  // Lets the page script fire a ripple (e.g. on load) at a point in element space 0..1
  ripple(fx, fy, strength = 1.5) {
    const r = this.el.getBoundingClientRect();
    this.emit(r.left + fx * r.width, r.top + fy * r.height, strength);
  }
}

const surfaces = [];
if (!reduced) {
  document.querySelectorAll('[data-liquid]').forEach((el) => {
    const s = new LiquidSurface(el);
    if (s.renderer) surfaces.push(s);
  });
}
window.PiLiquid = surfaces;
window.dispatchEvent(new CustomEvent('liquid:ready', { detail: surfaces }));
