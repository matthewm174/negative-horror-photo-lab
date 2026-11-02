'use strict';
// Film reel: every frame of a video is printed through the current darkroom setup, with film-transport
// instabilities (gate weave, flicker, scratches, dust, frame-line slip), chemistry exhaustion along the reel,
// and optional generational re-photography (each frame printed again from its own print).
(function (Lab) {
  const U = Lab.util, O = Lab.optics, E = Lab.emulsion, R = Lab.render;

  function seekTo(video, t) {
    return new Promise((res) => {
      const done = () => { video.removeEventListener('seeked', done); res(); };
      video.addEventListener('seeked', done);
      video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
    });
  }

  function printFrame(st, proc, src, W, H, frameIdx, total, reelLayer, rv, transport) {
    const saved = { x: reelLayer.x, y: reelLayer.y, img: reelLayer.img, intensity: st.lamp.intensity, temp: st.dev.temp };
    reelLayer.img = src; reelLayer.version++;
    reelLayer.x = saved.x + transport.weave[0] / W;
    reelLayer.y = saved.y + transport.weave[1] / H;
    st.lamp.intensity = saved.intensity * Math.max(0.05, 1 + transport.flick);
    st.dev.temp = saved.temp - rv.exhaustion * 8 * (frameIdx / Math.max(1, total)); // spent developer works like a colder bath
    const sheet = E.newSheet(W, H, rv.stockSeed);
    try {
      const sess = O.runInstant(st, proc, sheet);
      E.commitSession(sheet, sess, st, proc);
      if (['liquid', 'fume', 'solvent'].includes(proc.dev.mode)) {
        E.startDevelop(sheet, st, proc);
        const steps = 10;
        for (let k = 0; k < steps; k++) E.devStep(sheet, st, proc, st.dev.time / steps);
      }
      sheet.state = 'fixed'; sheet.fixQ = 1; sheet.washQ = 1;
      const comp = R.compose(sheet, st, proc, { grainSeed: rv.stockSeed + frameIdx * 7919 + transport.gen * 31 });
      return R.toRGBA(sheet, st, proc, comp);
    } finally {
      reelLayer.x = saved.x; reelLayer.y = saved.y; reelLayer.img = saved.img; reelLayer.version++;
      st.lamp.intensity = saved.intensity; st.dev.temp = saved.temp;
    }
  }

  function damage(ctx, W, H, rnd, rv, scratches) {
    // Persistent scratches travel with the reel and slowly wander.
    if (rnd() < rv.scratches * 0.08) scratches.push({ x: rnd() * W, life: 10 + rnd() * 80, w: 0.6 + rnd() * 1.5, light: rnd() < 0.5 });
    for (const s of scratches) {
      s.x += (rnd() - 0.5) * 1.5; s.life--;
      ctx.fillStyle = s.light ? 'rgba(232,226,212,0.55)' : 'rgba(8,8,8,0.6)';
      ctx.fillRect(s.x, 0, s.w, H);
    }
    for (let k = scratches.length - 1; k >= 0; k--) if (scratches[k].life <= 0) scratches.splice(k, 1);
    const dn = Math.round(rv.dust * 25 * rnd());
    for (let d = 0; d < dn; d++) {
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(5,5,5,0.85)' : 'rgba(235,230,220,0.8)';
      ctx.beginPath();
      const x = rnd() * W, y = rnd() * H, r = 0.5 + Math.pow(rnd(), 3) * 6;
      if (rnd() < 0.2) { ctx.lineWidth = 0.8; ctx.strokeStyle = ctx.fillStyle; ctx.moveTo(x, y); ctx.bezierCurveTo(x + 10 * rnd(), y + 15 * rnd(), x - 10 * rnd(), y + 20 * rnd(), x + 20 * (rnd() - 0.5), y + 30 * rnd()); ctx.stroke(); }
      else { ctx.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  async function developReel(st, proc, video, rv, onProgress, isCancelled) {
    const reelLayer = st.layers.find((l) => l.reelSource && l.kind === 'image') || st.layers.find((l) => l.kind === 'image');
    if (!reelLayer) throw new Error('Add a transparency layer and tick "Reel source" first.');
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.min(1, rv.width / vw);
    const W = Math.round(vw * s) & ~1, H = Math.round(vh * s) & ~1;
    const total = Math.max(1, Math.floor(rv.duration * rv.fps));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rnd = U.mulberry32(rv.stockSeed);
    const frames = [];
    const scratches = [];
    let weave = [0, 0], flick = 0;
    for (let f = 0; f < total; f++) {
      if (isCancelled()) break;
      await seekTo(video, rv.start + f / rv.fps);
      let src = U.readDrawable(video, Math.max(W, H));
      weave = [weave[0] * 0.7 + U.gaussian(rnd) * rv.weave * 1.2, weave[1] * 0.7 + U.gaussian(rnd) * rv.weave * 1.2];
      flick = flick * 0.3 + U.gaussian(rnd) * rv.flicker * 0.25;
      let rgba;
      for (let g = 0; g < rv.generations; g++) {
        rgba = printFrame(st, proc, src, W, H, f, total, reelLayer, rv, { weave, flick, gen: g });
        if (g < rv.generations - 1) {
          ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
          src = U.readDrawable(canvas, Math.max(W, H));
        }
      }
      ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
      if (rnd() < rv.slip * 0.05) {
        // Frame-line slip: the claw misses and the frame line rolls into view.
        const off = (rnd() * H * 0.3) | 0;
        const img = ctx.getImageData(0, 0, W, H);
        ctx.putImageData(img, 0, off);
        ctx.putImageData(img, 0, off - H);
        ctx.fillStyle = '#060606';
        ctx.fillRect(0, off - 4, W, 8);
      }
      damage(ctx, W, H, rnd, rv, scratches);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      for (let k = 0; k < rv.stepPrint; k++) frames.push(blob);
      onProgress(f + 1, total, canvas);
      await new Promise((r) => setTimeout(r, 0));
    }
    return { frames, W, H, fps: rv.fps };
  }

  async function projectAndRecord(reel, canvas, record) {
    canvas.width = reel.W; canvas.height = reel.H;
    const ctx = canvas.getContext('2d');
    let rec = null, chunks = [];
    if (record) {
      const stream = canvas.captureStream(reel.fps);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start();
    }
    const dt = 1000 / reel.fps;
    let next = await createImageBitmap(reel.frames[0]);
    const t0 = performance.now();
    for (let k = 0; k < reel.frames.length; k++) {
      const bmp = next;
      const pending = k + 1 < reel.frames.length ? createImageBitmap(reel.frames[k + 1]) : null;
      const wait = t0 + k * dt - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      if (pending) next = await pending;
    }
    await new Promise((r) => setTimeout(r, dt));
    if (!rec) return null;
    return new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' })); rec.stop(); });
  }

  Lab.reel = { developReel, projectAndRecord };
})(window.Lab);
