'use strict';
// Demo scenarios, run inside the app page by tools/render-demos.mjs.
// Each scenario drives the same actions as the UI buttons (set up bench → expose → develop → fix)
// and returns a labelled comparison sheet. Randomness is seeded so results are reproducible.
(function () {
  const U = Lab.util, O = Lab.optics, E = Lab.emulsion, P = Lab.processes;
  const app = () => Lab.app;
  const inputs = {};
  const SIZE = 640;

  async function loadInputs(map) {
    for (const k in map) {
      const img = new Image();
      img.src = map[k];
      await img.decode();
      inputs[k] = U.readDrawable(img, 1400);
    }
    inputs.chart = colourChart();
  }

  // A synthetic colour chart that makes spectral sensitivity unmistakable.
  function colourChart() {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1200;
    const g = c.getContext('2d');
    g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, 900, 1200);
    const sw = ['#d21f1f', '#e8761c', '#f2d21b', '#3a9d2f', '#1fa6b8', '#2242c9', '#7b2fbf', '#e0ac8a', '#bcd7f2', '#ffffff', '#3d3d3d', '#000000'];
    sw.forEach((col, i) => { g.fillStyle = col; g.fillRect(40 + (i % 3) * 280, 40 + Math.floor(i / 3) * 285, 260, 265); });
    return U.readDrawable(c, 1400);
  }

  // ---------- bench helpers ----------
  function bench(process, photo, seed = 7) {
    Math.random = U.mulberry32(seed);
    const a = app();
    a.st.paperLong = SIZE;
    a.st.view = 'plate';
    a.resetBench(process);
    const l = a.setPicture(inputs[photo], photo);
    return { st: a.st, layer: l };
  }
  const fresh = (seed = 11) => { Math.random = U.mulberry32(seed); app().newSheet(false); };
  const plate = () => app().plateCanvas();
  // The untouched photo as the "Input" panel: upright, with no other layers ghosted on top.
  function original() {
    const a = app(), W = a.sheet.W, H = a.sheet.H;
    const inv = a.st.aperture.invert, hidden = [];
    a.st.aperture.invert = false;
    a.st.layers.forEach((l, i) => { if (i > 0 && l.visible) { l.visible = false; hidden.push(l); } });
    const rgba = O.originalView(a.st, W, H);
    hidden.forEach((l) => { l.visible = true; });
    a.st.aperture.invert = inv;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
    return c;
  }
  function develop(t) {
    const a = app(), st = a.st, p = a.proc(), sh = a.sheet;
    if (!a.canDevelop()) return;
    E.startDevelop(sh, st, p);
    const n = 40;
    for (let k = 0; k < n; k++) E.devStep(sh, st, p, t / n);
    sh.state = 'developed';
  }
  // Expose (time multiplier), develop (seconds or recommended), fix.
  function print({ time = 1, dev = null, fix = true, seed = 11, before = null } = {}) {
    const a = app();
    fresh(seed);
    if (before) before(a.sheet);
    const T0 = a.st.exposure.time;
    a.st.exposure.time = T0 * time;
    a.instantExposure();
    a.st.exposure.time = T0;
    develop(dev == null ? a.st.dev.time : dev);
    if (fix) a.fixAndWash();
    return plate();
  }
  // Exposure with a hand (dodge) or card (burn) following a path, as if held during the real-time clock.
  function handSession(tool, path, radius, timeMul = 1) {
    const a = app(), st = a.st, p = a.proc();
    const T0 = st.exposure.time;
    st.exposure.time = T0 * timeMul;
    const sess = O.beginSession(st, p, a.sheet);
    st.exposure.time = T0;
    const n = 40;
    for (let k = 0; k < n; k++) {
      const [x, y] = path(k / n, a.sheet.W, a.sheet.H);
      O.stepSession(st, sess, sess.T / n, { active: true, x, y, tool, radius, soft: radius * 0.6, strength: 0.9 });
    }
    E.commitSession(a.sheet, sess, st, p);
  }
  function printFlash(at, strength, mackie) {
    const a = app(), st = a.st, p = a.proc();
    fresh(11);
    a.instantExposure();
    E.startDevelop(a.sheet, st, p);
    const T = st.dev.time, n = 40;
    for (let k = 0; k < n; k++) {
      if (k === Math.round(n * at)) { st.flash.mackie = mackie; E.flash(a.sheet, st, p, strength); }
      E.devStep(a.sheet, st, p, T / n);
    }
    a.sheet.state = 'developed';
    a.fixAndWash();
    return plate();
  }
  const addObj = (kind, props) => { const l = O.makeProcLayer(kind); Object.assign(l, props); app().addLayer(l); return l; };
  const L = () => Math.max(app().sheet.W, app().sheet.H);

  // ---------- comparison sheet ----------
  function sheetOf({ title, subtitle, panels, cols }) {
    const th = 300, pad = 12, lab = 24, head = 64;
    const tiles = panels.map(([label, c]) => ({ label, c, w: Math.round((c.width * th) / c.height) }));
    cols = cols || tiles.length;
    const rows = Math.ceil(tiles.length / cols);
    const cw = Math.max(...tiles.map((t) => t.w));
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '22px Georgia, serif';
    let textW = probe.measureText(title).width;
    probe.font = 'italic 14px Georgia, serif';
    textW = Math.max(textW, probe.measureText(subtitle || '').width);
    const gridW = pad + cols * (cw + pad);
    const W = Math.ceil(Math.max(gridW, textW + pad * 2)), H = head + rows * (th + lab + pad) + pad / 2;
    const ox = (W - gridW) / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0a09'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e6dccb'; g.font = '22px Georgia, serif'; g.fillText(title, pad, 30);
    g.fillStyle = '#8a8174'; g.font = 'italic 14px Georgia, serif'; g.fillText(subtitle || '', pad, 52);
    tiles.forEach((t, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = ox + pad + col * (cw + pad) + (cw - t.w) / 2, y = head + row * (th + lab + pad);
      g.drawImage(t.c, x, y, t.w, th);
      g.fillStyle = /^input/i.test(t.label) ? '#d9b48a' : '#cfc6b8';
      g.font = '14px Georgia, serif';
      const tw = g.measureText(t.label).width;
      g.fillText(t.label, ox + pad + col * (cw + pad) + (cw - tw) / 2, y + th + 18);
    });
    return c.toDataURL('image/jpeg', 0.86);
  }

  // ---------- scenarios ----------
  const S = {};
  const NAMES = { portrait: 'portrait', forest: 'foggy forest', stairs: 'abandoned stairs', statue: 'cemetery statue' };

  for (const photo of Object.keys(NAMES)) {
    S['processes-' + photo] = () => {
      const panels = [];
      for (const id of Object.keys(P)) {
        bench(id, photo);
        if (!panels.length) panels.push(['Input', original()]);
        panels.push([P[id].name.split(' (')[0], print()]);
      }
      return { title: `Every process, one photo (${NAMES[photo]})`, subtitle: 'Default bench for each process: expose → develop for the recommended time → fix & wash. Nothing else touched.', panels, cols: 3 };
    };
  }

  const ladder = [[1 / 16, '÷16 (−4 stops)'], [1 / 4, '÷4 (−2 stops)'], [1, 'Recommended'], [4, '×4 (+2 stops)'], [16, '×16 (+4 stops)']];
  for (const photo of ['forest', 'portrait']) {
    S['exposure-' + photo] = () => {
      bench('drygelatin', photo);
      const panels = [['Input', original()]];
      for (const [m, label] of ladder) panels.push([label, print({ time: m })]);
      return { title: `Extreme exposures: silver gelatin dry plate (${NAMES[photo]})`, subtitle: 'Same plate, same development; only the exposure time changes. The H&D curve’s toe and shoulder swallow the extremes.', panels, cols: 3 };
    };
  }

  S['exposure-daguerreotype-solarisation'] = () => {
    bench('daguerreotype', 'forest');
    const panels = [['Input', original()]];
    for (const [m, label] of [[0.25, '÷4'], [1, 'Recommended'], [8, '×8'], [64, '×64'], [512, '×512']]) panels.push([label, print({ time: m })]);
    return { title: 'Extreme exposures: daguerreotype solarisation', subtitle: 'Pushed far past normal the plate solarises: by ×512 the brightest rays fall back to grey while the shadows keep climbing, so tones begin to reverse.', panels, cols: 3 };
  };

  S['spectral-sensitivity'] = () => {
    const orig = P.drygelatin.spectral.slice();
    const kinds = [[[0.03, 0.12, 0.85], 'Blue-sensitive (1840s–1880s)'], [[0.08, 0.5, 0.42], 'Orthochromatic'], [[0.3, 0.59, 0.11], 'Panchromatic']];
    const panels = [];
    for (const photo of ['stairs', 'chart']) {
      kinds.forEach(([w, label], k) => {
        P.drygelatin.spectral = w;
        bench('drygelatin', photo);
        if (k === 0) panels.push(['Input', original()]);
        panels.push([label, print()]);
      });
    }
    P.drygelatin.spectral = orig;
    return { title: 'Spectral sensitivity', subtitle: 'Early emulsions only saw blue: reds and greens print black, blues print white. Panchromatic film sees roughly as we do.', panels, cols: 4 };
  };

  S['aperture-defocus'] = () => {
    const { st } = bench('drygelatin', 'portrait');
    addObj('dust', { distance: 82, amount: 1 });
    const panels = [['Input', original()]];
    const shots = [['f/2: dust far from focus melts', { fstop: 2 }], ['f/32: everything sharp', { fstop: 32 }], ['Pinhole: soft everywhere', { shape: 'pinhole', pinhole: 1.5 }], ['f/4, focus missed (140 mm)', { fstop: 4, focus: 140 }]];
    for (const [label, ap] of shots) {
      Object.assign(st.aperture, { shape: 'round', focus: 100, fstop: 8 }, ap);
      panels.push([label, print()]);
    }
    return { title: 'Aperture & depth of field', subtitle: 'A dusty glass sits 82 mm in front of the aperture, the photo at the 100 mm focus plane. Blur ∝ |distance − focus| / f-number.', panels };
  };

  S['mis-lighting'] = () => {
    const { st } = bench('drygelatin', 'statue');
    addObj('dust', { distance: 30, amount: 0.4 });
    const panels = [['Input', original()]];
    const shots = [['Centred lamp', {}, 1], ['Lamp right & low (re-timed ×3)', { x: 1.1, height: 0.7 }, 3], ['Lamp top-left, very low (×6)', { x: -1.2, y: -0.9, height: 0.45 }, 6], ['Huge diffuse lamp off-axis (×2)', { x: 0.8, size: 2, height: 0.9 }, 2]];
    for (const [label, lp, m] of shots) {
      Object.assign(st.lamp, { x: 0, y: 0, height: 1.4, size: 0.3 }, lp);
      panels.push([label, print({ time: m })]);
    }
    return { title: 'Mis-lighting', subtitle: 'Inverse-square × cosine falloff from an off-axis lamp; out-of-focus layers shift (parallax) and soften with lamp size.', panels };
  };

  S['lens-character'] = () => {
    const { st } = bench('drygelatin', 'forest');
    const panels = [['Input', original()]];
    const shots = [['Clean lens', {}], ['Camera vignette (dark corners)', { camVignette: 0.75 }], ['Field curvature + softness', { fieldCurve: 1.8, softness: 0.8 }], ['Enlarger falloff (light corners)', { vignette: 1 }]];
    for (const [label, o] of shots) {
      Object.assign(st.aperture, { fieldCurve: 0, softness: 0, vignette: 0, camVignette: 0 }, o);
      panels.push([label, print()]);
    }
    return { title: 'Lens character', subtitle: 'The camera’s vignette darkens the picture’s corners; the printing lens’s falloff starves them of light; Petzval-style field curvature smears them.', panels };
  };

  S['halation'] = () => {
    const { st } = bench('daguerreotype', 'forest');
    const panels = [['Input', original()]];
    for (const [h, label] of [[0, 'No halation'], [0.5, 'Some'], [1.5, 'Heavy halation']]) {
      st.exposure.halation = h;
      panels.push([label, print({ time: 2 })]);
    }
    return { title: 'Halation (daguerreotype)', subtitle: 'Light reflected back from the plate’s support re-enters the emulsion as a glow around the brightest areas.', panels };
  };

  S['motion-ghosting'] = () => {
    const { layer } = bench('daguerreotype', 'portrait');
    const panels = [['Input', original()]];
    const shots = [['Sitter held still', {}], ['Nervous sitter (tremble)', { tremble: 1.4 }], ['Leaned away (drift)', { driftX: 0.06 }], ['Both, 4× longer sitting', { tremble: 1, driftX: 0.04, long: 4 }]];
    for (const [label, o] of shots) {
      Object.assign(layer, { tremble: 0, driftX: 0 }, o);
      panels.push([label, print({ time: o.long || 1 })]);
    }
    return { title: 'Long exposures & restless sitters (daguerreotype)', subtitle: 'The exposure is integrated over time while the layer moves, exactly like a sitter during a two-minute exposure.', panels };
  };

  S['spirit-photography'] = () => {
    bench('collodion', 'forest');
    const panels = [['Input', original()], ['Plain collodion plate', print()]];
    const m = addObj('muslin', { start: 0.4, end: 1, distance: 108, strength: 1, amount: 0.9 });
    panels.push(['Muslin veil for the last 60%', print()]);
    m.visible = false;
    // A portrait sandwiched as a negative: its dark figure holds back light and prints as a pale apparition.
    const g = O.makeImageLayer(inputs.portrait, 'apparition');
    Object.assign(g, { source: 'negative', start: 0.5, x: 0.12, scale: 1.1, distance: 104 });
    app().addLayer(g);
    panels.push(['Portrait sandwiched for the last half', print()]);
    m.visible = true;
    panels.push(['Both', print()]);
    return { title: 'Spirit photography', subtitle: 'Layers that are in the light path for only part of the exposure print as translucent apparitions.', panels };
  };

  S['dodge-and-burn'] = () => {
    bench('drygelatin', 'forest');
    const panels = [['Input', original()], ['Straight print', print()]];
    fresh(11);
    handSession('dodge', (t, W, H) => [W * (0.5 + 0.08 * Math.sin(t * 20)), H * (0.86 + 0.03 * Math.cos(t * 17))], L() * 0.2);
    develop(app().st.dev.time); app().fixAndWash();
    panels.push(['Hand dodging the forest floor', plate()]);
    fresh(11);
    app().instantExposure();
    handSession('burn', (t, W, H) => [W * (0.22 + 0.03 * Math.sin(t * 13)), H * (0.32 + 0.03 * Math.cos(t * 11))], L() * 0.16, 3);
    develop(app().st.dev.time); app().fixAndWash();
    panels.push(['+3× burn through a hole on the rays', plate()]);
    return { title: 'Dodging & burning', subtitle: 'The hand / card tools held during the real-time exposure. Here a scripted wiggle stands in for the mouse.', panels };
  };

  S['development-time'] = () => {
    const { st } = bench('drygelatin', 'forest');
    const panels = [['Input', original()]];
    for (const [t, label] of [[20, 'Pulled at 20 s'], [60, '60 s'], [180, '3 min (recommended)'], [900, '15 min'], [300, '5 min at 35 °C (gelatin frills)']]) {
      st.dev.temp = label.includes('35') ? 35 : 20;
      panels.push([label, print({ dev: t })]);
    }
    return { title: 'Development time & temperature', subtitle: 'First-order development kinetics: density and contrast build with time; warm baths run fast and fog.', panels, cols: 3 };
  };

  S['uneven-chemistry'] = () => {
    const { st } = bench('drygelatin', 'portrait');
    const panels = [['Input', original()]];
    const shots = [['Gentle rocking', {}], ['Still bath: bromide drag', { agitation: 'none', drag: 1, uneven: 0.7 }], ['Uneven pour', { pour: 1, uneven: 0.5 }], ['Vigorous: surge marks', { agitation: 'vigorous', uneven: 1 }]];
    for (const [label, d] of shots) {
      Object.assign(st.dev, { agitation: 'gentle', drag: 0.3, uneven: 0.25, pour: 0 }, d);
      panels.push([label, print({ dev: 80, time: 1.6 })]);
    }
    return { title: 'Uneven chemistry', subtitle: 'Developed for only 80 s so the bath can’t even itself out: blotchy activity, bromide streaming down from dense areas, a slow pour, surge at the edges.', panels };
  };

  S['sabattier'] = () => {
    bench('drygelatin', 'portrait');
    const panels = [['Input', original()], ['Normal development', print()]];
    panels.push(['Faint flash at ⅓', printFlash(0.33, 0.05, 0.8)]);
    panels.push(['Medium flash at ⅓', printFlash(0.33, 0.15, 1)]);
    panels.push(['Strong early flash', printFlash(0.15, 0.6, 1)]);
    return { title: 'Sabattier effect & Mackie lines', subtitle: 'Flashing the light mid-development: partial tone reversal, with bright lines where bromide held back development along edges.', panels, cols: 5 };
  };

  S['chemigram'] = () => {
    bench('drygelatin', 'stairs');
    const panels = [['Input', original()], ['Straight print', print()]];
    const brush = (sh, tool, pts, r, s, reps = 1) => { for (let k = 0; k < reps; k++) pts.forEach(([x, y]) => E.chemBrush(sh, x * sh.W, y * sh.H, tool, r, s)); };
    const spiral = Array.from({ length: 160 }, (_, k) => { const a = k / 12, r = 0.04 + k / 700; return [0.5 + r * Math.cos(a), 0.35 + r * Math.sin(a) * 0.8]; });
    panels.push(['Fixer resist painted first', print({ before: (sh) => brush(sh, 'fixer', spiral, 14, 1) })]);
    const drips = [];
    for (let k = 0; k < 5; k++) for (let j = 0; j < 30; j++) drips.push([0.15 + k * 0.17 + 0.01 * Math.sin(j), 0.05 + j * 0.012]);
    panels.push(['Developer drips & warm thumbs', print({ dev: 50, before: (sh) => { brush(sh, 'developer', drips, 16, 1, 4); brush(sh, 'thumb', [[0.3, 0.75], [0.72, 0.8]], 50, 1, 8); } })]);
    return { title: 'Chemigram brushes', subtitle: 'Painting fixer (a resist), developer and a warm thumb onto the plate, after Pierre Cordier’s chemigrams.', panels };
  };

  S['wet-collodion-flaws'] = () => {
    const { st } = bench('collodion', 'forest');
    const panels = [['Input', original()], ['Collodion defaults', print()]];
    Object.assign(st.plate, { pool: 1, comets: 1, oyster: 1, thumb: 1.3, coat: 0.8 });
    st.dev.pour = 0.8;
    panels.push(['Careless pour, dirty bath', print({ seed: 5 })]);
    return { title: 'Wet collodion plate flaws', subtitle: 'Pooling toward the drain corner, comets, oyster-shell drying lines, the uncoated thumb corner and an uneven developer pour.', panels };
  };

  S['grain'] = () => {
    const { st } = bench('drygelatin', 'forest');
    const panels = [['Input', original()]];
    for (const [a, s, label] of [[0, 1, 'No grain'], [0.35, 2, 'Fine'], [0.7, 4, 'Coarse'], [0.95, 6, 'Fried']]) {
      Object.assign(st.grain, { amount: a, size: s });
      panels.push([label, print()]);
    }
    return { title: 'Silver grain (Boolean model)', subtitle: 'Each cell holds a Poisson number of opaque grains whose expected coverage reproduces the density.', panels };
  };

  S['accidents'] = () => {
    const { st } = bench('drygelatin', 'statue');
    const a = app();
    const panels = [['Input', original()], ['Clean plate', print()]];
    fresh(11); a.instantExposure(); E.addLightLeak(a.sheet, a.proc(), 0.9); develop(st.dev.time); a.fixAndWash();
    panels.push(['Light leak', plate()]);
    fresh(13); a.instantExposure(); develop(st.dev.time); a.fixAndWash(); Lab.artifacts.crack(a.sheet);
    panels.push(['Dropped plate', plate()]);
    st.plate.dust = 1;
    addObj('scratches', { amount: 0.8 });
    addObj('dust', { distance: 80, amount: 1 });
    fresh(17); a.instantExposure(); E.addLightLeak(a.sheet, a.proc(), 0.5); develop(st.dev.time); a.fixAndWash(); Lab.artifacts.crack(a.sheet);
    panels.push(['Everything at once', plate()]);
    return { title: 'Accidents', subtitle: 'Light leaks, cracked glass, dust on the plate, a scratched base and dusty glass in the light path.', panels };
  };

  S['ageing'] = () => {
    const { st } = bench('saltprint', 'portrait');
    const panels = [['Input', original()], ['Salt print, new', print()]];
    st.age.years = 120;
    panels.push(['120 years, well fixed', plate()]);
    st.age.years = 0; st.fix.time = 60; st.wash.time = 120;
    print();
    st.age.years = 120;
    panels.push(['120 years, under-fixed & washed', plate()]);
    bench('drygelatin', 'portrait');
    print();
    app().st.age.years = 150;
    panels.push(['Gelatin plate, 150 years', plate()]);
    return { title: 'Ageing', subtitle: 'Fading, residual-hypo staining, print-out darkening of unfixed silver, foxing and silvering-out.', panels, cols: 5 };
  };

  S['daguerreotype-mirror'] = () => {
    const { st } = bench('daguerreotype', 'statue');
    const panels = [['Input', original()]];
    print();
    for (const [env, years, sealed, label] of [[0.02, 0, true, 'Dark surroundings: positive'], [0.55, 0, true, 'Grey surroundings'], [1, 0, true, 'Bright surroundings: negative'], [0.02, 170, false, '170 years unsealed: tarnish']]) {
      Object.assign(st.age, { env, years, sealed });
      panels.push([label, plate()]);
    }
    return { title: 'The daguerreotype mirror', subtitle: 'A polished silver plate reflects its surroundings in the shadows, so it flips between positive and negative.', panels };
  };

  S['toners'] = () => {
    const { st } = bench('drygelatin', 'portrait');
    const panels = [['Input', original()]];
    print();
    for (const [toner, s, label] of [['none', 0, 'Untoned'], ['sepia', 0.7, 'Sepia'], ['selenium', 0.9, 'Selenium'], ['gold', 1, 'Gold']]) {
      Object.assign(st.tone, { toner, strength: s });
      panels.push([label, plate()]);
    }
    return { title: 'Toning', subtitle: 'Sepia attacks the highlights first, selenium the shadows. Every result passes the monochrome chroma ceiling.', panels };
  };

  S['calotype-to-salt-print'] = () => {
    const { layer } = bench('calotype', 'stairs');
    layer.correct = false; layer._cache = null;
    const panels = [['Input', original()]];
    const neg = print();
    panels.push(['1. Calotype paper negative', neg]);
    const negData = U.readDrawable(neg, 1400);
    const a = app();
    a.resetBench('saltprint');
    const l = a.setPicture(negData, 'calotype negative');
    Object.assign(l, { source: 'negative', correct: false, _cache: null });
    panels.push(['2. Salt print through it', print()]);
    a.st.tone.toner = 'sepia'; a.st.tone.strength = 0.6; a.st.age.years = 90;
    panels.push(['3. Sepia, 90 years later', plate()]);
    return { title: 'Two-step print: calotype → salt print', subtitle: 'The finished paper negative goes back into the light path ("Use plate as layer") and is contact-printed.', panels };
  };

  S['heliography'] = () => {
    bench('heliography', 'stairs');
    const panels = [['Input', original()]];
    panels.push(['4 hours', print({ time: 0.5 })]);
    panels.push(['8 hours, 60 s wash', print()]);
    panels.push(['Two days', print({ time: 6 })]);
    panels.push(['Under-washed (15 s)', print({ dev: 15 })]);
    panels.push(['Over-washed (4 min)', print({ dev: 240 })]);
    return { title: 'Heliography (bitumen of Judea on pewter)', subtitle: 'Exposures are measured in hours. The solvent wash removes unhardened bitumen: too little leaves a veil, too much erodes the image.', panels, cols: 3 };
  };

  S['camera-obscura'] = () => {
    const { st } = bench('obscura', 'statue');
    const panels = [['Input', original()]];
    panels.push(['Pinhole, inverted (as projected)', print()]);
    st.aperture.pinhole = 3.5;
    panels.push(['Oversized pinhole', print()]);
    Object.assign(st.aperture, { pinhole: 0.6, invert: false });
    panels.push(['Fine pinhole, turned upright', print({ time: 2 })]);
    return { title: 'Camera obscura', subtitle: 'No chemistry: the averaged projection on ground glass, through a pinhole whose size sets the blur.', panels };
  };

  S['reel-begotten'] = async () => {
    bench('reversal16', 'forest');
    const a = app();
    a.applyRecipe('begotten');
    const src = inputs.forest;
    const img = document.createElement('canvas');
    img.width = src.W; img.height = src.H;
    const id = new ImageData(src.W, src.H);
    for (let i = 0; i < src.W * src.H; i++) { id.data[i * 4] = src.r[i] * 255; id.data[i * 4 + 1] = src.g[i] * 255; id.data[i * 4 + 2] = src.b[i] * 255; id.data[i * 4 + 3] = 255; }
    img.getContext('2d').putImageData(id, 0, 0);
    // A stand-in "video": a slow push-in across the forest, exposing the same seek interface as <video>.
    const frame = document.createElement('canvas');
    frame.width = 480; frame.height = 285;
    const g = frame.getContext('2d');
    let t = 0;
    const drawAt = () => { const z = 1.15 + t * 0.15, w = src.W / z, h = src.H / z; g.drawImage(img, (src.W - w) * (0.2 + t * 0.25), (src.H - h) / 2, w, h, 0, 0, 480, 285); };
    drawAt();
    Object.defineProperties(frame, {
      videoWidth: { value: 480 }, videoHeight: { value: 285 }, duration: { value: 3 },
      currentTime: { get: () => t, set: (v) => { t = v; drawAt(); setTimeout(() => frame.dispatchEvent(new Event('seeked')), 0); } },
    });
    const inputFrame = document.createElement('canvas');
    inputFrame.width = 480; inputFrame.height = 285;
    inputFrame.getContext('2d').drawImage(frame, 0, 0);
    Object.assign(a.st.reel, { start: 0, duration: 2, fps: 12, width: 480, stepPrint: 1 });
    const reel = await Lab.reel.developReel(a.st, a.proc(), frame, a.st.reel, () => {}, () => false);
    const panels = [['Input frame', inputFrame]];
    for (const k of [0, 5, 10, 15, reel.frames.length - 1]) {
      const bmp = await createImageBitmap(reel.frames[k]);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      panels.push([`Frame ${k + 1}`, c]);
    }
    return { title: 'Film reel: Begotten-style recipe', subtitle: 'Every frame printed through the bench, two generations of re-photography, gate weave, flicker, scratches, dust and frame slip.', panels, cols: 3 };
  };

  window.Demo = {
    loadInputs,
    list: () => Object.keys(S),
    run: async (name) => sheetOf(await S[name]()),
  };
})();
