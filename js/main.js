/*
  Pi — page motion and interaction
  Smooth scroll (Lenis), scroll choreography (GSAP + ScrollTrigger), loader, melted-glass
  filter animation, orbiting emblem, tilt cards, tabs, accordion, cursor, form validation.
*/
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isDesktop = () => matchMedia('(min-width: 901px)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.07, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // anchor links go through Lenis so pinned sections stay in sync
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href'); if (id.length < 2) return;
      const target = $(id); if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: id === '#top' ? 0 : -40, duration: 1.4 });
    }));
  }

  /* ---------- Split text ---------- */
  function split(el) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(' ')); return; }
      const w = document.createElement('span'); w.className = 'word'; w.setAttribute('aria-hidden', 'true');
      [...tok].forEach((ch) => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch; w.appendChild(c); });
      el.appendChild(w);
    });
    return $$('.char', el);
  }
  const heroChars = split($('#heroTitle'));
  $$('h2[data-split]').forEach((h) => {
    const chars = split(h);
    if (reduced) return;
    gsap.from(chars, { yPercent: 110, rotationX: -60, opacity: 0, duration: .9, ease: 'expo.out', stagger: .012,
      scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
  });

  /* ---------- Orbiting emblem ---------- */
  const glyphs = ['$', 'Σ', '£', 'Δ', '€', '%', '¥', '∞', '₹', '√', '±', '=', '÷', '×', '−', '+'];
  const orbitGlyphs = $('#orbitGlyphs');
  const glyphEls = glyphs.map((g, i) => {
    const s = document.createElement('span'); s.className = 'orbit-glyph'; s.textContent = g;
    const a = (i / glyphs.length) * Math.PI * 2;
    s.style.left = `${50 + Math.cos(a) * 50}%`; s.style.top = `${50 + Math.sin(a) * 50}%`;
    orbitGlyphs.appendChild(s);
    return s;
  });
  // The ring turns in 3D; each chip counter-rotates so it always faces the viewer.
  if (!reduced) {
    let angle = 0;
    gsap.ticker.add((t, dt) => {
      angle = (angle + dt * 0.006) % 360;
      orbitGlyphs.style.transform = `rotateX(68deg) rotateZ(${angle}deg)`;
      glyphEls.forEach((el) => { el.style.transform = `rotateZ(${-angle}deg) rotateX(-68deg)`; });
    });
  }

  /* ---------- Melted glass filter (animated turbulence + moving light) ---------- */
  const noise = null, noiseSm = $('#meltNoiseSm'), light = $('#meltLight'); // melt filter retired: pi is rendered clean
  if (!reduced && noise) {
    let t = 0;
    const tick = () => {
      t += 0.004;
      const bx = 0.007 + Math.sin(t * 1.3) * 0.002, by = 0.011 + Math.cos(t * 0.9) * 0.003;
      noise.setAttribute('baseFrequency', `${bx.toFixed(4)} ${by.toFixed(4)}`);
      noiseSm.setAttribute('baseFrequency', `${(0.05 + Math.sin(t) * 0.015).toFixed(4)} ${(0.08 + Math.cos(t * 1.1) * 0.02).toFixed(4)}`);
      light.setAttribute('x', (200 + Math.sin(t * 2.1) * 260).toFixed(1));
      light.setAttribute('y', (-80 + Math.cos(t * 1.7) * 160).toFixed(1));
    };
    // turbulence re-rasterises the filter; 30fps is enough and keeps the main thread calm
    let last = 0;
    gsap.ticker.add((time) => { if (time - last > 1 / 30) { last = time; tick(); } });
    // the filter seed drifts on scroll so the glass "melts" as you leave the hero
    gsap.to({ seed: 3 }, { seed: 40, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1 },
      onUpdate() { noise.setAttribute('seed', Math.round(this.targets()[0].seed)); } });
  }

  /* ---------- Loader → hero intro ---------- */
  const loader = $('#loader'), digitsEl = $('#loaderDigits');
  const PI = '3.14159265358979323846';
  const introTl = gsap.timeline({ paused: true });
  const heroMotion = !reduced;
  if (heroMotion) {
    gsap.set([$('.hero-pi-wrap'), $('.orbit')], { opacity: 0, scale: .8 });
    gsap.set($$('.hero [data-reveal]'), { opacity: 0, y: 24 });
    gsap.set(heroChars, { yPercent: 110, opacity: 0 });
    introTl
      .to($('.hero-pi-wrap'), { opacity: 1, scale: 1, duration: 1.6, ease: 'expo.out' }, 0)
      .to($('.orbit'), { opacity: 1, scale: 1, duration: 1.8, ease: 'expo.out' }, .15)
      .to(heroChars, { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: .02 }, .5)
      .to($$('.hero [data-reveal]'), { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .1 }, .8)
      .add(() => { (window.PiLiquid || []).forEach((s) => { s.ripple(.5, .45, 2.2); setTimeout(() => s.ripple(.5, .45, 1.4), 220); }); }, .2);
  }

  function finishLoading() {
    document.body.classList.remove('is-loading');
    if (!loader) { introTl.play(); return; }
    if (reduced) { loader.remove(); return; }
    gsap.timeline()
      .to(loader, { yPercent: -100, duration: 1, ease: 'expo.inOut' })
      .add(() => { loader.remove(); ScrollTrigger.refresh(); })
      .add(() => introTl.play(), '-=.55');
  }

  if (loader && !reduced) {
    const tl = gsap.timeline({ onComplete: finishLoading });
    tl.to($$('.loader-ring circle'), { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut', stagger: .12 }, 0)
      .to($('.loader-pi'), { opacity: 1, y: 0, duration: .8, ease: 'power3.out' }, .5)
      .to({ n: 2 }, { n: PI.length, duration: 1.4, ease: 'power1.inOut', onUpdate() { digitsEl.textContent = PI.slice(0, Math.round(this.targets()[0].n)); } }, .2)
      .to({}, { duration: .25 });
  } else finishLoading();

  /* ---------- Hero scroll choreography ---------- */
  if (heroMotion) {
    gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: .8 } })
      .to($('.hero-pi-wrap'), { yPercent: -30, scale: 1.55, opacity: 0, ease: 'none' }, 0)
      .to($('.orbit'), { yPercent: -20, scale: 1.4, opacity: 0, ease: 'none' }, 0)
      .to($('.hero-copy'), { yPercent: -35, opacity: 0, ease: 'none' }, .15)
      .to($('#heroPanel'), { scale: .96, opacity: 0, ease: 'none' }, .1)
      .to($('.hero-for'), { opacity: 0, ease: 'none' }, 0);

    // pi leans toward the pointer
    if (finePointer) {
      const piWrap = $('#heroPi'), orbit = $('#orbit');
      const qx = gsap.quickTo(piWrap, 'x', { duration: 1.2, ease: 'power3' }), qy = gsap.quickTo(piWrap, 'y', { duration: 1.2, ease: 'power3' });
      const ox = gsap.quickTo(orbit, 'rotationY', { duration: 1.6, ease: 'power3' }), oy = gsap.quickTo(orbit, 'rotationX', { duration: 1.6, ease: 'power3' });
      $('#hero').addEventListener('pointermove', (e) => {
        const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
        qx(nx * 40); qy(ny * 30); ox(nx * 18); oy(-ny * 14);
      });
    }
  }

  /* ---------- Generic reveals ---------- */
  if (!reduced) {
    $$('[data-reveal]:not(.hero [data-reveal])').forEach((el) => {
      gsap.from(el, { opacity: 0, y: 26, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    $$('[data-stagger]').forEach((el) => {
      gsap.from(el.children, { opacity: 0, y: 40, rotationX: -8, duration: 1, ease: 'power3.out', stagger: .1, scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
    $$('.ledger').forEach((list) => {
      gsap.from(list.children, { opacity: 0, y: 30, duration: .8, ease: 'power3.out', stagger: .07, scrollTrigger: { trigger: list, start: 'top 85%', once: true } });
    });
  }

  /* ---------- Ribbon marquee ---------- */
  const track = $('#ribbonTrack');
  if (track) {
    track.appendChild(track.firstElementChild.cloneNode(true));
    if (!reduced) {
      const tween = gsap.to(track, { xPercent: -50, ease: 'none', duration: 60, repeat: -1 });
      track.parentElement.addEventListener('pointerenter', () => gsap.to(tween, { timeScale: .25, duration: .6 }));
      track.parentElement.addEventListener('pointerleave', () => gsap.to(tween, { timeScale: 1, duration: .6 }));
    }
  }

  /* ---------- Quote: words light up as you scroll ---------- */
  const quote = $('[data-words] p');
  if (quote) {
    const words = quote.textContent.trim().split(/\s+/);
    quote.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
    const ws = $$('.w', quote);
    if (!reduced) {
      ScrollTrigger.create({ trigger: quote, start: 'top 80%', end: 'bottom 45%', scrub: true,
        onUpdate(self) { const n = Math.round(self.progress * ws.length); ws.forEach((w, i) => w.classList.toggle('on', i < n)); } });
    } else ws.forEach((w) => w.classList.add('on'));
  }

  /* ---------- Precision ring: fills to the digits of pi as the card enters ---------- */
  const arc = $('#precisionArc'), digits = $('#precisionDigits');
  if (arc && !reduced) {
    gsap.to({ p: 0 }, { p: 1, duration: 2.2, ease: 'power2.out', scrollTrigger: { trigger: arc, start: 'top 85%', once: true },
      onUpdate() { const v = this.targets()[0].p; arc.style.strokeDashoffset = 1 - v; digits.textContent = PI.slice(0, 2 + Math.round(v * 6)); } });
  } else if (arc) { arc.style.strokeDashoffset = 0; digits.textContent = PI.slice(0, 8); }

  /* ---------- Tilt + pointer sheen on glass cards ---------- */
  if (finePointer && !reduced) {
    $$('[data-tilt]').forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: .6, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: .6, ease: 'power3' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rx((0.5 - py) * 10); ry((px - 0.5) * 12);
        card.style.setProperty('--mx', `${px * 100}%`); card.style.setProperty('--my', `${py * 100}%`);
        card.style.setProperty('--rim-angle', `${Math.atan2(py - .5, px - .5) * 180 / Math.PI + 90}deg`);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  /* ---------- Service tabs ---------- */
  const tabs = $$('[role="tab"]'), indicator = $('#tabIndicator');
  function moveIndicator(tab, animate = true) {
    if (!indicator) return;
    const x = tab.offsetLeft, w = tab.offsetWidth;
    gsap.to(indicator, { x, width: w, duration: animate && !reduced ? .55 : 0, ease: 'expo.out' });
  }
  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (on && panel.hidden) {
        panel.hidden = false;
        if (!reduced) gsap.from(panel.children, { opacity: 0, y: 18, duration: .6, ease: 'power3.out', stagger: .05, clearProps: 'all' });
      } else if (!on) panel.hidden = true;
    });
    moveIndicator(tab);
    if (focus) tab.focus();
    ScrollTrigger.refresh();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length], true);
      if (e.key === 'ArrowLeft') selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
  });
  if (tabs.length) { moveIndicator(tabs[0], false); window.addEventListener('resize', () => moveIndicator(tabs.find((t) => t.getAttribute('aria-selected') === 'true'), false)); }
  $$('[data-tab]').forEach((a) => a.addEventListener('click', () => selectTab(document.getElementById(a.dataset.tab))));

  /* ---------- Approach: pinned horizontal run (desktop only) ---------- */
  if (!reduced) {
    ScrollTrigger.matchMedia({
      '(min-width: 901px)': () => {
        const steps = $('#steps'), pin = $('#approachPin'), bar = $('#approachBar');
        const distance = () => steps.scrollWidth - pin.clientWidth + parseFloat(getComputedStyle(steps).paddingLeft) * 2;
        const tl = gsap.timeline({ scrollTrigger: { trigger: '#approach', start: 'top top', end: () => `+=${distance() + innerHeight * .4}`, pin, scrub: 1, invalidateOnRefresh: true,
          onUpdate(self) { gsap.set(bar, { scaleX: self.progress }); } } });
        tl.to(steps, { x: () => -distance(), ease: 'none' });
        $$('.step', steps).forEach((s, i) => gsap.fromTo(s, { '--ry': 18 }, { '--ry': -18, ease: 'none', scrollTrigger: { containerAnimation: tl, trigger: s, start: 'left right', end: 'right left', scrub: true } }));
      },
    });
  }

  /* ---------- FAQ accordion ---------- */
  $$('.acc').forEach((d) => {
    const body = $('.acc-body', d), summary = $('summary', d);
    if (!d.open) gsap.set(body, { height: 0 });
    summary.addEventListener('click', (e) => {
      if (reduced) return;
      e.preventDefault();
      if (d.open) {
        gsap.to(body, { height: 0, duration: .45, ease: 'power3.inOut', onComplete: () => { d.open = false; ScrollTrigger.refresh(); } });
      } else {
        d.open = true;
        gsap.fromTo(body, { height: 0 }, { height: 'auto', duration: .55, ease: 'power3.out', onComplete: () => ScrollTrigger.refresh() });
      }
    });
  });

  /* ---------- Header, progress, mobile menu ---------- */
  const header = $('.site-header'), progress = $('#progress');
  const onScroll = () => {
    header.classList.toggle('scrolled', scrollY > 30);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const toggle = $('.menu-toggle'), links = $('#navLinks');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open); toggle.firstElementChild.textContent = open ? 'Close' : 'Menu';
  });
  $$('a', links).forEach((a) => a.addEventListener('click', () => { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.firstElementChild.textContent = 'Menu'; }));

  /* ---------- Cursor + magnetic elements ---------- */
  if (finePointer && !reduced) {
    document.body.classList.add('has-cursor');
    const cur = $('#cursor');
    const cx = gsap.quickTo(cur, 'x', { duration: .18, ease: 'power3' }), cy = gsap.quickTo(cur, 'y', { duration: .18, ease: 'power3' });
    addEventListener('pointermove', (e) => { cx(e.clientX); cy(e.clientY); cur.classList.remove('is-hidden'); });
    document.documentElement.addEventListener('mouseleave', () => cur.classList.add('is-hidden'));
    addEventListener('pointerdown', () => cur.classList.add('is-press'));
    addEventListener('pointerup', () => cur.classList.remove('is-press'));
    $$('a, button, summary, [data-tilt]').forEach((el) => {
      el.addEventListener('pointerenter', () => cur.classList.add('is-active'));
      el.addEventListener('pointerleave', () => cur.classList.remove('is-active'));
    });
    $$('[data-magnetic]').forEach((el) => {
      const mx = gsap.quickTo(el, 'x', { duration: .5, ease: 'power3' }), my = gsap.quickTo(el, 'y', { duration: .5, ease: 'power3' });
      el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * .25); my((e.clientY - r.top - r.height / 2) * .35); });
      el.addEventListener('pointerleave', () => { mx(0); my(0); });
    });
  }

  /* ---------- Enquiry form ---------- */
  const form = $('#enquiryForm'), status = $('#formStatus');
  const messages = {
    name: 'Enter your full name.',
    email: 'Enter a valid email address, for example name@company.com.',
    clientType: 'Choose how you are enquiring.',
    service: 'Choose a service, or select "Not sure yet".',
    message: 'Tell us briefly how we can help.',
  };
  function check(el) {
    const field = el.closest('.field'); if (!field) return true;
    const err = $('.error', field);
    const ok = el.checkValidity() && (!el.required || el.value.trim() !== '');
    field.classList.toggle('invalid', !ok); el.setAttribute('aria-invalid', !ok);
    err.textContent = ok ? '' : (messages[el.name] || 'This field is required.');
    return ok;
  }
  $$('input, select, textarea', form).forEach((el) => el.addEventListener('blur', () => { if (el.closest('.field')) check(el); }));
  form.addEventListener('submit', (e) => {
    e.preventDefault(); // remove when connecting a real form handler
    const fields = $$('.field input, .field select, .field textarea', form);
    const allOk = fields.map(check).every(Boolean);
    const consent = $('#consent');
    status.className = 'form-status';
    if (!allOk) { status.textContent = 'Some details are missing. Check the highlighted fields.'; $('.invalid input, .invalid select, .invalid textarea', form).focus(); return; }
    if (!consent.checked) { status.textContent = 'Tick the consent box so we can reply to you.'; consent.focus(); return; }
    status.classList.add('success');
    status.textContent = 'Thank you. Your request has been received, and a partner will contact you within one business day.';
    if (!reduced) gsap.from(status, { opacity: 0, y: 8, duration: .6, ease: 'power3.out' });
    form.reset();
  });

  $('#year').textContent = new Date().getFullYear();
  addEventListener('load', () => ScrollTrigger.refresh());
})();
