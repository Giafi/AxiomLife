// =================================================================
// background.js - viewport-bound particle background
//
// Goals:
// - keep the background decoupled from body/layout mutations
// - avoid resize-triggered canvas clears on every section refresh
// - remain idempotent if the script is loaded more than once
// =================================================================

(function initBackgroundCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || window.__axiomBackgroundCanvasStarted) return;
  window.__axiomBackgroundCanvasStarted = true;

  function readViewportSize() {
    const viewport = window.visualViewport;
    return {
      width: Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement?.clientWidth || 1)),
      height: Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 1)),
    };
  }

  function createViewportObserver(onResize) {
    let frameId = 0;
    let lastWidth = -1;
    let lastHeight = -1;

    function flush() {
      frameId = 0;
      const next = readViewportSize();
      if (next.width === lastWidth && next.height === lastHeight) return;
      lastWidth = next.width;
      lastHeight = next.height;
      onResize(next);
    }

    function schedule() {
      if (frameId) return;
      frameId = requestAnimationFrame(flush);
    }

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    window.visualViewport?.addEventListener?.('resize', schedule, { passive: true });
    flush();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener?.('resize', schedule);
    };
  }

  // Try the OffscreenCanvas worker path first.
  if (typeof OffscreenCanvas !== 'undefined' && canvas.transferControlToOffscreen) {
    try {
      const { width, height } = readViewportSize();
      const offscreen = canvas.transferControlToOffscreen();
      const workerCode = `
        const pts = Array.from({ length: 12 }, () => ({
          x: Math.random() * 800,
          y: Math.random() * 600,
          r: Math.random() * 1.5 + .3,
          vx: (Math.random() - .5) * .18,
          vy: (Math.random() - .5) * .18,
          op: Math.random() * .3 + .07,
          col: Math.random() > .6 ? '0,229,160' : '0,153,255'
        }));
        let ctx = null;
        let w = 800;
        let h = 600;
        let lastT = 0;
        let fps = 20;
        let interval = 1000 / fps;

        self.onmessage = (e) => {
          if (e.data.type === 'init') {
            ctx = e.data.canvas.getContext('2d', { alpha: true });
            w = e.data.w;
            h = e.data.h;
            pts.forEach((p) => { p.x = Math.random() * w; p.y = Math.random() * h; });
            requestAnimationFrame(draw);
          }
          if (e.data.type === 'resize') { w = e.data.w; h = e.data.h; }
          if (e.data.type === 'fps') {
            fps = e.data.fps;
            interval = 1000 / fps;
          }
        };

        function draw(ts) {
          requestAnimationFrame(draw);
          if (!ctx || ts - lastT < interval) return;
          lastT = ts;
          ctx.clearRect(0, 0, w, h);
          pts.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + p.col + ',' + p.op + ')';
            ctx.fill();
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
          });
        }
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.postMessage({ type: 'init', canvas: offscreen, w: width, h: height }, [offscreen]);

      createViewportObserver(({ width: nextWidth, height: nextHeight }) => {
        worker.postMessage({ type: 'resize', w: nextWidth, h: nextHeight });
      });

      window.addEventListener('focus', () => worker.postMessage({ type: 'fps', fps: 20 }));
      window.addEventListener('blur', () => worker.postMessage({ type: 'fps', fps: 8 }));
      return;
    } catch (err) {
      console.warn('[Background] OffscreenCanvas path failed, falling back:', err);
    }
  }

  // Main-thread fallback.
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const pts = Array.from({ length: 12 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.5 + .3,
    vx: (Math.random() - .5) * .18,
    vy: (Math.random() - .5) * .18,
    op: Math.random() * .3 + .07,
    col: Math.random() > .6 ? '0,229,160' : '0,153,255'
  }));

  let rafId = null;
  let lastT = 0;
  let fps = 20;
  let interval = 1000 / fps;

  function resize(width, height) {
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
  }

  createViewportObserver(({ width, height }) => resize(width, height));

  function draw(ts) {
    if (document.hidden) {
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(draw);
    if (ts - lastT < interval) return;
    lastT = ts;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.col},${p.op})`;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      else if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      else if (p.y > canvas.height) p.y = 0;
    });
  }

  window.addEventListener('focus', () => {
    fps = 20;
    interval = 1000 / fps;
  });
  window.addEventListener('blur', () => {
    fps = 8;
    interval = 1000 / fps;
  });

  rafId = requestAnimationFrame(draw);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !rafId) {
      lastT = 0;
      rafId = requestAnimationFrame(draw);
    }
  });
})();
