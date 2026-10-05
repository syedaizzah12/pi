# Pi — website

Static site for Pi, a private accounting and CPA firm. No build step: open `index.html` or serve the folder.

## Structure

- `index.html` — all content, SEO metadata and structured data (JSON-LD)
- `css/styles.css` — design tokens, liquid-glass components, sections, motion, responsive rules
- `js/liquid.js` — WebGL "liquid metal" surface: renders each `[data-liquid]` video through a ripple/refraction shader that reacts to the pointer and touch
- `js/main.js` — smooth scroll (Lenis), scroll choreography (GSAP + ScrollTrigger), loader, melted-glass filter animation, orbiting emblem, tilt cards, tabs, accordion, cursor, form validation
- `assets/video/` — the three cosmos clips (WebM + MP4) and posters
- `vendor/` — self-hosted Three.js, GSAP, ScrollTrigger and Lenis (no CDN dependency)

## Before launch

- Replace `https://www.yourdomain.com/` and the bracketed `[placeholders]` in `index.html` (contact details, address, JSON-LD).
- Point the enquiry form `action` at a form handler and remove `e.preventDefault()` in `js/main.js`.

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
