'use strict';
// Optics: the light path. Lamp -> layers (transparencies, dust, muslin, cards...) -> aperture -> sensitive plate.
// Each layer sits at a distance in front of the aperture; its blur on the plate comes from defocus
// relative to the focus plane (scaled by 1/f-number), the size of the lamp, and lens softness.
(function (Lab) {
  const U = Lab.util;
  let nextId = 1;

  const LAYER_KINDS = {
    image: 'Transparency (your negative / photo)',
    dust: 'Dusty glass (dust + hairs)',
    scratches: 'Scratched film base',
    muslin: 'Muslin veil (spirit "ectoplasm")',
    oval: 'Oval mat card',
    mask: 'Paintable card (draw your own mask)',
  };

  function baseLayer(kind, name) {
    return {
      id: nextId++, kind, name, visible: true,
      distance: 100, x: 0, y: 0, scale: 1, rotation: 0, strength: 1,
      start: 0, end: 1, driftX: 0, driftY: 0, tremble: 0,
      contrast: 1, source: 'positive', correct: true, reelSource: false,
      amount: 0.5, seed: (Math.random() * 1e9) | 0, version: 0,
      _cache: null,
    };
  }

  function makeImageLayer(img, name) {
    const l = baseLayer('image', name || 'Transparency');
    l.img = img;
    return l;
  }

  function makeProcLayer(kind) {
    const l = baseLayer(kind, LAYER_KINDS[kind].split(' (')[0]);
    if (kind === 'dust') { l.distance = 70; l.amount = 0.5; }
    if (kind === 'scratches') { l.distance = 100; l.amount = 0.4; }
    if (kind === 'muslin') { l.distance = 100; l.amount = 0.6; l.start = 0.6; l.strength = 0.8; }
    if (kind === 'oval') { l.distance = 40; l.amount = 0.5; }
    if (kind === 'mask') { l.distance = 60; }
    return l;
  }

  // ---- procedural layer generators (transmittance 0..1 at given size) ----
  function genDust(W, H, seed, amount) {
    const T = new Float32Array(W * H).fill(1);
    const rnd = U.mulberry32(seed);
    const L = Math.max(W, H);
    const specks = Math.round(amount * 900);
    for (let s = 0; s < specks; s++) {
      const cx = rnd() * W, cy = rnd() * H;
      const r = 0.4 + Math.pow(rnd(), 3) * L * 0.006;
      const op = 0.5 + rnd() * 0.5;
      stamp(T, W, H, cx, cy, r, op);
    }
    const hairs = Math.round(amount * 14);
    for (let h = 0; h < hairs; h++) {
      let x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI * 2;
      const len = L * (0.03 + rnd() * 0.18), w = 0.5 + rnd() * 1.1;
      for (let k = 0; k < len; k++) {
        a += (rnd() - 0.5) * 0.25;
        x += Math.cos(a); y += Math.sin(a);
        stamp(T, W, H, x, y, w, 0.9);
      }
    }
    return T;
  }

  function stamp(T, W, H, cx, cy, r, op) {
    const R = Math.ceil(r + 1);
    for (let y = Math.max(0, (cy - R) | 0); y <= Math.min(H - 1, (cy + R) | 0); y++)
      for (let x = Math.max(0, (cx - R) | 0); x <= Math.min(W - 1, (cx + R) | 0); x++) {
        const d = Math.hypot(x - cx, y - cy);
        const c = U.clamp(r + 0.5 - d, 0, 1) * op;
        const i = y * W + x;
        T[i] = Math.min(T[i], 1 - c);
      }
  }

  function genScratches(W, H, seed, amount) {
    const T = new Float32Array(W * H).fill(1);
    const rnd = U.mulberry32(seed);
    const n = Math.round(amount * 18) + 1;
    for (let s = 0; s < n; s++) {
      let x = rnd() * W;
      const y0 = rnd() < 0.5 ? 0 : rnd() * H, y1 = rnd() < 0.6 ? H : y0 + rnd() * (H - y0);
      const w = 0.4 + rnd() * 1.4, op = 0.35 + rnd() * 0.55, wander = rnd() * 0.15;
      for (let y = y0; y < y1; y += 0.7) {
        x += (rnd() - 0.5) * wander;
        stamp(T, W, H, x, y, w, op * (0.6 + 0.4 * rnd()));
      }
    }
    return T;
  }

  function genMuslin(W, H, seed, amount) {
    const L = Math.max(W, H);
    const wisp = U.fbmField(W, H, L * 0.09, seed, 5, 0.6, 1.8);
    const T = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const weave = 0.5 + 0.25 * (Math.sin(x * 1.9) + Math.sin(y * 1.9));
        const fold = U.smoothstep(0.45, 0.75, wisp[i]);
        const dens = fold * (0.75 + 0.25 * weave) * (0.4 + amount);
        T[i] = U.clamp(1 - dens, 0, 1);
      }
    return T;
  }

  function genOval(W, H, seed, amount) {
    const T = new Float32Array(W * H);
    const rx = W * (0.5 - amount * 0.25), ry = H * (0.5 - amount * 0.2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - W / 2) / rx, (y - H / 2) / ry);
        T[y * W + x] = d < 1 ? 1 : 0;
      }
    return T;
  }

  function procSize(layer, W, H) {
    if (!layer.proc || layer.proc.W !== W || layer.proc.H !== H || layer.proc.seed !== layer.seed || layer.proc.amount !== layer.amount) {
      let T;
      if (layer.kind === 'dust') T = genDust(W, H, layer.seed, layer.amount);
      else if (layer.kind === 'scratches') T = genScratches(W, H, layer.seed, layer.amount);
      else if (layer.kind === 'muslin') T = genMuslin(W, H, layer.seed, layer.amount);
      else if (layer.kind === 'oval') T = genOval(W, H, layer.seed, layer.amount);
      else if (layer.kind === 'mask') {
        T = layer.proc && layer.proc.T.length === W * H ? layer.proc.T : new Float32Array(W * H).fill(1);
      }
      layer.proc = { W, H, seed: layer.seed, amount: layer.amount, T };
      layer.version++;
    }
    return layer.proc;
  }

  // Base (sharp) transmittance of a layer, accounting for spectral sensitivity, polarity and the Callier effect.
  function layerBase(layer, st, proc, W, H) {
    let lw, lh, T;
    if (layer.kind === 'image') {
      lw = layer.img.W; lh = layer.img.H;
    } else {
      const p = procSize(layer, W, H);
      lw = p.W; lh = p.H;
    }
    const Q = 1 + 0.45 * st.lamp.condenser;
    const cv = layer.kind === 'image' ? st.aperture.camVignette || 0 : 0;
    const key = [layer.version, layer.kind, layer.source, layer.correct, layer.contrast, layer.strength, proc.id, Q, cv, lw, lh].join('|');
    if (layer._cache && layer._cache.key === key) return layer._cache;
    if (layer.kind === 'image') {
      const { r, g, b } = layer.img;
      const n = lw * lh;
      T = new Float32Array(n);
      const sw = layer.source === 'positive' ? proc.spectral : [0.2126, 0.7152, 0.0722];
      const wantPos = proc.polarity === 'pos';
      // Camera vignette: cos⁴ falloff the original camera put on this picture's own frame.
      const f = 3.2 - 2.9 * cv, hl = Math.max(lw, lh) / 2;
      for (let i = 0; i < n; i++) {
        let c4 = 1;
        if (cv > 0) {
          const ux = ((i % lw) - lw / 2) / hl, uy = (((i / lw) | 0) - lh / 2) / hl;
          c4 = Math.pow((f * f) / (ux * ux + uy * uy + f * f), 2);
        }
        const lin = sw[0] * U.srgbToLin(r[i]) + sw[1] * U.srgbToLin(g[i]) + sw[2] * U.srgbToLin(b[i]);
        let t;
        if (layer.source === 'positive') {
          const scene = lin * c4;
          // Negative-working plate: copy the scene to an internegative at gamma 0.7 (density ∝ log scene luminance).
          t = !layer.correct || wantPos ? scene : Math.min(1, Math.pow(Math.max(scene, 0.005) / 0.005, -0.7));
        } else if (layer.correct && wantPos) {
          t = U.srgbToLin(1 - (sw[0] * r[i] + sw[1] * g[i] + sw[2] * b[i])) * c4;
        } else {
          // A camera-vignetted negative is thinner (more transparent) toward its corners.
          t = Math.min(1, lin / Math.pow(c4, 0.7));
        }
        T[i] = t;
      }
      for (let i = 0; i < n; i++) {
        // Callier: specular (condenser) light sees silver density multiplied by Q.
        let t = Math.pow(Math.max(T[i], 1e-5), layer.contrast * Q);
        T[i] = 1 - layer.strength * (1 - t);
      }
    } else {
      const src = layer.proc.T;
      T = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) T[i] = 1 - layer.strength * (1 - Math.pow(src[i], Q));
    }
    layer._cache = { key, lw, lh, T, blurKey: null, blurred: null };
    return layer._cache;
  }

  function layerSigma(layer, st, W, H) {
    const L = Math.max(W, H);
    const ap = st.aperture;
    const defocus = Math.abs(layer.distance - ap.focus);
    let s;
    if (ap.shape === 'pinhole') s = L * 0.0022 * ap.pinhole + defocus * L * 0.00002;
    else s = L * 0.00045 * defocus * (8 / ap.fstop);
    s += L * 0.00025 * defocus * st.lamp.size;
    s += ap.softness * L * 0.004;
    let sx = s, sy = s;
    if (ap.shape === 'hslit') { sx = s * 1.8; sy = s * 0.15; }
    if (ap.shape === 'vslit') { sx = s * 0.15; sy = s * 1.8; }
    return [sx, sy];
  }

  function prepareLayers(st, proc, W, H) {
    const out = [];
    for (const layer of st.layers) {
      if (!layer.visible) continue;
      if (layer.kind === 'image' && !layer.img) continue;
      const c = layerBase(layer, st, proc, W, H);
      const fit = Math.max(W / c.lw, H / c.lh);
      const s = layer.scale * fit;
      const [sx, sy] = layerSigma(layer, st, W, H);
      const bk = sx.toFixed(2) + '|' + sy.toFixed(2) + '|' + s.toFixed(4);
      if (c.blurKey !== bk) {
        c.blurred = U.blur(c.T, c.lw, c.lh, sx / s, sy / s);
        c.blurKey = bk;
      }
      out.push({ layer, T: c.blurred, lw: c.lw, lh: c.lh, s, outside: layer.kind === 'image' ? 0 : 1 });
    }
    return out;
  }

  function lampMap(st, W, H, tf, out) {
    const L = Math.max(W, H), lp = st.lamp;
    const lx = lp.x + lp.travelX * (tf - 0.5), ly = lp.y + lp.travelY * (tf - 0.5);
    const h = lp.height;
    const f = 3.2 - 2.9 * st.aperture.vignette;
    for (let y = 0; y < H; y++) {
      const uy = (y - H / 2) / (L / 2);
      for (let x = 0; x < W; x++) {
        const ux = (x - W / 2) / (L / 2);
        const dx = ux - lx, dy = uy - ly;
        const d = Math.sqrt(dx * dx + dy * dy + h * h);
        const lambert = Math.pow(h / d, 3); // inverse square * cos(theta)
        const r2 = ux * ux + uy * uy;
        const c4 = Math.pow((f * f) / (r2 + f * f), 2); // cos^4 natural vignetting
        out[y * W + x] = lambert * c4;
      }
    }
    return out;
  }

  // Irradiance on the plate at exposure fraction tf (0..1). jit: per-layer [dx,dy] tremble offsets.
  function irradiance(st, prepared, W, H, tf, jit, intensity, out) {
    out = out || new Float32Array(W * H);
    lampMap(st, W, H, tf, out);
    const L = Math.max(W, H);
    const lp = st.lamp;
    const lx = lp.x + lp.travelX * (tf - 0.5), ly = lp.y + lp.travelY * (tf - 0.5);
    for (let i = 0; i < out.length; i++) out[i] *= intensity;
    const inv = st.aperture.invert;
    prepared.forEach((p, k) => {
      const l = p.layer;
      if (tf < l.start || tf > l.end) return;
      const par = (l.distance - st.aperture.focus) * L * 0.0015;
      const cx = W / 2 + (l.x + l.driftX * tf) * W + (jit ? jit[k][0] : 0) - lx * par;
      const cy = H / 2 + (l.y + l.driftY * tf) * H + (jit ? jit[k][1] : 0) - ly * par;
      const a = (l.rotation * Math.PI) / 180, ca = Math.cos(a) / p.s, sa = Math.sin(a) / p.s;
      const hw = p.lw / 2, hh = p.lh / 2;
      for (let y = 0; y < H; y++) {
        const py = inv ? H - 1 - y : y;
        const dy = py - cy;
        for (let x = 0; x < W; x++) {
          const px = inv ? W - 1 - x : x;
          const dx = px - cx;
          const u = ca * dx + sa * dy + hw, v = -sa * dx + ca * dy + hh;
          out[y * W + x] *= U.sampleBilinear(p.T, p.lw, p.lh, u, v, p.outside);
        }
      }
    });
    return out;
  }

  // ---- exposure session (interactive or instant) ----
  function beginSession(st, proc, sheet, seed, T) {
    const W = sheet.W, H = sheet.H;
    const prepared = prepareLayers(st, proc, W, H);
    seed = seed == null ? (Math.random() * 1e9) | 0 : seed;
    return {
      W, H, prepared, raw: new Float32Array(W * H), E: new Float32Array(W * H),
      T: T == null ? st.exposure.time : T, T0: T == null ? st.exposure.time : T, elapsed: 0, seed, rnd: U.mulberry32(seed),
      jit: prepared.map(() => [0, 0]), flick: 0,
      // Time-integrated hand transmittance, so a replay can re-apply the same dodging and burning.
      handAcc: null, freeTime: 0,
    };
  }

  function sessionMoving(st) {
    return st.layers.some((l) => l.visible && (l.driftX || l.driftY || l.tremble || l.start > 0 || l.end < 1)) ||
      st.lamp.travelX || st.lamp.travelY || st.lamp.flicker > 0;
  }

  function stepSession(st, sess, simDt, hand) {
    const W = sess.W, H = sess.H, L = Math.max(W, H);
    const dt = Math.min(simDt, sess.T - sess.elapsed);
    if (dt <= 0) return true;
    const tf = (sess.elapsed + dt / 2) / sess.T;
    sess.prepared.forEach((p, k) => {
      const tr = p.layer.tremble * L * 0.004;
      const j = sess.jit[k];
      j[0] = j[0] * 0.8 + U.gaussian(sess.rnd) * tr;
      j[1] = j[1] * 0.8 + U.gaussian(sess.rnd) * tr;
    });
    sess.flick = sess.flick * 0.6 + U.gaussian(sess.rnd) * st.lamp.flicker * 0.5;
    const I = st.lamp.intensity * Math.max(0, 1 + sess.flick);
    irradiance(st, sess.prepared, W, H, tf, sess.jit, I, sess.E);
    const raw = sess.raw, E = sess.E;
    if (hand && hand.active) {
      const h = handFactor(W, H, hand);
      if (!sess.handAcc) sess.handAcc = new Float32Array(W * H);
      for (let i = 0; i < raw.length; i++) { E[i] *= h[i]; sess.handAcc[i] += h[i] * dt; }
    } else sess.freeTime += dt;
    for (let i = 0; i < raw.length; i++) raw[i] += E[i] * dt;
    sess.elapsed += dt;
    return sess.elapsed >= sess.T - 1e-9;
  }

  // Dodging hand (blocks a soft disc) or burning card (blocks all but a soft hole).
  function handFactor(W, H, hand) {
    const out = new Float32Array(W * H);
    const r = hand.radius, soft = Math.max(1, hand.soft);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - hand.x, y - hand.y);
        const disc = 1 - U.smoothstep(r - soft, r + soft, d);
        out[y * W + x] = hand.tool === 'dodge' ? 1 - 0.97 * disc * hand.strength : 0.02 + 0.98 * disc;
      }
    return out;
  }

  // Average hand transmittance over the session (null = the hand never touched the plate).
  function handMask(sess) {
    if (!sess.handAcc || sess.elapsed <= 0) return null;
    const m = new Float32Array(sess.handAcc.length);
    for (let i = 0; i < m.length; i++) m[i] = (sess.handAcc[i] + sess.freeTime) / sess.elapsed;
    return m;
  }

  function runInstant(st, proc, sheet, seed, T) {
    const sess = beginSession(st, proc, sheet, seed, T);
    const n = sessionMoving(st) ? 32 : 1;
    for (let k = 0; k < n; k++) stepSession(st, sess, sess.T / n, null);
    sess.elapsed = sess.T;
    return sess;
  }

  function projection(st, proc, W, H) {
    const prepared = prepareLayers(st, proc, W, H);
    return irradiance(st, prepared, W, H, 0.5, null, st.lamp.intensity);
  }

  // Reference view: the untouched source picture placed exactly where it lands on the plate
  // (same offset/scale/rotation/inversion, no blur or drift), with other layers ghosted on top.
  function originalView(st, W, H) {
    const imgs = st.layers.filter((l) => l.kind === 'image' && l.visible && l.img);
    const primary = imgs.find((l) => l.id === st.sel) || imgs.find((l) => l.reelSource) || imgs[0];
    const out = new Uint8ClampedArray(W * H * 4);
    const place = (l, lw, lh) => {
      const s = l.scale * Math.max(W / lw, H / lh);
      const a = (l.rotation * Math.PI) / 180;
      return { cx: W / 2 + l.x * W, cy: H / 2 + l.y * H, ca: Math.cos(a) / s, sa: Math.sin(a) / s, hw: lw / 2, hh: lh / 2 };
    };
    const inv = st.aperture.invert;
    const others = st.layers.filter((l) => l.visible && l !== primary && (l.kind !== 'image' || l.img)).map((l) => {
      let T, lw, lh;
      if (l.kind === 'image') {
        lw = l.img.W; lh = l.img.H; T = new Float32Array(lw * lh);
        for (let i = 0; i < T.length; i++) T[i] = 0.2126 * l.img.r[i] + 0.7152 * l.img.g[i] + 0.0722 * l.img.b[i];
      } else {
        const p = procSize(l, W, H); lw = p.W; lh = p.H; T = p.T;
      }
      return { l, T, lw, lh, m: place(l, lw, lh), outside: l.kind === 'image' ? 0 : 1 };
    });
    const pm = primary ? place(primary, primary.img.W, primary.img.H) : null;
    for (let y = 0; y < H; y++) {
      const py = inv ? H - 1 - y : y;
      for (let x = 0; x < W; x++) {
        const px = inv ? W - 1 - x : x;
        let r = 0.07, g = 0.07, b = 0.07;
        if (pm) {
          const dx = px - pm.cx, dy = py - pm.cy;
          const u = pm.ca * dx + pm.sa * dy + pm.hw, v = -pm.sa * dx + pm.ca * dy + pm.hh;
          const im = primary.img;
          if (u >= -0.5 && v >= -0.5 && u <= im.W - 0.5 && v <= im.H - 0.5) {
            r = U.sampleBilinear(im.r, im.W, im.H, u, v, 0);
            g = U.sampleBilinear(im.g, im.W, im.H, u, v, 0);
            b = U.sampleBilinear(im.b, im.W, im.H, u, v, 0);
          }
        }
        let k = 1;
        for (const o of others) {
          const dx = px - o.m.cx, dy = py - o.m.cy;
          const u = o.m.ca * dx + o.m.sa * dy + o.m.hw, v = -o.m.sa * dx + o.m.ca * dy + o.m.hh;
          const t = U.sampleBilinear(o.T, o.lw, o.lh, u, v, o.outside);
          k *= 1 - 0.55 * o.l.strength * (1 - t);
        }
        const j = (y * W + x) * 4;
        out[j] = r * k * 255; out[j + 1] = g * k * 255; out[j + 2] = b * k * 255; out[j + 3] = 255;
      }
    }
    return out;
  }

  Lab.optics = {
    LAYER_KINDS, makeImageLayer, makeProcLayer, procSize, prepareLayers, irradiance, projection,
    beginSession, stepSession, runInstant, sessionMoving, originalView, handMask,
  };
})(window.Lab);
