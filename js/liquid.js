/*
  Liquid surface (raw WebGL, no library)
  --------------------------------------
  Renders a <video> or <img> through a shader that behaves like molten metal / liquid
  glass: an idle swell, ripples from every touch or pointer move, a dent under the
  pointer, refraction with chromatic split, a sheen from the surface normal, an
  unsharp mask and a cinematic grade. One instance per [data-liquid]. Media loads only
  when the section approaches, and renders only while visible. Falls back to the plain
  media when WebGL is unavailable or the user prefers reduced motion.
*/
(() => {
  const MAX_POINTS = 24;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  const FRAG = `
  precision highp float;
  uniform sampler2D uTex; uniform vec2 uRes; uniform float uTexAspect; uniform float uTime;
  uniform vec2 uMouse; uniform float uHover; uniform vec4 uPoints[${MAX_POINTS}];
  uniform float uStrength; uniform float uMetal; uniform float uGrade; uniform float uFit; uniform float uScale; uniform vec2 uShift;
  varying vec2 vUv;
  vec2 cover(vec2 uv){
    float sa = uRes.x / uRes.y; vec2 s;
    if (uFit > .5) { s = (sa > uTexAspect) ? vec2(sa / uTexAspect, 1.) : vec2(1., uTexAspect / sa); s /= uScale; uv += vec2(sin(uTime * .18) * .012, cos(uTime * .14) * .01) - uShift; }
    else { s = (sa > uTexAspect) ? vec2(1., uTexAspect / sa) : vec2(sa / uTexAspect, 1.); }
    return (uv - .5) * s + .5;
  }
  float height(vec2 p){
    float h = .006 * sin(p.x * 5. + uTime * .45) * sin(p.y * 4. - uTime * .35);
    for (int i = 0; i < ${MAX_POINTS}; i++) {
      vec4 pt = uPoints[i]; float age = uTime - pt.z;
      if (pt.w <= 0. || age < 0. || age > 3.2) continue;
      float dist = length(p - pt.xy);
      h += sin(dist * 40. - age * 8.5) * exp(-dist * 6.) * exp(-age * 1.5) * smoothstep(0., .1, age) * .045 * pt.w;
    }
    float dm = length(p - uMouse); h -= uHover * .05 * exp(-dm * dm * 70.);
    return h;
  }
  void main(){
    vec2 asp = vec2(uRes.x / uRes.y, 1.); vec2 p = vUv * asp; float e = .0035;
    float h = height(p); vec2 grad = vec2(height(p + vec2(e, 0.)) - h, height(p + vec2(0., e)) - h) / e;
    vec3 n = normalize(vec3(-grad * .55, 1.));
    vec2 uv = cover(vUv) + grad * .014 * uStrength;
    float ca = .0018 * uStrength * min(length(grad), 2.);
    vec3 col = vec3(texture2D(uTex, uv + grad * ca).r, texture2D(uTex, uv).g, texture2D(uTex, uv - grad * ca).b);
    if (uFit > .5) { vec2 inb = step(vec2(0.), uv) * step(uv, vec2(1.)); col *= inb.x * inb.y; }
    vec2 px = 1. / uRes;
    vec3 blur = (texture2D(uTex, uv + vec2(px.x, 0.)).rgb + texture2D(uTex, uv - vec2(px.x, 0.)).rgb + texture2D(uTex, uv + vec2(0., px.y)).rgb + texture2D(uTex, uv - vec2(0., px.y)).rgb) * .25;
    col += (col - blur) * .9;
    float lum = dot(col, vec3(.299, .587, .114)); col = mix(vec3(lum), col, .82);
    col = (col - .5) * 1.12 + .5; col *= uGrade; col *= vec3(.94, .98, 1.04);
    float vig = smoothstep(1.15, .35, length((vUv - .5) * vec2(1., .85)) * 1.25); col *= mix(.35, 1., vig);
    vec3 L = normalize(vec3(.35, .65, .7)); vec3 V = vec3(0., 0., 1.); vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.), 60.); float fres = pow(1. - max(dot(n, V), 0.), 3.);
    vec3 ice = vec3(.82, .94, 1.);
    col += ice * spec * (.35 + .7 * uMetal) + ice * fres * (.08 + .25 * uMetal);
    col *= 1. - clamp(abs(h) * 6., 0., .25) * uMetal;
    gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
  }`;

  class LiquidSurface {
    constructor(el) {
      this.el = el;
      this.video = el.querySelector('video');
      this.image = el.querySelector('img');
      this.canvas = el.querySelector('canvas');
      this.media = this.video || this.image;
      this.points = new Float32Array(MAX_POINTS * 4).fill(0);
      for (let i = 0; i < MAX_POINTS; i++) this.points[i * 4 + 2] = -10;
      this.head = 0; this.visible = false; this.running = false; this.loaded = false; this.ready = false;
      this.hover = 0; this.hoverTarget = 0; this.mouse = [-10, -10]; this.lastEmit = 0; this.start = performance.now();
      this.ok = this.init();
    }

    init() {
      const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) return false;
      this.gl = gl;
      const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; } return sh; };
      const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog); this.prog = prog;
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {}; ['uTex', 'uRes', 'uTexAspect', 'uTime', 'uMouse', 'uHover', 'uPoints', 'uStrength', 'uMetal', 'uGrade', 'uFit', 'uScale', 'uShift'].forEach((n) => { this.u[n] = gl.getUniformLocation(prog, n); });
      const d = this.el.dataset;
      gl.uniform1f(this.u.uStrength, parseFloat(d.strength || '1'));
      gl.uniform1f(this.u.uMetal, parseFloat(d.metal || '0'));
      gl.uniform1f(this.u.uGrade, parseFloat(d.grade || '0.6'));
      gl.uniform1f(this.u.uFit, d.fit === 'contain' ? 1 : 0);
      gl.uniform1f(this.u.uScale, parseFloat(d.scale || '1'));
      const sh = (d.shift || '0,0').split(',').map(Number); gl.uniform2f(this.u.uShift, sh[0], sh[1]);
      gl.uniform1i(this.u.uTex, 0);
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([3, 4, 5]));

      this.resize();
      new ResizeObserver(() => this.resize()).observe(this.el);
      // load media when the section is within a screen of the viewport; render only while visible
      new IntersectionObserver(([en]) => { if (en.isIntersecting) this.load(); }, { rootMargin: '100% 0px' }).observe(this.el);
      new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; this.visible ? this.play() : this.pause(); }, { rootMargin: '10% 0px' }).observe(this.el);
      document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.visible && this.play()));
      this.bindPointer();
      return true;
    }

    load() {
      if (this.loaded) return; this.loaded = true;
      const ready = () => { this.ready = true; this.el.classList.add('is-ready'); this.aspect = this.video ? this.video.videoWidth / this.video.videoHeight : this.image.naturalWidth / this.image.naturalHeight; this.gl.uniform1f(this.u.uTexAspect, this.aspect || 1); };
      if (this.video) {
        this.video.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
        if (this.video.dataset.src) this.video.src = this.video.dataset.src;
        this.video.load();
        const rate = parseFloat(this.el.dataset.rate || '1'); if (rate !== 1) this.video.playbackRate = rate;
        this.video.addEventListener('loadeddata', ready, { once: true });
        if (this.visible) this.video.play().catch(() => {});
      } else {
        if (this.image.dataset.src) this.image.src = this.image.dataset.src;
        this.image.complete && this.image.naturalWidth ? ready() : this.image.addEventListener('load', ready, { once: true });
      }
    }

    resize() {
      const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    }

    toSurface(x, y) { const r = this.el.getBoundingClientRect(); return [((x - r.left) / r.width) * (r.width / r.height), 1 - (y - r.top) / r.height]; }
    emit(x, y, strength = 1) {
      const [px, py] = this.toSurface(x, y); const i = this.head * 4;
      this.points[i] = px; this.points[i + 1] = py; this.points[i + 2] = (performance.now() - this.start) / 1000; this.points[i + 3] = strength;
      this.head = (this.head + 1) % MAX_POINTS;
    }
    ripple(fx, fy, strength = 1.5) { const r = this.el.getBoundingClientRect(); this.emit(r.left + fx * r.width, r.top + fy * r.height, strength); }

    bindPointer() {
      const inside = (x, y) => { const r = this.el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
      window.addEventListener('pointermove', (e) => {
        if (!this.visible) return;
        if (!inside(e.clientX, e.clientY)) { this.hoverTarget = 0; return; }
        this.mouse = this.toSurface(e.clientX, e.clientY); this.hoverTarget = 1;
        const now = performance.now(); if (now - this.lastEmit > 70) { this.emit(e.clientX, e.clientY, .5); this.lastEmit = now; }
      }, { passive: true });
      window.addEventListener('pointerdown', (e) => { if (this.visible && inside(e.clientX, e.clientY)) this.emit(e.clientX, e.clientY, 1.6); }, { passive: true });
      window.addEventListener('pointerleave', () => { this.hoverTarget = 0; });
      this.el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (!t) return; this.mouse = this.toSurface(t.clientX, t.clientY); this.hoverTarget = 1; const now = performance.now(); if (now - this.lastEmit > 60) { this.emit(t.clientX, t.clientY, .8); this.lastEmit = now; } }, { passive: true });
      this.el.addEventListener('touchend', () => { this.hoverTarget = 0; }, { passive: true });
    }

    play() {
      if (this.running || !this.gl) return;
      this.running = true;
      if (this.video && this.loaded) this.video.play().catch(() => {});
      const gl = this.gl;
      const loop = () => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (!this.ready) return;
        const src = this.video || this.image;
        if (!this.video || this.video.readyState >= 2) { gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src); }
        this.hover += (this.hoverTarget - this.hover) * .08;
        gl.uniform1f(this.u.uTime, (performance.now() - this.start) / 1000);
        gl.uniform2f(this.u.uMouse, this.mouse[0], this.mouse[1]);
        gl.uniform1f(this.u.uHover, this.hover);
        gl.uniform4fv(this.u.uPoints, this.points);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      this.raf = requestAnimationFrame(loop);
    }
    pause() { this.running = false; cancelAnimationFrame(this.raf); if (!this.visible && this.video) this.video.pause(); }
  }

  const surfaces = [];
  document.querySelectorAll('[data-liquid]').forEach((el) => {
    if (reduced) { // plain media, loaded lazily
      const v = el.querySelector('video'); if (v) { v.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; }); v.load(); v.play().catch(() => {}); }
      const im = el.querySelector('img'); if (im && im.dataset.src) im.src = im.dataset.src;
      return;
    }
    const s = new LiquidSurface(el);
    if (s.ok) surfaces.push(s);
    else { const v = el.querySelector('video'); if (v) { v.querySelectorAll('source[data-src]').forEach((x) => { x.src = x.dataset.src; }); v.load(); v.play().catch(() => {}); } const im = el.querySelector('img'); if (im && im.dataset.src) im.src = im.dataset.src; }
  });
  window.PiLiquid = surfaces;
})();
