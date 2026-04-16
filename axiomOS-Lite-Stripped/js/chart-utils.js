// ================================================================
// chart-utils.js
// Shared canvas chart primitives used by stats and deep work.
// Extracted to remove the previous hidden dependency on deepwork.js.
// ================================================================

(function initAxiomChartUtils(global) {
  function getVisibleXAxisIndexes(total, usableWidth, minSpacing = 44) {
    if (total <= 0) return [];
    if (total <= 2) return Array.from({ length: total }, (_, index) => index);

    const maxLabels = Math.max(2, Math.floor(Math.max(usableWidth, 1) / minSpacing) + 1);
    const step = Math.max(1, Math.ceil((total - 1) / Math.max(1, maxLabels - 1)));
    const indexes = [];

    for (let index = 0; index < total; index += step) indexes.push(index);
    if (indexes[indexes.length - 1] !== total - 1) indexes.push(total - 1);

    return indexes;
  }

  function drawLineChart(canvas, labels, data) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
    const cssH = 180;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    ctx.clearRect(0, 0, W, H);

    const max = Math.max(1, ...data);
    const pad = 28;
    const stepX = (W - pad * 2) / Math.max(1, labels.length - 1);

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = pad + ((H - pad * 2) / 3) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
    }

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00e5a0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = pad + stepX * index;
      const y = H - pad - (value / max) * (H - pad * 2);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const visibleIndexes = getVisibleXAxisIndexes(labels.length, W - pad * 2);
    visibleIndexes.forEach((index) => {
      const label = labels[index];
      const x = pad + stepX * index;
      ctx.fillText(label, x, H - 8);
    });
  }

  function drawDoughnutChart(canvas, labels, data, colors) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
    const cssH = 180;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    const total = data.reduce((sum, value) => sum + value, 0) || 1;
    const cx = W / 2;
    const cy = H / 2 - 4;
    const radius = Math.min(W, H) * 0.28;
    const inner = radius * 0.58;

    ctx.clearRect(0, 0, W, H);

    let start = -Math.PI / 2;
    data.forEach((value, index) => {
      const slice = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start += slice;
    });

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    labels.forEach((label, index) => {
      const y = H - 54 + index * 14;
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(16, y - 8, 8, 8);
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillText(label, 30, y);
    });
  }

  global.AxiomChartUtils = Object.freeze({
    getVisibleXAxisIndexes,
    drawLineChart,
    drawDoughnutChart,
  });

  global._drawLineChart = drawLineChart;
  global._drawDoughnutChart = drawDoughnutChart;
})(typeof globalThis !== 'undefined' ? globalThis : window);
