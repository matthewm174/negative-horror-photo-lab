'use strict';
// Core numeric utilities: seeded randomness, noise, blur, sampling, image IO.
window.Lab = window.Lab || {};
(function (Lab) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function fbm(x, y, seed, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * valueNoise(x * f, y * f, seed + i * 101);
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return s / norm;
  }

  // fBm field, scale in pixels; sx/sy stretch for anisotropic textures (paper fibres, streaks).
  function fbmField(W, H, scalePx, seed, oct = 4, sx = 1, sy = 1) {
    const out = new Float32Array(W * H);
    const ix = 1 / (scalePx * sx), iy = 1 / (scalePx * sy);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) out[y * W + x] = fbm(x * ix, y * iy, seed, oct);
    return out;
  }

  function gaussian(rnd) {
    const u = rnd() || 1e-9, v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function poisson(lambda, rnd) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= rnd(); } while (p > L);
      return k - 1;
    }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rnd)));
  }

  // Box sizes approximating a Gaussian (Wells 1986, cascaded uniform filters).
  function boxesForGauss(sigma, n) {
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
    const m = Math.round(mIdeal);
    const sizes = [];
    for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
    return sizes;
  }

  function boxH(src, dst, W, H, r) {
    if (r < 1) { dst.set(src); return; }
    const inv = 1 / (r + r + 1);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        dst[row + x] = acc * inv;
        acc += src[row + Math.min(x + r + 1, W - 1)] - src[row + Math.max(x - r, 0)];
      }
    }
  }

  function boxV(src, dst, W, H, r) {
    if (r < 1) { dst.set(src); return; }
    const inv = 1 / (r + r + 1);
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[clamp(k, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        dst[y * W + x] = acc * inv;
        acc += src[Math.min(y + r + 1, H - 1) * W + x] - src[Math.max(y - r, 0) * W + x];
      }
    }
  }

  // Separable (possibly anisotropic) Gaussian blur; returns a new array.
  function blur(src, W, H, sx, sy = sx) {
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    if (sx > 0.35) for (const w of boxesForGauss(sx, 3)) { boxH(a, b, W, H, (w - 1) >> 1); [a, b] = [b, a]; }
    if (sy > 0.35) for (const w of boxesForGauss(sy, 3)) { boxV(a, b, W, H, (w - 1) >> 1); [a, b] = [b, a]; }
    return a;
  }

  // One-directional exponential smear (used for bromide drag flowing down the sheet).
  function smearDown(src, W, H, k) {
    const out = new Float32Array(src.length);
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        acc = acc * k + src[i] * (1 - k);
        out[i] = acc;
      }
    }
    return out;
  }

  function sampleBilinear(buf, W, H, x, y, outside) {
    if (x < -0.5 || y < -0.5 || x > W - 0.5 || y > H - 0.5) return outside;
    x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);
    const x0 = x | 0, y0 = y | 0;
    const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    const fx = x - x0, fy = y - y0;
    const a = buf[y0 * W + x0], b = buf[y0 * W + x1], c = buf[y1 * W + x0], d = buf[y1 * W + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const linToSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  // Draw any drawable into an RGB float image (sRGB-encoded, 0..1), long side <= maxSide.
  function readDrawable(src, maxSide, sw, sh) {
    sw = sw || src.naturalWidth || src.videoWidth || src.width;
    sh = sh || src.naturalHeight || src.videoHeight || src.height;
    const s = Math.min(1, maxSide / Math.max(sw, sh));
    const W = Math.max(1, Math.round(sw * s)), H = Math.max(1, Math.round(sh * s));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const r = new Float32Array(W * H), g = new Float32Array(W * H), b = new Float32Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) { r[i] = d[j] / 255; g[i] = d[j + 1] / 255; b[i] = d[j + 2] / 255; }
    return { W, H, r, g, b };
  }

  function loadImageFile(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  Lab.util = {
    clamp, lerp, smoothstep, mulberry32, hash2, valueNoise, fbm, fbmField, gaussian, poisson,
    blur, smearDown, sampleBilinear, srgbToLin, linToSrgb, readDrawable, loadImageFile,
  };
})(window.Lab);
