'use strict';
// Final rendering: density -> reflectance -> ageing -> toning. Every output passes through
// enforceMonochrome(), a chroma ceiling that keeps results within black-and-white / sepia families.
(function (Lab) {
  const U = Lab.util;

  // Palettes: [shadow, mid, highlight] in sRGB.
  const PALETTES = {
    obscura: [[0.035, 0.035, 0.04], [0.44, 0.43, 0.41], [0.9, 0.88, 0.84]],
    pewter: [[0.1, 0.1, 0.095], [0.42, 0.4, 0.36], [0.8, 0.76, 0.66]],
    daguerreotype: [[0.05, 0.055, 0.06], [0.45, 0.46, 0.47], [0.88, 0.89, 0.88]],
    calotype: [[0.2, 0.1, 0.05], [0.55, 0.38, 0.24], [0.93, 0.86, 0.72]],
    salt: [[0.22, 0.1, 0.07], [0.62, 0.44, 0.33], [0.95, 0.89, 0.78]],
    collodion: [[0.05, 0.045, 0.04], [0.45, 0.43, 0.4], [0.9, 0.88, 0.84]],
    gelatin: [[0.03, 0.03, 0.03], [0.46, 0.45, 0.43], [0.94, 0.93, 0.9]],
  };
  const TONERS = {
    sepia: [[0.18, 0.11, 0.06], [0.58, 0.43, 0.29], [0.95, 0.9, 0.8]],
    selenium: [[0.1, 0.06, 0.08], [0.44, 0.4, 0.41], [0.94, 0.93, 0.9]],
    gold: [[0.04, 0.05, 0.08], [0.42, 0.43, 0.46], [0.93, 0.93, 0.92]],
  };
  const STAIN = [0.86, 0.7, 0.42];
  const CHROMA_CEILING = 0.16;

  function pal(p, t, o) {
    if (t < 0.5) { const k = t * 2; for (let c = 0; c < 3; c++) o[c] = p[0][c] + (p[1][c] - p[0][c]) * k; }
    else { const k = (t - 0.5) * 2; for (let c = 0; c < 3; c++) o[c] = p[1][c] + (p[2][c] - p[1][c]) * k; }
    return o;
  }

  function enforceMonochrome(o) {
    const Y = 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
    const m = Math.max(Math.abs(o[0] - Y), Math.abs(o[1] - Y), Math.abs(o[2] - Y));
    if (m > CHROMA_CEILING) { const s = CHROMA_CEILING / m; for (let c = 0; c < 3; c++) o[c] = Y + (o[c] - Y) * s; }
    return o;
  }

  // Returns {L, stain} linear reflectance + stain fraction per pixel.
  function compose(sheet, st, proc, opts = {}) {
    const W = sheet.W, H = sheet.H, n = W * H;
    const base = Lab.emulsion.densityNow(sheet, st, proc);
    const { loss, mod } = Lab.artifacts.plateDefects(sheet, st, proc);
    const pos = proc.polarity === 'pos';
    const D = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lo = pos ? 0 : proc.Dmin;
      D[i] = lo + (base[i] - lo) * (1 - loss[i]) * mod[i];
    }
    const gScale = pos ? 1.6 : 1;
    const seed = opts.grainSeed != null ? opts.grainSeed : sheet.seed;
    const G = Lab.artifacts.grain(D, W, H, st.grain.size, st.grain.amount, seed, gScale);

    const Y = st.age.years;
    const developed = sheet.state === 'developed' || sheet.state === 'fixed' || proc.dev.mode === 'printout' || proc.dev.mode === 'none';
    const res = proc.fixRef > 0 && developed ? 1 - sheet.fixQ : 0;
    const washMiss = proc.washRef > 0 && developed ? 1 - sheet.washQ : 0;
    const am = Y > 0 ? Lab.artifacts.ageMaps(sheet, st, proc) : null;
    const fade = U.clamp((st.plate.fade * Y) / 200 * (1.4 - 0.6 * (1 - washMiss)), 0, 0.75);
    const L = new Float32Array(n), stain = new Float32Array(n);
    const env = st.age.env;

    for (let i = 0; i < n; i++) {
      let l, s = 0;
      const mott = am ? am.mott[i] : 0.5;
      if (!pos) {
        let d = G[i];
        d = proc.Dmin + (d - proc.Dmin) * (1 - fade);
        if (res > 0 && Y > 0) d += res * 0.7 * (1 - Math.exp(-Y / 0.7)) * (0.6 + 0.8 * mott); // unfixed silver prints out
        if (am) d += am.fox[i] * 0.15;
        l = Math.pow(10, -Math.max(0, d));
        if (am && am.silver[i] > 0) l += (0.55 - l) * am.silver[i] * U.clamp((d - proc.Dmin) / (proc.Dmax - proc.Dmin), 0, 1);
      } else {
        let v = U.clamp(G[i], 0, 1) * (1 - fade * 0.6);
        if (proc.dev.mode === 'fume') l = v * 0.6 + (1 - v) * env; // diffuse amalgam vs. mirror reflecting the surroundings
        else if (proc.dev.mode === 'solvent') l = 0.14 + v * 0.62;
        else l = v;
        if (res > 0 && Y > 0) l *= 1 - res * 0.5 * (1 - Math.exp(-Y));
        if (am) l *= 1 - am.tarnish[i] * 0.8;
      }
      if (Y > 0) {
        s = U.clamp(washMiss * (Y / 40) + res * (Y / 15) + (st.plate.fade * Y) / 300, 0, 0.8) * (0.5 + mott) * Math.min(1, l * 1.5);
        if (am) s = Math.min(1, s + am.fox[i] * 0.8);
      }
      if (sheet.chemMarks[i] > 0 && developed) s = Math.min(1, s + sheet.chemMarks[i] * 0.25 * Math.min(1, Y / 5 + 0.2));
      L[i] = U.clamp(l, 0, 1);
      stain[i] = s;
    }
    return { L, stain };
  }

  function toRGBA(sheet, st, proc, comp, out) {
    const { L, stain } = comp;
    const n = sheet.W * sheet.H;
    out = out || new Uint8ClampedArray(n * 4);
    const native = PALETTES[proc.palette];
    const toner = TONERS[st.tone.toner];
    const str = st.tone.strength;
    const o = [0, 0, 0], q = [0, 0, 0];
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const t = Math.pow(L[i], 1 / 2.2);
      pal(native, t, o);
      if (toner) {
        let w = str;
        if (st.tone.toner === 'sepia') w = U.clamp(str * 2 - (1 - t), 0, 1); // bleach attacks highlights first
        if (st.tone.toner === 'selenium') w = U.clamp(str * 2 - t, 0, 1); // selenium converts shadows first
        pal(toner, t, q);
        for (let c = 0; c < 3; c++) o[c] += (q[c] - o[c]) * w;
      }
      const s = stain[i];
      if (s > 0) for (let c = 0; c < 3; c++) o[c] = o[c] * (1 - s * 0.6) + o[c] * STAIN[c] * s * 0.6;
      enforceMonochrome(o);
      out[j] = o[0] * 255; out[j + 1] = o[1] * 255; out[j + 2] = o[2] * 255; out[j + 3] = 255;
    }
    return out;
  }

  function drawCracks(ctx, sheet) {
    if (!sheet.cracks.length) return;
    ctx.save();
    for (const pts of sheet.cracks) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(235,228,214,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.translate(1, 1);
      ctx.strokeStyle = 'rgba(10,9,8,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.translate(-1, -1);
    }
    ctx.restore();
  }

  // Projection view: what you'd see of the enlarger light on the easel (always neutral grey).
  function projectionRGBA(E, W, H) {
    let mx = 1e-6;
    for (let i = 0; i < E.length; i++) mx = Math.max(mx, E[i]);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0, j = 0; i < E.length; i++, j += 4) {
      const v = Math.pow(E[i] / mx, 1 / 2.2) * 200;
      out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
    }
    return out;
  }

  Lab.render = { compose, toRGBA, drawCracks, projectionRGBA, enforceMonochrome, PALETTES, TONERS };
})(window.Lab);
