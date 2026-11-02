'use strict';
// The bench: UI wiring, the interactive exposure / development clock, tools and recipes.
(function (Lab) {
  const U = Lab.util, O = Lab.optics, E = Lab.emulsion, R = Lab.render, A = Lab.artifacts, P = Lab.processes;
  const $ = (s) => document.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    for (const k of kids) e.append(k);
    return e;
  };

  const st = {
    processId: 'drygelatin', grade: 1, paperLong: 768, aspect: 0.8,
    lamp: { intensity: 1, x: 0, y: 0, height: 1.4, size: 0.3, condenser: 0.5, flicker: 0, travelX: 0, travelY: 0 },
    aperture: { shape: 'round', fstop: 8, focus: 100, pinhole: 1, softness: 0, fieldCurve: 0, vignette: 0.3, camVignette: 0, invert: false },
    exposure: { time: 4, clock: 1, halation: 0.15 },
    plate: {}, grain: { size: 2, amount: 0.15 },
    dev: { temp: 20, time: 180, clock: 20, agitation: 'gentle', uneven: 0.25, pour: 0, drag: 0.3 },
    flash: { strength: 0.6, mackie: 0.6 },
    fix: { time: 300 }, wash: { time: 1200 },
    tone: { toner: 'none', strength: 0.5 },
    age: { years: 0, sealed: false, env: 0.03 },
    tool: { name: 'dodge', radius: 50, soft: 30, strength: 0.8 },
    view: 'plate', splitAt: 0.5,
    reel: { start: 0, duration: 3, fps: 18, width: 480, generations: 1, weave: 0.5, flicker: 0.4, scratches: 0.4, dust: 0.4, slip: 0.2, exhaustion: 0.3, stepPrint: 1, stockSeed: 1234 },
    layers: [], sel: null,
  };

  let sheet = null, sess = null, mode = 'idle', lastRecip = 0;
  const hand = { active: false, x: 0, y: 0, tool: 'dodge', radius: 50, soft: 30, strength: 0.8 };
  const bindings = [];
  const canvas = $('#plate'), ctx = canvas.getContext('2d');
  const overlay = $('#overlay'), octx = overlay.getContext('2d');

  const proc = () => {
    const b = P[st.processId];
    return Object.assign({}, b, { gamma: b.gamma * st.grade });
  };

  // ---------- formatting & logging ----------
  function fmtTime(s) {
    if (s < 1) return s.toFixed(2) + ' s';
    if (s < 60) return s.toFixed(1) + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
    if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min';
    return (s / 86400).toFixed(1) + ' days';
  }
  function log(msg) {
    const ul = $('#log');
    if (!ul) return;
    ul.prepend(el('li', { textContent: msg }));
    while (ul.children.length > 80) ul.lastChild.remove();
  }

  // ---------- control builders ----------
  function path(p) {
    const ks = p.split('.');
    return [() => ks.reduce((o, k) => o[k], st), (v) => { const o = ks.slice(0, -1).reduce((o, k) => o[k], st); o[ks[ks.length - 1]] = v; }];
  }
  function row(parent, label, tip, wide) {
    const r = el('label', { className: 'row' + (wide ? ' wide' : ''), title: tip || '' }, el('span', { textContent: label }));
    parent.append(r);
    return r;
  }
  function slider(parent, label, p, min, max, step, o = {}, list = bindings) {
    const [get, set] = typeof p === 'string' ? path(p) : p;
    const r = row(parent, label, o.tip);
    const inp = el('input', { type: 'range', min, max, step });
    const out = el('output');
    r.append(inp, out);
    const toUI = (v) => (o.log ? Math.log10(v) : v), fromUI = (v) => (o.log ? Math.pow(10, v) : v);
    const fmt = o.fmt || ((v) => (+v).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0));
    const refresh = () => { const v = get(); inp.value = toUI(v); out.textContent = fmt(v); };
    inp.addEventListener('input', () => { const v = fromUI(+inp.value); set(v); out.textContent = fmt(v); if (o.on) o.on(v); changed(o.kind || 'look'); });
    refresh();
    list.push(refresh);
    return { refresh, inp };
  }
  function select(parent, label, p, options, o = {}, list = bindings) {
    const [get, set] = typeof p === 'string' ? path(p) : p;
    const r = row(parent, label, o.tip, true);
    const s = el('select');
    for (const [v, t] of options) s.append(el('option', { value: v, textContent: t }));
    r.append(s);
    const refresh = () => { s.value = get(); };
    s.addEventListener('change', () => { set(s.value); if (o.on) o.on(s.value); changed(o.kind || 'look'); });
    refresh();
    list.push(refresh);
    return { refresh, s };
  }
  function check(parent, label, p, o = {}, list = bindings) {
    const [get, set] = typeof p === 'string' ? path(p) : p;
    const r = row(parent, label, o.tip, true);
    const c = el('input', { type: 'checkbox' });
    r.append(c);
    const refresh = () => { c.checked = !!get(); };
    c.addEventListener('change', () => { set(c.checked); if (o.on) o.on(c.checked); changed(o.kind || 'look'); });
    refresh();
    list.push(refresh);
  }
  function button(parent, label, fn, cls, tip) {
    const b = el('button', { textContent: label, className: cls || '', title: tip || '' });
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  }
  function section(parent, title, open = true) {
    const d = el('details', { open });
    d.append(el('summary', { textContent: title }));
    parent.append(d);
    return d;
  }
  const refreshAll = () => bindings.forEach((f) => f());

  // ---------- change scheduling ----------
  let lookTimer = 0, projTimer = 0;
  function changed(kind) {
    if (kind === 'none') return;
    if (kind === 'optics' && st.view === 'projection') { clearTimeout(projTimer); projTimer = setTimeout(drawProjection, 120); return; }
    if (mode === 'exposing') return;
    if (mode === 'developing' && st.view === 'plate') return;
    clearTimeout(lookTimer);
    lookTimer = setTimeout(draw, 90);
  }

  // ---------- sheet & drawing ----------
  function sheetDims() {
    const L = st.paperLong;
    return st.aspect >= 1 ? [L, Math.round(L / st.aspect)] : [Math.round(L * st.aspect), L];
  }
  function newSheet(msg) {
    const [W, H] = sheetDims();
    sheet = E.newSheet(W, H);
    sess = null; mode = 'idle';
    for (const c of [canvas, overlay]) { c.width = W; c.height = H; }
    if (msg !== false) log(`Fresh ${P[st.processId].name} plate, ${W}×${H}.`);
    draw();
    updateActions();
  }

  function liveSheet(p) {
    const tmp = Float32Array.from(sheet.latent);
    const sens = A.sensitivity(sheet, st, p);
    const rf = E.reciprocityFactor(Math.max(sess.elapsed, 1e-6), p);
    for (let i = 0; i < tmp.length; i++) tmp[i] += sess.raw[i] * sens[i] * rf;
    return Object.assign({}, sheet, { latent: tmp, cache: Object.assign({}, sheet.cache, { dens: null }) });
  }

  function plateRGBA() {
    const p = proc();
    const sh = sess && (p.dev.mode === 'printout' || p.dev.mode === 'none') ? liveSheet(p) : sheet;
    return R.toRGBA(sh, st, p, R.compose(sh, st, p));
  }
  function drawPlate() {
    const W = sheet.W, H = sheet.H;
    if (st.view === 'original') {
      ctx.putImageData(new ImageData(O.originalView(st, W, H), W, H), 0, 0);
      return;
    }
    const rgba = plateRGBA();
    if (st.view === 'split') {
      // Left of the wipe: original; right: the plate.
      const orig = O.originalView(st, W, H);
      const sx = Math.round(st.splitAt * W);
      for (let y = 0; y < H; y++) {
        const row = y * W * 4;
        rgba.set(orig.subarray(row, row + sx * 4), row);
      }
    }
    ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
    if (st.view === 'split') {
      const sx = Math.round(st.splitAt * W);
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip();
      R.drawCracks(ctx, sheet);
      ctx.restore();
      ctx.fillStyle = '#e8b56a'; ctx.fillRect(sx - 1, 0, 2, H);
      ctx.font = '12px Georgia, serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - 74, 6, 68, 18); ctx.fillRect(sx + 6, 6, 46, 18);
      ctx.fillStyle = '#f0e2cc'; ctx.fillText('ORIGINAL', sx - 70, 19); ctx.fillText('PLATE', sx + 10, 19);
    } else R.drawCracks(ctx, sheet);
  }
  // Always the real plate, regardless of the comparison view on screen.
  function plateCanvas() {
    const c = el('canvas', { width: sheet.W, height: sheet.H });
    const g = c.getContext('2d');
    g.putImageData(new ImageData(plateRGBA(), sheet.W, sheet.H), 0, 0);
    R.drawCracks(g, sheet);
    return c;
  }
  function drawProjection() {
    const p = proc();
    const Ep = O.projection(st, p, sheet.W, sheet.H);
    ctx.putImageData(new ImageData(R.projectionRGBA(Ep, sheet.W, sheet.H), sheet.W, sheet.H), 0, 0);
  }
  function draw() {
    if (!sheet) return;
    if (st.view === 'projection' && mode !== 'developing') drawProjection();
    else drawPlate();
    updateStatus();
  }

  function updateStatus() {
    const p = proc();
    const parts = [`${p.name}`, `state: ${sheet.state}${mode !== 'idle' ? ' (' + mode + ')' : ''}`];
    if (sess) parts.push(`exposing ${fmtTime(sess.elapsed)} / ${fmtTime(sess.T)}`);
    else if (sheet.exposures) parts.push(`${sheet.exposures} exposure(s), ${fmtTime(sheet.totalExposure)} total`);
    if (sheet.fullD) parts.push(`${p.dev.label}: ${fmtTime(sheet.devTime)} @ ${st.dev.temp}°C`);
    if (lastRecip > 0.01) parts.push(`reciprocity loss ${(lastRecip * 100).toFixed(0)}%`);
    $('#status').textContent = parts.join('  ·  ');
    updateNext();
  }

  // ---------- exposure ----------
  function startExposure() {
    if (mode !== 'idle') return;
    if (sheet.state !== 'blank' && sheet.state !== 'exposed') return log('This plate has already been in the developer. Start a fresh plate.');
    sess = O.beginSession(st, proc(), sheet);
    mode = 'exposing';
    log(`Lens uncapped: ${fmtTime(sess.T)} at ${st.aperture.shape === 'pinhole' ? 'pinhole' : 'f/' + st.aperture.fstop}. Hold the mouse on the plate to ${hand.tool === 'burn' ? 'burn through a card' : 'dodge with your hand'}.`);
    updateActions();
  }
  function finishExposure() {
    const p = proc();
    const r = E.commitSession(sheet, sess, st, p);
    lastRecip = r.recipLoss;
    log(`Exposure done: ${fmtTime(sess.elapsed)}${r.recipLoss > 0.01 ? `, reciprocity failure ate ${(r.recipLoss * 100).toFixed(0)}% of the light` : ''}.${p.dev.mode === 'printout' ? ' The image printed out as you watched.' : p.dev.mode === 'none' ? '' : ' The latent image is invisible until developed.'}`);
    sess = null; mode = 'idle';
    draw(); updateActions();
  }
  function instantExposure() {
    if (mode !== 'idle') return;
    if (sheet.state !== 'blank' && sheet.state !== 'exposed') return log('This plate has already been developed. Start a fresh plate.');
    sess = O.runInstant(st, proc(), sheet);
    finishExposure();
  }

  // ---------- development ----------
  function canDevelop() {
    const m = proc().dev.mode;
    return m === 'liquid' || m === 'fume' || m === 'solvent';
  }
  function intoTray() {
    if (mode !== 'idle' || !canDevelop()) return;
    if (sheet.fullD) return log('Already developed — fix it or start a fresh plate.');
    E.startDevelop(sheet, st, proc());
    mode = 'developing';
    log(`Into the ${proc().dev.label.toLowerCase()}. Watch the image come up and pull it when it looks right.`);
    updateActions();
  }
  function pull() {
    if (mode !== 'developing') return;
    mode = 'idle'; sheet.state = 'developed';
    log(`Pulled after ${fmtTime(sheet.devTime)} (recommended ≈ ${fmtTime(st.dev.time)}).`);
    draw(); updateActions();
  }
  function instantDevelop() {
    if (mode !== 'idle' || !canDevelop() || sheet.fullD) return;
    const p = proc();
    E.startDevelop(sheet, st, p);
    const n = 40;
    for (let k = 0; k < n; k++) E.devStep(sheet, st, p, st.dev.time / n);
    sheet.state = 'developed';
    log(`Developed for ${fmtTime(st.dev.time)} at ${st.dev.temp}°C, agitation ${st.dev.agitation}.`);
    draw(); updateActions();
  }
  function doFlash() {
    if (mode !== 'developing' || proc().dev.mode !== 'liquid') return;
    E.flash(sheet, st, proc(), st.flash.strength);
    log('Flashed the room light mid-development (Sabattier). Tones begin to reverse; Mackie lines form at the edges.');
  }
  function fixAndWash() {
    if (mode === 'developing') pull();
    if (mode !== 'idle') return;
    const p = proc();
    sheet.fixQ = p.fixRef > 0 ? U.clamp(st.fix.time / p.fixRef, 0, 1) : 1;
    sheet.washQ = p.washRef > 0 ? U.clamp(st.wash.time / p.washRef, 0, 1) : 1;
    sheet.state = 'fixed';
    if (!sheet.fullD && canDevelop()) log('Fixed without developing: the latent image is dissolved away. A blank, haunted plate.');
    log(`Fixed ${fmtTime(st.fix.time)} (${(sheet.fixQ * 100).toFixed(0)}% complete), washed ${fmtTime(st.wash.time)} (${(sheet.washQ * 100).toFixed(0)}%).${sheet.fixQ < 0.9 ? ' Residual silver salts will darken and stain with age.' : ''}`);
    draw(); updateActions();
  }

  // ---------- main clock ----------
  let last = performance.now(), acc = 0, renderAcc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt; renderAcc += dt;
    if (mode === 'exposing' && acc >= 0.05) {
      const done = O.stepSession(st, sess, acc * st.exposure.clock, hand);
      acc = 0;
      const p = proc();
      if (p.dev.mode === 'printout' || p.dev.mode === 'none') { if (renderAcc > 0.25) { drawPlate(); renderAcc = 0; } }
      else ctx.putImageData(new ImageData(R.projectionRGBA(sess.E, sheet.W, sheet.H), sheet.W, sheet.H), 0, 0);
      updateStatus();
      if (done) finishExposure();
    } else if (mode === 'developing' && acc >= 0.1) {
      E.devStep(sheet, st, proc(), acc * st.dev.clock);
      acc = 0;
      if (renderAcc > 0.2) { drawPlate(); updateStatus(); renderAcc = 0; }
    } else if (mode === 'idle') acc = 0;
    drawOverlay();
    requestAnimationFrame(loop);
  }

  // ---------- pointer tools ----------
  let pointer = null;
  function toSheet(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * sheet.W, ((e.clientY - r.top) / r.height) * sheet.H];
  }
  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (!pointer) return;
    octx.strokeStyle = 'rgba(176,54,42,0.8)';
    octx.lineWidth = 1.5;
    octx.beginPath(); octx.arc(pointer[0], pointer[1], st.tool.radius, 0, Math.PI * 2); octx.stroke();
    if (st.tool.soft > 0) {
      octx.setLineDash([3, 4]);
      octx.beginPath(); octx.arc(pointer[0], pointer[1], st.tool.radius + st.tool.soft, 0, Math.PI * 2); octx.stroke();
      octx.setLineDash([]);
    }
  }
  function applyTool(x, y, erase) {
    const t = st.tool.name;
    Object.assign(hand, { x, y, tool: t, radius: st.tool.radius, soft: st.tool.soft, strength: st.tool.strength });
    if (t === 'dodge' || t === 'burn') { hand.active = mode === 'exposing'; return; }
    if (['developer', 'fixer', 'water', 'thumb'].includes(t)) {
      if (sheet.state === 'fixed') return;
      E.chemBrush(sheet, x, y, t, st.tool.radius, st.tool.strength);
      if (mode !== 'developing') changed('look');
      return;
    }
    if (t === 'mask') paintMask(x, y, erase);
  }
  function paintMask(x, y, erase) {
    const l = st.layers.find((q) => q.id === st.sel);
    if (!l || l.kind !== 'mask') return log('Select a "Paintable card" layer to paint on it.');
    const pr = O.procSize(l, sheet.W, sheet.H);
    const W = pr.W, H = pr.H;
    // Inverse of the layer placement transform (without drift/parallax).
    const cx = sheet.W / 2 + l.x * sheet.W, cy = sheet.H / 2 + l.y * sheet.H;
    const s = l.scale * Math.max(sheet.W / W, sheet.H / H);
    const a = (l.rotation * Math.PI) / 180;
    const dx = x - cx, dy = y - cy;
    const u = (Math.cos(a) * dx + Math.sin(a) * dy) / s + W / 2, v = (-Math.sin(a) * dx + Math.cos(a) * dy) / s + H / 2;
    const r = st.tool.radius / s, soft = Math.max(1, st.tool.soft / s);
    for (let yy = Math.max(0, (v - r - soft) | 0); yy < Math.min(H, v + r + soft); yy++)
      for (let xx = Math.max(0, (u - r - soft) | 0); xx < Math.min(W, u + r + soft); xx++) {
        const disc = 1 - U.smoothstep(r - soft, r + soft, Math.hypot(xx - u, yy - v));
        const i = yy * W + xx;
        pr.T[i] = erase ? Math.max(pr.T[i], disc) : Math.min(pr.T[i], 1 - disc * st.tool.strength);
      }
    l.version++; l._cache = null;
    changed('optics');
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toSheet(e);
    pointer = [x, y];
    hand.down = true;
    applyTool(x, y, e.shiftKey);
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toSheet(e);
    pointer = [x, y];
    if (hand.down) applyTool(x, y, e.shiftKey);
  });
  const up = () => { hand.down = false; hand.active = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { pointer = null; });

  // ---------- layers ----------
  function addLayer(l) {
    st.layers.push(l);
    st.sel = l.id;
    if (l.kind === 'image' && !st.layers.some((q) => q !== l && q.kind === 'image')) {
      l.reelSource = true;
      st.aspect = l.img.W / l.img.H;
      newSheet(false);
    }
    renderLayers();
    changed('optics'); changed('look');
  }
  async function loadLayerFile(file) {
    const img = await U.loadImageFile(file);
    const data = U.readDrawable(img, 1600);
    const l = O.makeImageLayer(data, file.name.replace(/\.[^.]+$/, ''));
    l.source = $('#srcKind').value;
    removeDemo();
    addLayer(l);
    log(`Loaded "${l.name}" as a ${l.source} transparency at ${l.distance} mm.`);
  }

  // The demo transparency would otherwise stay sandwiched under the user's own material.
  function removeDemo() {
    const had = st.layers.some((l) => l.demo);
    if (!had) return;
    st.layers = st.layers.filter((l) => !l.demo);
    if (st.layers.every((l) => l.id !== st.sel)) st.sel = null;
    log('Removed the demo transparency from the light path.');
  }

  function renderLayers() {
    const list = $('#layerList');
    list.innerHTML = '';
    st.layers.forEach((l, i) => {
      const vis = el('input', { type: 'checkbox', checked: l.visible, title: 'In the light path' });
      vis.addEventListener('click', (e) => e.stopPropagation());
      vis.addEventListener('change', () => { l.visible = vis.checked; changed('optics'); changed('look'); });
      const div = el('div', { className: 'layer' + (l.id === st.sel ? ' sel' : '') }, vis,
        el('span', { className: 'nm', textContent: l.name }), el('span', { className: 'd', textContent: `${l.distance} mm` }));
      const mk = (t, fn, tip) => { const b = el('button', { textContent: t, title: tip }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); div.append(b); };
      mk('↑', () => { if (i > 0) { [st.layers[i - 1], st.layers[i]] = [st.layers[i], st.layers[i - 1]]; renderLayers(); } }, 'Move up');
      mk('✕', () => { st.layers.splice(i, 1); if (st.sel === l.id) st.sel = null; renderLayers(); changed('optics'); changed('look'); }, 'Remove from the light path');
      div.addEventListener('click', () => { st.sel = l.id; renderLayers(); });
      list.append(div);
    });
    renderLayerEditor();
  }

  function renderLayerEditor() {
    const ed = $('#layerEditor');
    ed.innerHTML = '';
    const l = st.layers.find((q) => q.id === st.sel);
    if (!l) { ed.append(el('p', { className: 'hint', textContent: 'Select a layer to place it in the light path.' })); return; }
    const lb = [];
    const k = (key) => [() => l[key], (v) => { l[key] = v; }];
    const o = (extra) => Object.assign({ kind: 'optics', on: () => { renderListLabels(); } }, extra);
    const nm = el('input', { type: 'text', value: l.name });
    nm.addEventListener('input', () => { l.name = nm.value; renderListLabels(); });
    row(ed, 'Name', '', true).append(nm);
    ed.append(el('p', { className: 'hint', textContent: O.LAYER_KINDS[l.kind] }));
    slider(ed, 'Distance (mm)', k('distance'), 0, 300, 1, o({ tip: 'Distance in front of the aperture. Blur grows with distance from the focus plane; off-axis lamps make out-of-focus layers shift (parallax).' }), lb);
    slider(ed, 'Offset X', k('x'), -0.5, 0.5, 0.005, o(), lb);
    slider(ed, 'Offset Y', k('y'), -0.5, 0.5, 0.005, o(), lb);
    slider(ed, 'Scale', k('scale'), 0.2, 3, 0.01, o(), lb);
    slider(ed, 'Rotation°', k('rotation'), -180, 180, 1, o(), lb);
    slider(ed, 'Opacity', k('strength'), 0, 1, 0.01, o({ tip: 'How strongly this layer blocks light' }), lb);
    if (l.kind === 'image') {
      select(ed, 'This scan is a', k('source'), [['positive', 'Positive (normal photo)'], ['negative', 'Negative (film scan)']], { kind: 'optics' }, lb);
      check(ed, 'Correct polarity', k('correct'), { kind: 'optics', tip: 'Copy through an intermediate (internegative / interpositive) so the result reads the right way round. Off = physically raw.' }, lb);
      slider(ed, 'Contrast', k('contrast'), 0.3, 3, 0.01, o({ tip: 'Density range of the transparency' }), lb);
      check(ed, 'Reel source', k('reelSource'), { kind: 'none', tip: 'Video frames replace this layer when developing a reel', on: (v) => { if (v) st.layers.forEach((q) => { if (q !== l) q.reelSource = false; }); } }, lb);
    } else if (l.kind !== 'mask') {
      slider(ed, 'Amount', k('amount'), 0, 1, 0.01, o(), lb);
      const b = el('div', { className: 'btns' });
      button(b, 'Re-scatter', () => { l.seed = (Math.random() * 1e9) | 0; changed('optics'); changed('look'); });
      ed.append(b);
    } else {
      const b = el('div', { className: 'btns' });
      button(b, 'Clear card', () => { if (l.proc) l.proc.T.fill(1); l.version++; l._cache = null; changed('optics'); });
      ed.append(b, el('p', { className: 'hint', textContent: 'Choose the "Paint card" tool and draw on the easel (shift = cut away). Switch the view to Projection to see it.' }));
    }
    ed.append(el('p', { className: 'hint', textContent: 'Time in the light path (fraction of the exposure). Absent = removed from the path.' }));
    slider(ed, 'Enters at', k('start'), 0, 1, 0.01, o(), lb);
    slider(ed, 'Leaves at', k('end'), 0, 1, 0.01, o(), lb);
    slider(ed, 'Drift X', k('driftX'), -0.3, 0.3, 0.005, o({ tip: 'Movement across the whole exposure (a sitter who moved, a cloud, a sliding card)' }), lb);
    slider(ed, 'Drift Y', k('driftY'), -0.3, 0.3, 0.005, o(), lb);
    slider(ed, 'Tremble', k('tremble'), 0, 3, 0.01, o({ tip: 'Random shaking during exposure: a nervous sitter, a bumped enlarger' }), lb);
  }
  function renderListLabels() {
    const items = document.querySelectorAll('#layerList .layer');
    st.layers.forEach((l, i) => {
      if (!items[i]) return;
      items[i].querySelector('.nm').textContent = l.name;
      items[i].querySelector('.d').textContent = `${l.distance} mm`;
    });
  }

  // ---------- process selection ----------
  function selectProcess(id, quiet) {
    st.processId = id;
    const p = P[id];
    st.exposure.time = p.t0;
    st.exposure.clock = p.clock;
    st.plate = Object.assign({ dust: 0.1 }, p.artifacts);
    st.grain = Object.assign({}, p.grain);
    st.dev.temp = p.dev.temp;
    st.dev.time = p.dev.time;
    st.dev.clock = Math.max(1, Math.round(p.dev.time / 8));
    st.fix.time = p.fixRef; st.wash.time = p.washRef;
    Object.assign(st.aperture, p.aperture);
    st.lamp.travelX = p.lampTravel ? 2.2 : 0;
    st.lamp.travelY = 0;
    st.layers.forEach((l) => { l._cache = null; });
    $('#procBlurb').textContent = `${p.era}. ${p.blurb}`;
    refreshAll();
    newSheet(!quiet);
  }

  // ---------- demo scene (so the bench works before anything is loaded) ----------
  function demoScene() {
    const c = el('canvas', { width: 640, height: 800 });
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 800);
    bg.addColorStop(0, '#3a3530'); bg.addColorStop(1, '#141210');
    g.fillStyle = bg; g.fillRect(0, 0, 640, 800);
    g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = 3;
    for (const [x, y] of [[0, 0], [640, 0], [0, 800], [640, 800]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(320 + (x - 320) * 0.3, 360 + (y - 360) * 0.3); g.stroke(); }
    const door = g.createRadialGradient(320, 330, 10, 320, 330, 160);
    door.addColorStop(0, '#fffaf0'); door.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = '#d8d2c4'; g.fillRect(262, 220, 116, 250);
    g.fillStyle = door; g.fillRect(140, 160, 360, 380);
    g.fillStyle = '#0a0908';
    g.beginPath(); g.ellipse(320, 300, 17, 22, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(296, 325); g.lineTo(344, 325); g.lineTo(360, 470); g.lineTo(280, 470); g.closePath(); g.fill();
    g.fillStyle = '#5d564c'; g.fillRect(40, 600, 560, 12);
    g.fillStyle = '#b8a890'; g.beginPath(); g.ellipse(470, 640, 30, 40, 0.3, 0, Math.PI * 2); g.fill();
    return U.readDrawable(c, 1600);
  }

  // ---------- recipes (starting points only — you still expose and develop) ----------
  const DEFAULTS = JSON.parse(JSON.stringify({ lamp: st.lamp, aperture: st.aperture, dev: st.dev, flash: st.flash, tone: st.tone, age: st.age, reel: st.reel }));
  function resetBench(id) {
    for (const k in DEFAULTS) st[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    st.grade = 1;
    st.layers = st.layers.filter((l) => l.kind === 'image');
    for (const l of st.layers) Object.assign(l, { distance: 100, x: 0, y: 0, scale: 1, rotation: 0, strength: 1, start: 0, end: 1, driftX: 0, driftY: 0, tremble: 0, contrast: 1, correct: true, _cache: null });
    selectProcess(id, true);
    renderLayers();
  }
  const RECIPES = {
    blank: { name: 'Clean bench (gelatin dry plate)', fn() { resetBench('drygelatin'); } },
    spirit: {
      name: 'Spirit photograph (muslin double exposure)',
      fn() {
        resetBench('collodion');
        const m = O.makeProcLayer('muslin'); m.start = 0.4; m.end = 1; m.distance = 115; m.strength = 0.9;
        addLayer(m);
        const img = st.layers.find((l) => l.kind === 'image'); if (img) img.tremble = 0.2;
        log('Recipe: the muslin veil enters the light path for the last 60% of the exposure. Try dragging its offsets, then expose.');
      },
    },
    legras: {
      name: 'Window at Le Gras (heliography, sun crosses the sky)',
      fn() { resetBench('heliography'); st.lamp.height = 1.0; refreshAll(); log('Recipe: an 8-hour exposure on bitumen. The lamp (sun) travels during exposure so shadows fall both ways. Wash in solvent and stop before it erodes.'); },
    },
    dag: {
      name: 'Restless sitter (daguerreotype, aged unsealed)',
      fn() {
        resetBench('daguerreotype');
        const img = st.layers.find((l) => l.kind === 'image'); if (img) { img.tremble = 0.5; img.driftX = 0.015; }
        st.age.years = 150; st.age.sealed = false; refreshAll();
        log('Recipe: a long sitting with a sitter who could not hold still, then 150 years of tarnish. Change "Surroundings" to flip the mirror between positive and negative.');
      },
    },
    calotype: {
      name: 'Calotype → salt print (two-step)',
      fn() { resetBench('calotype'); st.layers.forEach((l) => { if (l.kind === 'image') { l.correct = false; l._cache = null; } }); renderLayers(); log('Recipe: expose & develop the paper negative, fix it, then "Use plate as layer", switch the process to Salted paper and print through it.'); },
    },
    sabattier: {
      name: 'Sabattier nightmare (flash mid-development)',
      fn() { resetBench('drygelatin'); st.flash.strength = 0.7; st.flash.mackie = 0.9; st.dev.agitation = 'none'; st.dev.drag = 0.6; refreshAll(); log('Recipe: expose, put the plate in the tray, and press "Flash light" about a third of the way through development.'); },
    },
    begotten: {
      name: 'Begotten-style reel (16mm, re-photographed)',
      fn() {
        resetBench('reversal16');
        st.grade = 1.6; st.grain.amount = 0.55; st.dev.uneven = 0.6; st.dev.agitation = 'none'; st.dev.drag = 0.5;
        Object.assign(st.reel, { fps: 18, generations: 2, weave: 1, flicker: 0.7, scratches: 0.7, dust: 0.7, slip: 0.3, exhaustion: 0.5, stepPrint: 2 });
        addLayer(O.makeProcLayer('scratches'));
        const d = O.makeProcLayer('dust'); d.amount = 0.7; addLayer(d);
        refreshAll();
        log('Recipe: harsh contrast, heavy grain, two generations of re-photography and a sick film transport. Load a video in section 9 · Video reel.');
      },
    },
  };

  // ---------- build UI ----------
  function buildLeft() {
    const left = $('#left');
    const s1 = section(left, '1 · Load your picture');
    s1.append(el('p', { className: 'hint', textContent: 'Start here. Choose what kind of picture it is, then load it. (A demo picture is loaded so you can practise.)' }));
    const sk = row(s1, 'My picture is a', '', true);
    sk.append(el('select', { id: 'srcKind' }, el('option', { value: 'positive', textContent: 'Normal photo (positive)' }), el('option', { value: 'negative', textContent: 'Scanned film negative' })));
    const fileRow = row(s1, 'Load picture', '', true);
    const fi = el('input', { type: 'file', accept: 'image/*' });
    fi.addEventListener('change', () => { if (fi.files[0]) loadLayerFile(fi.files[0]); fi.value = ''; });
    fileRow.append(fi);
    s1.append(el('p', { className: 'hint', textContent: 'In the light path (everything the light passes through; click one to select it):' }));
    s1.append(el('div', { id: 'layerList' }));
    const addRow = row(s1, 'Add an object', 'Optional: dust, scratches, a ghostly veil, a frame, or a card you paint', true);
    const ks = el('select');
    for (const k in O.LAYER_KINDS) if (k !== 'image') ks.append(el('option', { value: k, textContent: O.LAYER_KINDS[k] }));
    const ab = el('button', { textContent: 'Add' });
    ab.addEventListener('click', () => addLayer(O.makeProcLayer(ks.value)));
    addRow.append(el('div', { className: 'btns' }, ks, ab));
    const ld = el('details', { id: 'layerDetails' });
    ld.append(el('summary', { textContent: 'Adjust selected layer (move, blur, ghost, shake) — optional' }), el('div', { id: 'layerEditor', className: 'editor' }));
    s1.append(ld);

    const s2 = section(left, '2 · Choose a process');
    select(s2, 'Process', 'processId', Object.keys(P).map((k) => [k, P[k].name]), { on: (v) => selectProcess(v) });
    s2.append(el('p', { className: 'blurb', id: 'procBlurb' }));
    select(s2, 'Plate size', [() => String(st.paperLong), (v) => { st.paperLong = +v; }], [['512', 'Quarter (512 px, fastest)'], ['768', 'Half (768 px)'], ['1024', 'Whole (1024 px)'], ['1536', 'Mammoth (1536 px, slow)']], { on: () => newSheet(), kind: 'none' });
    slider(s2, 'Contrast grade', 'grade', 0.4, 2.5, 0.05, { tip: 'Multiplies the emulsion gamma (like paper grades 0–5). Applies to the next development.' });
    const b2 = el('div', { className: 'btns' });
    button(b2, 'Fresh plate', () => newSheet(), 'primary', 'Replace the plate with a new, unexposed one (your setup stays)');
    s2.append(b2, el('p', { className: 'hint', textContent: 'Then use the buttons under the plate. Sections 3–5 are optional fine-tuning.' }));

    const s3 = section(left, '3 · Lamp (optional)', false);
    slider(s3, 'Intensity', 'lamp.intensity', 0.05, 4, 0.01, { kind: 'optics' });
    slider(s3, 'Lamp X', 'lamp.x', -1.5, 1.5, 0.01, { kind: 'optics', tip: 'Off-axis lamp: uneven light (inverse square × cosine) and parallax shift of defocused layers' });
    slider(s3, 'Lamp Y', 'lamp.y', -1.5, 1.5, 0.01, { kind: 'optics' });
    slider(s3, 'Lamp height', 'lamp.height', 0.3, 4, 0.01, { kind: 'optics', tip: 'Closer lamp = harsher falloff' });
    slider(s3, 'Lamp size', 'lamp.size', 0, 2, 0.01, { kind: 'optics', tip: 'Diffuse sources soften out-of-focus layers (penumbra)' });
    slider(s3, 'Condenser', 'lamp.condenser', 0, 1, 0.01, { kind: 'optics', tip: 'Callier effect: specular light raises negative contrast (Q up to ~1.45)' });
    slider(s3, 'Flicker', 'lamp.flicker', 0, 1, 0.01, { kind: 'none', tip: 'Gas lamp / candle instability during exposure' });
    slider(s3, 'Travel X', 'lamp.travelX', -3, 3, 0.01, { kind: 'none', tip: 'Lamp (or sun) moves across during the exposure' });
    slider(s3, 'Travel Y', 'lamp.travelY', -3, 3, 0.01, { kind: 'none' });

    const s4 = section(left, '4 · Aperture & lens (optional)', false);
    select(s4, 'Aperture', 'aperture.shape', [['round', 'Round iris'], ['pinhole', 'Pinhole'], ['hslit', 'Horizontal slit'], ['vslit', 'Vertical slit']], { kind: 'optics' });
    slider(s4, 'f-number', 'aperture.fstop', 1.4, 256, 0.1, { kind: 'optics', log: true, fmt: (v) => 'f/' + v.toFixed(v < 10 ? 1 : 0), tip: 'Depth of field: wider aperture = more blur for layers off the focus plane' });
    slider(s4, 'Focus at (mm)', 'aperture.focus', 0, 300, 1, { kind: 'optics' });
    slider(s4, 'Pinhole size', 'aperture.pinhole', 0.2, 4, 0.01, { kind: 'optics', tip: '1 = Rayleigh optimum; smaller diffracts, larger blurs' });
    slider(s4, 'Lens softness', 'aperture.softness', 0, 3, 0.01, { kind: 'optics', tip: 'Spherical aberration / dirty lens' });
    slider(s4, 'Field curvature', 'aperture.fieldCurve', 0, 2, 0.01, { kind: 'none', tip: 'Petzval-era lenses: sharp centre, smeared corners' });
    slider(s4, 'Camera vignette', 'aperture.camVignette', 0, 1, 0.01, { kind: 'optics', tip: 'Dark corners: the cos⁴ falloff of the camera that took the original picture' });
    slider(s4, 'Enlarger falloff', 'aperture.vignette', 0, 1, 0.01, { kind: 'optics', tip: 'cos⁴ falloff of the printing lens: less light at the corners (lighter corners on negative-working plates, darker on positive plates)' });
    check(s4, 'Invert image', 'aperture.invert', { kind: 'optics', tip: 'A real lens or pinhole turns the image upside down' });

    const s5 = section(left, '5 · Plate flaws & grain (optional)', false);
    slider(s5, 'Graininess', 'grain.amount', 0, 1, 0.01, { tip: 'Coverage per grain in the stochastic (Boolean) grain model' });
    slider(s5, 'Grain size', 'grain.size', 1, 6, 0.1, { tip: 'Clump size of the developed silver (px)' });
    slider(s5, 'Coating uneven', 'plate.coat', 0, 1, 0.01, { kind: 'none', tip: 'Thickness variations of the hand-coated emulsion (applies to next exposure)' });
    slider(s5, 'Pour pooling', 'plate.pool', 0, 1, 0.01, { kind: 'none', tip: 'Emulsion pooling toward the drain corner, with streaks (next exposure)' });
    slider(s5, 'Thumb corner', 'plate.thumb', 0, 1, 0.01, { kind: 'none', tip: 'Uncoated corner where the plate was held while pouring (next exposure)' });
    slider(s5, 'Dust on plate', 'plate.dust', 0, 1, 0.01, { kind: 'none', tip: 'Specks sitting on the emulsion during exposure — they print sharp (next exposure)' });
    slider(s5, 'Paper fibres', 'plate.fibers', 0, 1, 0.01, { tip: 'Fibre texture printing through (calotype, salt paper)' });
    slider(s5, 'Comets', 'plate.comets', 0, 1, 0.01, { tip: 'Collodion comets: dirt specks the silver flowed around' });
    slider(s5, 'Oyster shell', 'plate.oyster', 0, 1, 0.01, { tip: 'Drying lines near the corner of a poured plate' });
    slider(s5, 'Buff lines', 'plate.buff', 0, 1, 0.01, { tip: 'Hairline polishing marks on metal plates' });
    slider(s5, 'Frilling', 'plate.frilling', 0, 1, 0.01, { tip: 'Gelatin lifting at the edges — worse with warm baths and age' });
  }

  function buildRight() {
    const right = $('#right');
    const s5 = section(right, '6 · Expose');
    s5.append(el('p', { className: 'hint', textContent: 'Press "Uncap lens (expose)" under the plate. Too dark or too pale? Change Exposure time, or make a Test strip first.' }));
    slider(s5, 'Exposure time', 'exposure.time', 0.01, 300000, 0.01, { kind: 'none', log: true, fmt: fmtTime });
    slider(s5, 'Darkroom clock', 'exposure.clock', 0.05, 7200, 0.01, { kind: 'none', log: true, fmt: (v) => '×' + (v < 10 ? v.toFixed(2) : v.toFixed(0)), tip: 'Simulated seconds per real second during interactive exposure' });
    slider(s5, 'Halation', 'exposure.halation', 0, 1, 0.01, { kind: 'none', tip: 'Glow from light reflected off the back of the support' });
    const b5 = el('div', { className: 'btns' });
    button(b5, 'Light leak', () => { if (sheet.state === 'blank' || sheet.state === 'exposed') { E.addLightLeak(sheet, proc(), 0.3 + Math.random() * 0.7); log('A crack of light got into the holder.'); draw(); } }, '', 'An accident: light reaches the plate from an edge');
    button(b5, 'Test strip', () => {
      if (sheet.state !== 'blank' && sheet.state !== 'exposed') return;
      E.testStrip(sheet, st, proc(), O.projection(st, proc(), sheet.W, sheet.H), 6);
      log(`Test strip: six bands from ${fmtTime(st.exposure.time / 8)} to ${fmtTime(st.exposure.time * 4)} (doubling).`);
      draw(); updateActions();
    }, '', 'Six strips, each a stop apart, centred on the current time');
    s5.append(b5);

    const s6 = section(right, '7 · Develop & fix');
    s6.append(el('p', { className: 'hint', id: 'devLabel' }));
    s6.append(el('p', { className: 'hint', textContent: 'Press "Into the tray", watch, press "Pull", then "Fix & wash". The sliders below change how the chemistry behaves.' }));
    slider(s6, 'Temperature °C', 'dev.temp', 5, 90, 0.5, { kind: 'none', tip: 'Rate roughly doubles every 10 °C (Q10≈2). Warm baths frill gelatin.' });
    slider(s6, 'Recommended', 'dev.time', 5, 1200, 1, { kind: 'none', fmt: fmtTime, tip: 'Used by Instant develop and the reel' });
    slider(s6, 'Tray clock', 'dev.clock', 1, 200, 1, { kind: 'none', fmt: (v) => '×' + v });
    select(s6, 'Agitation', 'dev.agitation', [['none', 'Still bath'], ['gentle', 'Gentle rocking'], ['vigorous', 'Vigorous']], { kind: 'none' });
    slider(s6, 'Uneven chemistry', 'dev.uneven', 0, 1, 0.01, { kind: 'none', tip: 'Local developer activity variation' });
    slider(s6, 'Uneven pour', 'dev.pour', 0, 1, 0.01, { kind: 'none', tip: 'Developer reaches the far corner later' });
    slider(s6, 'Bromide drag', 'dev.drag', 0, 1, 0.01, { kind: 'none', tip: 'Exhausted developer streams down from dense areas in a still bath' });
    slider(s6, 'Flash strength', 'flash.strength', 0.05, 2, 0.01, { kind: 'none' });
    slider(s6, 'Mackie lines', 'flash.mackie', 0, 1, 0.01, { kind: 'none' });
    slider(s6, 'Fix time', 'fix.time', 0, 1800, 1, { kind: 'none', fmt: fmtTime });
    slider(s6, 'Wash time', 'wash.time', 0, 3600, 1, { kind: 'none', fmt: fmtTime });

    const s7 = section(right, '8 · Tone, age & save');
    s7.append(el('p', { className: 'hint', textContent: 'After fixing: these sliders change the finished plate live. Then Save PNG.' }));
    select(s7, 'Toner', 'tone.toner', [['none', 'None (native)'], ['sepia', 'Sepia (bleach & redevelop)'], ['selenium', 'Selenium'], ['gold', 'Gold chloride']]);
    slider(s7, 'Toner strength', 'tone.strength', 0, 1, 0.01);
    slider(s7, 'Years', 'age.years', 0, 200, 1, { tip: 'Fading, stains, foxing, silvering-out, tarnish' });
    slider(s7, 'Fading', 'plate.fade', 0, 1, 0.01);
    slider(s7, 'Foxing', 'plate.foxing', 0, 1, 0.01);
    slider(s7, 'Silvering-out', 'plate.silvering', 0, 1, 0.01);
    slider(s7, 'Tarnish', 'plate.tarnish', 0, 1, 0.01);
    check(s7, 'Sealed under glass', 'age.sealed');
    slider(s7, 'Surroundings', 'age.env', 0, 1, 0.01, { tip: 'Daguerreotype mirror: dark surroundings = positive, bright = negative' });
    const b7 = el('div', { className: 'btns' });
    button(b7, 'Drop the plate', () => { A.crack(sheet); log('The plate slipped. Glass cracks.'); draw(); }, '', 'An accident');
    button(b7, 'Use plate as layer', () => {
      const data = U.readDrawable(plateCanvas(), 1600);
      const l = O.makeImageLayer(data, `Plate ${st.layers.length + 1}`);
      l.source = 'negative'; l.correct = false; l.reelSource = false;
      addLayer(l);
      log('The plate is now a transparency in the light path (raw transmittance, no polarity correction).');
    }, '', 'Contact-print / re-photograph this plate through the next one');
    button(b7, 'Save PNG', savePNG, 'primary');
    s7.append(b7);

    buildReel(section(right, '9 · Video reel (optional)', false));

    const s9 = section(right, 'Darkroom log');
    s9.append(el('ul', { id: 'log' }));
  }

  function buildReel(sec) {
    sec.append(el('p', { className: 'hint', textContent: 'Every frame is printed through the current bench: layers, lamp, plate, chemistry. The "Reel source" layer receives the frames.' }));
    const video = el('video', { muted: true, playsInline: true, preload: 'auto' });
    const fr = row(sec, 'Video file', '', true);
    const fi = el('input', { type: 'file', accept: 'video/*' });
    fr.append(fi);
    const info = el('p', { className: 'hint' });
    sec.append(info);
    fi.addEventListener('change', () => {
      if (!fi.files[0]) return;
      video.src = URL.createObjectURL(fi.files[0]);
      video.onloadeddata = () => {
        info.textContent = `${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(1)} s`;
        removeDemo();
        let reelLayer = st.layers.find((l) => l.kind === 'image' && l.reelSource);
        if (!reelLayer) {
          reelLayer = O.makeImageLayer(U.readDrawable(video, 1600), 'Reel');
          addLayer(reelLayer);
        } else {
          reelLayer.img = U.readDrawable(video, 1600); reelLayer.version++; reelLayer._cache = null;
        }
        st.layers.forEach((l) => { l.reelSource = l === reelLayer; });
        st.aspect = video.videoWidth / video.videoHeight;
        renderLayers(); newSheet(false);
        log('Video loaded. Its first frame is now the "Reel" transparency, so you can test your look on a still plate first.');
      };
    });
    const r = 'reel.';
    slider(sec, 'Start (s)', r + 'start', 0, 600, 0.1, { kind: 'none' });
    slider(sec, 'Duration (s)', r + 'duration', 0.5, 30, 0.1, { kind: 'none' });
    slider(sec, 'Frame rate', r + 'fps', 8, 30, 1, { kind: 'none' });
    slider(sec, 'Width (px)', r + 'width', 160, 960, 16, { kind: 'none' });
    slider(sec, 'Generations', r + 'generations', 1, 5, 1, { kind: 'none', tip: 'Re-photograph each frame from its own print N times' });
    slider(sec, 'Step print', r + 'stepPrint', 1, 4, 1, { kind: 'none', tip: 'Print each frame N times (stuttering motion)' });
    slider(sec, 'Gate weave', r + 'weave', 0, 3, 0.01, { kind: 'none' });
    slider(sec, 'Flicker', r + 'flicker', 0, 1.5, 0.01, { kind: 'none' });
    slider(sec, 'Scratches', r + 'scratches', 0, 1, 0.01, { kind: 'none' });
    slider(sec, 'Dust', r + 'dust', 0, 1, 0.01, { kind: 'none' });
    slider(sec, 'Frame slip', r + 'slip', 0, 1, 0.01, { kind: 'none' });
    slider(sec, 'Bath exhaustion', r + 'exhaustion', 0, 1, 0.01, { kind: 'none', tip: 'The developer tires along the reel' });
    const prog = el('progress', { max: 1, value: 0 });
    const rc = el('canvas', { id: 'reelCanvas', width: 320, height: 240 });
    const out = el('div');
    let reel = null, cancel = false;
    const b = el('div', { className: 'btns' });
    button(b, 'Develop reel', async () => {
      if (!video.src) return log('Load a video first.');
      if (mode !== 'idle') return;
      mode = 'reel'; cancel = false; updateActions();
      log(`Developing reel: ${st.reel.duration}s at ${st.reel.fps} fps, ${st.reel.generations} generation(s).`);
      try {
        reel = await Lab.reel.developReel(st, proc(), video, st.reel, (f, t, c) => {
          prog.value = f / t;
          rc.width = c.width; rc.height = c.height;
          rc.getContext('2d').drawImage(c, 0, 0);
        }, () => cancel);
        log(`Reel developed: ${reel.frames.length} frames.`);
      } catch (e) { log('Reel failed: ' + e.message); }
      mode = 'idle'; updateActions();
      st.layers.forEach((l) => { l._cache = null; });
    }, 'primary');
    button(b, 'Cancel', () => { cancel = true; });
    button(b, 'Project', async () => { if (reel) await Lab.reel.projectAndRecord(reel, rc, false); });
    button(b, 'Project & record', async () => {
      if (!reel) return log('Develop a reel first.');
      log('Projecting and recording…');
      const blob = await Lab.reel.projectAndRecord(reel, rc, true);
      out.innerHTML = '';
      out.append(el('a', { href: URL.createObjectURL(blob), download: `reel-${Date.now()}.webm`, textContent: 'Download reel (.webm)' }));
      log('Reel recorded.');
    });
    sec.append(b, prog, rc, out);
  }

  function buildToolbar() {
    const tb = $('#toolbar');
    const tools = [
      ['dodge', 'Hand (dodge)', 'During exposure: hold to shade an area'],
      ['burn', 'Card with hole (burn)', 'During exposure: hold to expose only through a hole'],
      ['developer', 'Developer brush', 'Paint extra developer: faster, darker'],
      ['fixer', 'Fixer brush', 'Fixer stops everything it touches — before exposure it is a resist (chemigram)'],
      ['water', 'Water brush', 'Dilute the developer locally'],
      ['thumb', 'Warm thumb', 'A warm fingertip speeds development in ridges'],
      ['mask', 'Paint card', 'Paint the selected Paintable card layer (shift = cut away)'],
    ];
    const btns = {};
    for (const [k, t, tip] of tools) {
      btns[k] = button(tb, t, () => { st.tool.name = k; Object.values(btns).forEach((b) => b.classList.remove('on')); btns[k].classList.add('on'); }, 'tool', tip);
    }
    btns.dodge.classList.add('on');
    const mk = (label, p, min, max, step) => {
      const l = el('label', { textContent: label });
      const [get, set] = path(p);
      const i = el('input', { type: 'range', min, max, step, value: get() });
      i.addEventListener('input', () => set(+i.value));
      l.append(i); tb.append(l);
    };
    mk('size', 'tool.radius', 4, 250, 1);
    mk('soft', 'tool.soft', 0, 150, 1);
    mk('strength', 'tool.strength', 0.05, 1, 0.01);
    const vbar = el('div', { className: 'viewbar' });
    const vs = el('select', { title: 'What the easel shows. Save PNG always saves the plate.' });
    vs.append(
      el('option', { value: 'plate', textContent: 'View: plate' }),
      el('option', { value: 'original', textContent: 'View: original photo (placement)' }),
      el('option', { value: 'split', textContent: 'View: split — original | plate' }),
      el('option', { value: 'projection', textContent: 'View: projection (focusing)' }),
    );
    const wipeLabel = el('label', { textContent: 'wipe' });
    const wipe = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.splitAt });
    wipe.addEventListener('input', () => { st.splitAt = +wipe.value; draw(); });
    wipeLabel.append(wipe);
    const setView = (v) => {
      st.view = v; vs.value = v;
      wipeLabel.style.display = v === 'split' ? '' : 'none';
      cmp.classList.toggle('on', v === 'original');
      draw();
    };
    vs.addEventListener('change', () => setView(vs.value));
    let back = 'plate';
    const cmp = el('button', { textContent: 'Original ⇄ Plate', title: 'Flip between your untouched photo and the plate (or hold the O key)' });
    cmp.addEventListener('click', () => {
      if (st.view === 'original') setView(back);
      else { back = st.view === 'projection' ? 'plate' : st.view; setView('original'); }
    });
    // Hold O to peek at the original.
    let peeking = false;
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'o' || e.repeat || peeking || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (st.view === 'original') return;
      peeking = true; back = st.view; setView('original');
    });
    addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'o' && peeking) { peeking = false; setView(back); } });
    vbar.append(vs, cmp, wipeLabel);
    tb.append(vbar);
    setView(st.view);
  }

  const act = {};
  function buildActions() {
    const a = $('#actions');
    act.expose = button(a, 'Uncap lens (expose)', startExposure, 'primary', 'Real-time exposure on the darkroom clock; use the hand / card tools while it runs');
    act.cap = button(a, 'Cap lens', () => { if (mode === 'exposing') { sess.T = sess.elapsed; finishExposure(); } }, '', 'End the exposure early');
    act.instant = button(a, 'Instant exposure', instantExposure);
    act.tray = button(a, 'Into the tray', intoTray, 'primary', 'Start development and watch it come up');
    act.flash = button(a, 'Flash light', doFlash, '', 'Sabattier: re-expose during development');
    act.pull = button(a, 'Pull', pull);
    act.instantDev = button(a, 'Instant develop', instantDevelop);
    act.fix = button(a, 'Fix & wash', fixAndWash, 'primary');
    act.save = button(a, 'Save PNG', savePNG, '', 'Download the plate as you see it');
    act.fresh = button(a, 'Fresh plate', () => newSheet(), '', 'Start again on a new, unexposed plate (your setup stays)');
  }
  function savePNG() {
    plateCanvas().toBlob((b) => { const a = el('a', { href: URL.createObjectURL(b), download: `plate-${st.processId}-${Date.now()}.png` }); a.click(); });
  }

  // Tells the user, in plain words, which button to press next and highlights it.
  let lastNext = '';
  function updateNext() {
    if (!sheet || !act.expose) return;
    const p = proc();
    const demo = st.layers.some((l) => l.demo);
    let msg, target = null;
    if (mode === 'exposing') { msg = 'Exposing… Hold the mouse on the plate to shade (dodge) an area. Wait for the timer, or press Cap lens.'; target = act.cap; }
    else if (mode === 'developing') { msg = 'Developing… Watch the image appear and press Pull when you like it.' + (p.dev.mode === 'liquid' ? ' (Optional: Flash light for the reversed nightmare look.)' : ''); target = act.pull; }
    else if (mode === 'reel') msg = 'Rendering the video reel… see section 9.';
    else if (sheet.state === 'blank') {
      msg = (demo ? 'STEP 1: load your picture in section 1 (or practise on the demo). ' : '') + 'NEXT: press "Uncap lens (expose)" (or Instant exposure).';
      target = act.expose;
    } else if (sheet.state === 'exposed') {
      if (canDevelop()) { msg = `NEXT: press "${act.tray.textContent}" to develop. The image stays invisible until you do. (You can also expose again for a double exposure.)`; target = act.tray; }
      else if (p.dev.mode === 'printout') { msg = 'The picture printed out while you exposed. NEXT: press "Fix & wash".'; target = act.fix; }
      else { msg = 'Done: a camera obscura has no chemistry. Press Save PNG, or Fresh plate to try again.'; target = act.save; }
    } else if (sheet.state === 'developed') { msg = 'NEXT: press "Fix & wash" to lock the image in.'; target = act.fix; }
    else { msg = 'DONE! Tone and age it in section 8 if you like, then press Save PNG. Fresh plate starts over.'; target = act.save; }
    if (msg !== lastNext) {
      $('#nextStep').textContent = msg;
      lastNext = msg;
      Object.values(act).forEach((b) => b.classList.remove('next'));
      if (target) target.classList.add('next');
    }
  }
  function updateActions() {
    if (!act.expose) return;
    const p = proc();
    const exposable = sheet && (sheet.state === 'blank' || sheet.state === 'exposed');
    act.expose.disabled = mode !== 'idle' || !exposable;
    act.instant.disabled = mode !== 'idle' || !exposable;
    act.cap.disabled = mode !== 'exposing';
    act.tray.disabled = mode !== 'idle' || !canDevelop() || !!sheet.fullD;
    act.instantDev.disabled = act.tray.disabled;
    act.pull.disabled = mode !== 'developing';
    act.flash.disabled = mode !== 'developing' || p.dev.mode !== 'liquid';
    act.fix.disabled = mode === 'exposing' || mode === 'reel' || sheet.state === 'fixed' || p.fixRef === 0 && p.washRef === 0;
    act.save.disabled = mode !== 'idle';
    act.fresh.disabled = mode !== 'idle';
    const dl = $('#devLabel');
    if (dl) dl.textContent = canDevelop() ? `Development: ${p.dev.label}` : p.dev.mode === 'printout' ? 'Printing-out paper: the image forms during exposure. Just fix and wash.' : 'No chemistry: the image exists only while the light does.';
    act.tray.textContent = p.dev.mode === 'fume' ? 'Over the mercury' : p.dev.mode === 'solvent' ? 'Into the solvent' : 'Into the tray';
    updateNext();
  }

  // ---------- boot ----------
  function boot() {
    buildLeft(); buildRight(); buildToolbar(); buildActions();
    const rs = $('#recipe');
    for (const k in RECIPES) rs.append(el('option', { value: k, textContent: RECIPES[k].name }));
    $('#applyRecipe').addEventListener('click', () => { RECIPES[rs.value].fn(); refreshAll(); renderLayers(); updateActions(); draw(); });
    resetBench('drygelatin');
    const demo = O.makeImageLayer(demoScene(), 'Demo corridor');
    demo.demo = true;
    addLayer(demo);
    log('Welcome. Follow the NEXT line under the plate. Start by loading your own picture in section 1, or practise on the demo.');
    requestAnimationFrame(loop);
  }

  // Replace all picture layers with one picture (used by scripts such as tools/render-demos.mjs).
  function setPicture(data, name) {
    st.layers = st.layers.filter((l) => l.kind !== 'image');
    const l = O.makeImageLayer(data, name || 'Picture');
    l.reelSource = true;
    st.layers.unshift(l);
    st.sel = l.id;
    st.aspect = data.W / data.H;
    renderLayers();
    newSheet(false);
    return l;
  }
  function applyRecipe(id) { RECIPES[id].fn(); refreshAll(); renderLayers(); updateActions(); draw(); }

  Lab.app = {
    st, get sheet() { return sheet; }, proc, newSheet, instantExposure, instantDevelop, fixAndWash, draw,
    resetBench, setPicture, applyRecipe, addLayer, refreshAll, renderLayers, plateCanvas, canDevelop,
  };
  boot();
})(window.Lab);
