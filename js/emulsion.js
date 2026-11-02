'use strict';
// Emulsion & chemistry: latent image, reciprocity failure, characteristic (H&D) curve,
// development kinetics with uneven chemistry, Sabattier re-exposure with Mackie lines.
(function (Lab) {
  const U = Lab.util;

  function newSheet(W, H, seed) {
    const n = W * H;
    return {
      W, H, seed: seed == null ? (Math.random() * 1e9) | 0 : seed,
      latent: new Float32Array(n), progress: new Float32Array(n),
      latent2: null, fullD2: null, progress2: null,
      activity: null, delay: null, stopped: new Uint8Array(n), chemMarks: new Float32Array(n),
      fullD: null, dragMap: null, devTime: 0, state: 'blank',
      fixQ: 0, washQ: 0, totalExposure: 0, exposures: 0, cracks: [], cache: {},
    };
  }

  // Characteristic curve: logistic in log exposure, slope (gamma) at the speed point, optional solarisation.
  function curve(H, p) {
    if (H <= 1e-12) return p.Dmin;
    const logH = Math.log10(H);
    const rng = p.Dmax - p.Dmin;
    const k = (4 * p.gamma) / rng;
    let D = p.Dmin + rng / (1 + Math.exp(-k * (logH - p.logH0)));
    if (p.solarize > 0) {
      const ls = p.logH0 + (p.solarizeAt || 1);
      if (logH > ls) D -= p.solarize * (logH - ls) * rng;
    }
    return Math.max(p.Dmin, D);
  }

  // Schwarzschild reciprocity failure: effective exposure = I * t^p, applied relative to tref.
  function reciprocityFactor(T, p) {
    return T > p.tref ? Math.pow(T / p.tref, p.recipP - 1) : 1;
  }

  // Finish an exposure session: lens field curvature, halation, plate sensitivity, reciprocity.
  function commitSession(sheet, sess, st, proc) {
    const W = sheet.W, H = sheet.H, L = Math.max(W, H);
    let raw = sess.raw;
    const fc = st.aperture.fieldCurve;
    if (fc > 0) {
      const b = U.blur(raw, W, H, L * 0.012 * fc);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const r2 = (((x - W / 2) ** 2 + (y - H / 2) ** 2) / (L * L / 4));
          const w = U.clamp(r2 * 0.9, 0, 1);
          const i = y * W + x;
          raw[i] = raw[i] * (1 - w) + b[i] * w;
        }
    }
    const hal = st.exposure.halation;
    if (hal > 0) {
      // Light scattered back from the rear of the support re-enters the emulsion as a glow ring.
      const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
      const hi = raw.map((v) => Math.max(0, v - mean * 1.2));
      const b1 = U.blur(hi, W, H, L * 0.008), b2 = U.blur(hi, W, H, L * 0.025);
      for (let i = 0; i < raw.length; i++) raw[i] += hal * (b1[i] * 0.6 + b2[i] * 0.8);
    }
    const sens = Lab.artifacts.sensitivity(sheet, st, proc);
    const rf = reciprocityFactor(sess.elapsed, proc);
    for (let i = 0; i < raw.length; i++) {
      if (sheet.stopped[i]) continue;
      sheet.latent[i] += raw[i] * sens[i] * rf;
    }
    sheet.totalExposure += sess.elapsed;
    sheet.exposures++;
    if (sheet.state === 'blank') sheet.state = 'exposed';
    sheet.cache.dens = null;
    return { recipLoss: 1 - rf };
  }

  function addLightLeak(sheet, proc, strength, leakSeed) {
    const W = sheet.W, H = sheet.H, L = Math.max(W, H);
    const rnd = U.mulberry32(leakSeed == null ? (Math.random() * 1e9) | 0 : leakSeed);
    const edge = (rnd() * 4) | 0, pos = rnd();
    const ex = edge === 0 ? 0 : edge === 1 ? W : pos * W;
    const ey = edge === 2 ? 0 : edge === 3 ? H : pos * H;
    const seed = (rnd() * 1e6) | 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wob = U.fbm(x / (L * 0.08), y / (L * 0.08), seed, 3);
        const d = Math.hypot(x - ex, y - ey) / L;
        sheet.latent[y * W + x] += strength * proc.H0 * 6 * Math.exp(-d / (0.12 + 0.12 * wob));
      }
    if (sheet.state === 'blank') sheet.state = 'exposed';
    sheet.cache.dens = null;
  }

  function testStrip(sheet, st, proc, E, steps) {
    const W = sheet.W, H = sheet.H;
    const sens = Lab.artifacts.sensitivity(sheet, st, proc);
    for (let x = 0; x < W; x++) {
      const k = Math.min(steps - 1, Math.floor((x / W) * steps));
      const t = st.exposure.time * Math.pow(2, k - Math.floor(steps / 2));
      const rf = reciprocityFactor(t, proc);
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        sheet.latent[i] += E[i] * t * rf * sens[i];
      }
    }
    if (sheet.state === 'blank') sheet.state = 'exposed';
    sheet.cache.dens = null;
  }

  // ---- development ----
  function startDevelop(sheet, st, proc) {
    const W = sheet.W, H = sheet.H, L = Math.max(W, H), n = W * H;
    sheet.fullD = new Float32Array(n);
    for (let i = 0; i < n; i++) sheet.fullD[i] = curve(sheet.latent[i], proc);
    const d = st.dev;
    const agMul = d.agitation === 'none' ? 1.4 : d.agitation === 'gentle' ? 1 : 0.55;
    const noise = U.fbmField(W, H, L * 0.18, sheet.seed + 11, 4);
    const act = sheet.activity || new Float32Array(n).fill(1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let a = 1 + d.uneven * 2.4 * agMul * (noise[i] - 0.5);
        if (d.agitation === 'vigorous') {
          const e = Math.min(x, y, W - 1 - x, H - 1 - y) / (L * 0.06);
          a += 0.3 * d.uneven * Math.exp(-e); // surge marks near edges
        }
        if (proc.dev.mode === 'fume') {
          const r2 = ((x - W / 2) ** 2 + (y - H / 2) ** 2) / (L * L / 4);
          a *= 1 + 0.5 * d.uneven * (0.6 - r2); // mercury cup is under the centre
        }
        act[i] = Math.max(0, a * act[i]);
      }
    sheet.activity = act;
    if (d.pour > 0) {
      const pn = U.fbmField(W, H, L * 0.1, sheet.seed + 23, 3);
      sheet.delay = new Float32Array(n);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          sheet.delay[i] = d.pour * proc.dev.tau * 1.6 * (Math.hypot(x, y) / L + 0.5 * pn[i]);
        }
    } else sheet.delay = null;
    sheet.devTime = 0;
    sheet.state = 'developing';
    sheet.cache.dens = null;
  }

  function devRate(st, proc) {
    const d = st.dev;
    const tempF = Math.pow(2, (d.temp - proc.dev.tempRef) / 10); // Q10 ≈ 2
    const ag = d.agitation === 'none' ? 0.8 : d.agitation === 'gentle' ? 1 : 1.15;
    return (tempF * ag) / proc.dev.tau;
  }

  function devStep(sheet, st, proc, dt) {
    const n = sheet.W * sheet.H;
    const base = devRate(st, proc);
    const d = st.dev;
    const dragK = d.drag * (d.agitation === 'none' ? 1 : d.agitation === 'gentle' ? 0.4 : 0.08);
    let drag = null;
    if (dragK > 0 && proc.dev.mode === 'liquid') {
      const rng = proc.Dmax - proc.Dmin;
      const cur = new Float32Array(n);
      for (let i = 0; i < n; i++) cur[i] = ((sheet.fullD[i] - proc.Dmin) / rng) * (1 - Math.exp(-sheet.progress[i]));
      const sm = U.smearDown(cur, sheet.W, sheet.H, 0.992);
      drag = new Float32Array(n);
      for (let i = 0; i < n; i++) drag[i] = U.clamp((sm[i] - cur[i] * 0.6) * dragK * 2.5, 0, 0.75);
      sheet.dragMap = drag;
    }
    for (let i = 0; i < n; i++) {
      if (sheet.stopped[i]) continue;
      if (sheet.delay && sheet.devTime < sheet.delay[i]) continue;
      let r = base * sheet.activity[i] * dt;
      if (drag) r *= 1 - drag[i];
      sheet.progress[i] += r;
      if (sheet.progress2) sheet.progress2[i] += r;
    }
    sheet.devTime += dt;
    sheet.cache.dens = null;
  }

  // Sabattier: a flash of light mid-development exposes remaining halide through the silver
  // already formed. Bromide released at edges inhibits development there -> Mackie lines.
  function flash(sheet, st, proc, strength) {
    const W = sheet.W, H = sheet.H, L = Math.max(W, H), n = W * H;
    const D = densityNow(sheet, st, proc);
    const inhib = U.blur(D, W, H, L * 0.005);
    sheet.latent2 = new Float32Array(n);
    sheet.fullD2 = new Float32Array(n);
    sheet.progress2 = new Float32Array(n);
    const Hf = strength * proc.H0 * 5;
    for (let i = 0; i < n; i++) {
      const m = Math.max(0, inhib[i] - D[i]) * st.flash.mackie * 4;
      const h = Hf * Math.pow(10, -(D[i] - proc.Dmin)) * Math.max(0, 1 - m);
      sheet.latent2[i] = h;
      sheet.fullD2[i] = Math.max(0, Math.min(curve(h, proc) - proc.Dmin, proc.Dmax - D[i]));
    }
    sheet.cache.dens = null;
  }

  // Current image density (neg-working) or image value 0..1 (pos-working).
  function densityNow(sheet, st, proc) {
    if (sheet.cache.dens) return sheet.cache.dens;
    const n = sheet.W * sheet.H, out = new Float32Array(n);
    const mode = proc.dev.mode;
    const rng = proc.Dmax - proc.Dmin;
    if (mode === 'none') {
      for (let i = 0; i < n; i++) out[i] = 1 - Math.exp((-sheet.latent[i] / proc.H0) * 0.2);
    } else if (mode === 'printout') {
      for (let i = 0; i < n; i++) out[i] = curve(sheet.latent[i], proc);
    } else if (!sheet.fullD) {
      const v = mode === 'solvent' ? 1 : proc.Dmin;
      out.fill(v);
    } else if (mode === 'solvent') {
      for (let i = 0; i < n; i++) {
        const h = (sheet.fullD[i] - proc.Dmin) / rng;
        const w = -0.35 + 1.25 * (1 - Math.exp(-sheet.progress[i]));
        out[i] = U.smoothstep(w - 0.3, w + 0.05, h);
      }
    } else {
      const fog = proc.dev.fog * sheet.devTime * Math.pow(2, (st.dev.temp - proc.dev.tempRef) / 10);
      for (let i = 0; i < n; i++) {
        let D = proc.Dmin + fog + (sheet.fullD[i] - proc.Dmin) * (1 - Math.exp(-sheet.progress[i]));
        if (sheet.fullD2) D += sheet.fullD2[i] * (1 - Math.exp(-sheet.progress2[i]));
        out[i] = mode === 'fume' ? U.clamp((D - proc.Dmin) / rng, 0, 1) : D;
      }
    }
    sheet.cache.dens = out;
    return out;
  }

  // Chemistry brush: paint developer, fixer (resist), water, or a warm thumb onto the sheet.
  function chemBrush(sheet, x0, y0, tool, radius, strength) {
    const W = sheet.W, H = sheet.H;
    if (!sheet.activity) sheet.activity = new Float32Array(W * H).fill(1);
    const R = radius * 1.4;
    for (let y = Math.max(0, (y0 - R) | 0); y < Math.min(H, y0 + R); y++)
      for (let x = Math.max(0, (x0 - R) | 0); x < Math.min(W, x0 + R); x++) {
        const d = Math.hypot(x - x0, y - y0);
        const wob = U.valueNoise(x * 0.08, y * 0.08, sheet.seed + 5);
        const disc = 1 - U.smoothstep(radius * 0.6, radius * (1 + 0.3 * wob), d);
        if (disc <= 0) continue;
        const i = y * W + x;
        const s = disc * strength * 0.12;
        if (tool === 'developer') sheet.activity[i] += s * 2.5;
        else if (tool === 'water') sheet.activity[i] *= 1 - s * 1.5;
        else if (tool === 'fixer') { if (disc > 0.5) sheet.stopped[i] = 1; }
        else if (tool === 'thumb') {
          const ridge = 0.5 + 0.5 * Math.sin(d * 1.7 + wob * 5);
          sheet.activity[i] += s * 3 * ridge;
        }
        sheet.chemMarks[i] = Math.min(1, sheet.chemMarks[i] + s);
      }
    sheet.cache.dens = null;
  }

  Lab.emulsion = { newSheet, curve, reciprocityFactor, commitSession, addLightLeak, testStrip, startDevelop, devStep, flash, densityNow, chemBrush };
})(window.Lab);
