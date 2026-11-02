'use strict';
// Material artifacts: coating unevenness, poured-plate defects, paper fibres, silver grain, ageing.
(function (Lab) {
  const U = Lab.util;

  function memo(sheet, key, fn) {
    if (sheet.cache[key] && sheet.cache[key].k === fn.k) return sheet.cache[key].v;
    const v = fn();
    sheet.cache[key] = { k: fn.k, v };
    return v;
  }
  const keyed = (k, f) => { f.k = k; return f; };

  // Plate sensitivity: uneven coating, pooling at the pour corner, the uncoated thumb corner, paper fibres, dust on the plate.
  function sensitivity(sheet, st, proc) {
    const a = st.plate;
    const k = [proc.id, a.coat, a.pool, a.thumb, a.fibers, a.dust, sheet.W, sheet.H].join('|');
    return memo(sheet, 'sens', keyed(k, () => {
      const W = sheet.W, H = sheet.H, L = Math.max(W, H), n = W * H;
      const out = new Float32Array(n);
      const coat = U.fbmField(W, H, L * 0.15, sheet.seed + 1, 4);
      const streak = a.pool > 0 ? U.fbmField(W, H, L * 0.05, sheet.seed + 2, 3, 0.4, 5) : null;
      const fib = a.fibers > 0 ? fibres(sheet) : null;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let s = 1 + a.coat * 1.4 * (coat[i] - 0.5);
          if (streak) {
            const dc = Math.hypot(W - x, H - y) / L; // collodion drains to the bottom-right corner
            s *= 1 + a.pool * (0.7 * Math.exp(-dc / 0.25) + 0.35 * (streak[i] - 0.5));
          }
          if (fib) s *= 1 + a.fibers * 0.5 * (fib[i] - 0.5);
          if (a.thumb > 0) {
            const wob = U.fbm(x / (L * 0.02), y / (L * 0.02), sheet.seed + 3, 3);
            if (Math.hypot(x, y) < L * 0.07 * a.thumb * (0.75 + 0.5 * wob)) s = 0;
          }
          out[i] = Math.max(0, s);
        }
      if (a.dust > 0) {
        const rnd = U.mulberry32(sheet.seed + 4);
        const m = Math.round(a.dust * 400);
        for (let d = 0; d < m; d++) {
          const cx = rnd() * W, cy = rnd() * H, r = 0.5 + Math.pow(rnd(), 4) * 4;
          for (let y = Math.max(0, (cy - r - 1) | 0); y < Math.min(H, cy + r + 1); y++)
            for (let x = Math.max(0, (cx - r - 1) | 0); x < Math.min(W, cx + r + 1); x++)
              if (Math.hypot(x - cx, y - cy) < r) out[y * W + x] = 0;
        }
      }
      return out;
    }));
  }

  function fibres(sheet) {
    return memo(sheet, 'fib', keyed(sheet.W + 'x' + sheet.H, () => {
      const W = sheet.W, H = sheet.H, L = Math.max(W, H);
      const a = U.fbmField(W, H, L * 0.012, sheet.seed + 7, 3, 3.5, 0.6);
      const b = U.fbmField(W, H, L * 0.03, sheet.seed + 8, 3, 0.7, 2.5);
      for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.6 + b[i] * 0.4;
      return a;
    }));
  }

  // Loss map (0..1 fraction of image removed) + modulation map (multiplier) from process defects.
  function plateDefects(sheet, st, proc) {
    const a = st.plate;
    const k = [proc.id, a.comets, a.oyster, a.buff, a.frilling, st.dev.temp, st.age.years, sheet.W, sheet.H].join('|');
    return memo(sheet, 'defects', keyed(k, () => {
      const W = sheet.W, H = sheet.H, L = Math.max(W, H), n = W * H;
      const loss = new Float32Array(n), mod = new Float32Array(n).fill(1);
      const rnd = U.mulberry32(sheet.seed + 9);
      // Comets: specks of dirt in the collodion that the silver flows around.
      const cn = Math.round(a.comets * 30);
      for (let c = 0; c < cn; c++) {
        const cx = rnd() * W, cy = rnd() * H;
        const ang = Math.PI / 2 + (rnd() - 0.5) * 0.8, len = L * (0.01 + rnd() * 0.06), w = 1 + rnd() * 2.5;
        for (let t = 0; t < len; t++) {
          const px = cx + Math.cos(ang) * t, py = cy + Math.sin(ang) * t;
          const r = w * (1 - t / len) + 0.4;
          const fall = 1 - t / len;
          for (let y = Math.max(0, (py - r - 1) | 0); y < Math.min(H, py + r + 1); y++)
            for (let x = Math.max(0, (px - r - 1) | 0); x < Math.min(W, px + r + 1); x++) {
              const d = Math.hypot(x - px, y - py);
              if (d < r) { const i = y * W + x; loss[i] = Math.max(loss[i], 0.95 * fall * (1 - d / r) + (t < 2 ? 0.5 : 0)); }
            }
        }
      }
      // Oyster-shell drying lines and gelatin frilling near the edges.
      const fr = a.frilling * (Math.max(0, st.dev.temp - 24) / 6 + st.age.years / 120);
      const noise = a.oyster > 0 || fr > 0 ? U.fbmField(W, H, L * 0.05, sheet.seed + 10, 3) : null;
      const theta = rnd() * 0.3;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (a.oyster > 0) {
            const d = Math.hypot(x - W * 1.05, y + H * 0.05) / L;
            const near = Math.exp(-Math.max(0, d - 0.25) / 0.12);
            const band = Math.pow(0.5 + 0.5 * Math.sin(d * 140 + noise[i] * 9), 6);
            mod[i] *= 1 + a.oyster * 0.35 * near * (band - 0.3);
          }
          if (fr > 0) {
            const e = Math.min(x, y, W - 1 - x, H - 1 - y) / L;
            if (e < 0.05 * fr * (0.4 + noise[i])) loss[i] = Math.max(loss[i], U.clamp(fr, 0, 1));
          }
          if (a.buff > 0) {
            // Fine hairline polishing marks from buffing the plate.
            const u = x * Math.cos(theta) + y * Math.sin(theta);
            const line = U.hash2(Math.floor(u * 1.3), 0, sheet.seed) > 0.985 ? 1 : 0;
            mod[i] *= 1 - a.buff * 0.12 * line;
          }
        }
      if (a.fibers > 0) {
        const f = fibres(sheet);
        for (let i = 0; i < n; i++) mod[i] *= 1 + a.fibers * 0.3 * (f[i] - 0.5);
      }
      return { loss, mod };
    }));
  }

  // Silver grain as a Boolean model: each cell holds a Poisson number of opaque grains whose
  // expected coverage reproduces the local density (after Newson et al. 2017).
  function grain(D, W, H, size, amount, seed, scale) {
    if (amount <= 0) return D;
    const c = 0.004 + amount * amount * 0.6;
    const rnd = U.mulberry32(seed);
    const out = Float32Array.from(D);
    const passes = size > 1.5 ? [[size, 0.75], [Math.max(1, size / 2.5), 0.45]] : [[1, 1]];
    for (const [cell, wgt] of passes) {
      const cw = Math.ceil(W / cell) + 1, ch = Math.ceil(H / cell) + 1;
      const diff = new Float32Array(cw * ch);
      for (let cy = 0; cy < ch; cy++)
        for (let cx = 0; cx < cw; cx++) {
          const x = Math.min(W - 1, (cx * cell) | 0), y = Math.min(H - 1, (cy * cell) | 0);
          const d = Math.max(0, D[y * W + x] * scale);
          const k = U.poisson((d * Math.LN10) / c, rnd);
          diff[cy * cw + cx] = ((k * c) / Math.LN10 - d) / scale;
        }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          out[y * W + x] += wgt * U.sampleBilinear(diff, cw, ch, x / cell, y / cell, 0);
    }
    return out;
  }

  function edgeDist(x, y, W, H) { return Math.min(x, y, W - 1 - x, H - 1 - y); }

  // Ageing maps: foxing, tarnish halo, silvering-out mask, stain mottling.
  function ageMaps(sheet, st, proc) {
    const ag = st.age, a = st.plate;
    const k = [proc.id, ag.years, ag.sealed, a.foxing, a.tarnish, a.silvering, sheet.W, sheet.H].join('|');
    return memo(sheet, 'age', keyed(k, () => {
      const W = sheet.W, H = sheet.H, L = Math.max(W, H), n = W * H;
      const fox = new Float32Array(n), tarnish = new Float32Array(n), silver = new Float32Array(n);
      const mott = U.fbmField(W, H, L * 0.12, sheet.seed + 12, 4);
      const Y = ag.years;
      const rnd = U.mulberry32(sheet.seed + 13);
      const fc = Math.min(500, Math.round(a.foxing * Y * 0.8));
      for (let f = 0; f < fc; f++) {
        const cx = rnd() * W, cy = rnd() * H, r = 1 + Math.pow(rnd(), 2) * L * 0.012;
        for (let y = Math.max(0, (cy - r * 2) | 0); y < Math.min(H, cy + r * 2); y++)
          for (let x = Math.max(0, (cx - r * 2) | 0); x < Math.min(W, cx + r * 2); x++) {
            const d = Math.hypot(x - cx, y - cy) / r;
            const i = y * W + x;
            fox[i] = Math.min(1, fox[i] + Math.exp(-d * d) * (0.5 + 0.5 * rnd()));
          }
      }
      const tAmt = a.tarnish * Math.min(1, Y / 60) * (ag.sealed ? 0.15 : 1);
      const sAmt = a.silvering * Math.min(1, Y / 80);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const e = edgeDist(x, y, W, H) / L;
          if (tAmt > 0) {
            const t = e / 0.16 + 0.35 * mott[i];
            tarnish[i] = tAmt * Math.exp(-t * 2.2) * (0.55 + 0.45 * Math.sin(t * 24));
          }
          if (sAmt > 0) silver[i] = sAmt * Math.exp(-(e / 0.08) * (0.6 + mott[i]));
        }
      return { fox, tarnish, silver, mott };
    }));
  }

  // Glass plate breaks from an impact point.
  function crack(sheet) {
    const W = sheet.W, H = sheet.H, rnd = U.mulberry32((Math.random() * 1e9) | 0);
    const ix = W * (0.2 + rnd() * 0.6), iy = H * (0.2 + rnd() * 0.6);
    const arms = 3 + ((rnd() * 4) | 0);
    for (let a = 0; a < arms; a++) {
      let ang = (a / arms) * Math.PI * 2 + rnd() * 0.8, x = ix, y = iy;
      const pts = [[x, y]];
      while (x > 0 && y > 0 && x < W && y < H) {
        ang += (rnd() - 0.5) * 0.5;
        x += Math.cos(ang) * 12; y += Math.sin(ang) * 12;
        pts.push([x, y]);
      }
      sheet.cracks.push(pts);
    }
  }

  Lab.artifacts = { sensitivity, plateDefects, grain, ageMaps, crack, edgeDist };
})(window.Lab);
