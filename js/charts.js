/* ===================================================
   charts.js — Canvas chart drawing
   =================================================== */
'use strict';

const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function chartTheme() {
  return {
    text: isDark() ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    grid: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };
}

function clearCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function setupCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const h   = parseInt(canvas.getAttribute('height')) || 110;

  // Paso 1: dejar que CSS defina el ancho (100% del contenedor)
  canvas.style.width  = '100%';
  canvas.style.height = h + 'px';
  // Poner dimensiones internas a 1 temporalmente para que no inflen el padre
  canvas.width  = 1;
  canvas.height = 1;

  // Paso 2: leer el ancho REAL que ha calculado el layout
  const w = canvas.offsetWidth || canvas.parentElement?.clientWidth || window.innerWidth - 52;

  // Paso 3: asignar las dimensiones internas del canvas con DPR
  canvas.width  = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawLineChart(id, data, color) {
  if (!data || data.length < 2) { clearCanvas(id); return; }
  const s = setupCanvas(id);
  if (!s) return;
  const { ctx, w, h } = s;
  const { text, grid } = chartTheme();

  const vals = data.map(d => d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  // Adaptive left padding based on Y label width
  ctx.font = '10px -apple-system,sans-serif';
  const yLabelW = ctx.measureText(formatBigNum(Math.round(maxV))).width;
  const pad = { t: 14, r: 14, b: 28, l: Math.max(34, yLabelW + 10) };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const xStep = cw / (data.length - 1);

  ctx.clearRect(0, 0, w, h);

  // Grid + Y labels
  for (let i = 0; i <= 4; i++) {
    const y   = pad.t + ch - (i / 4) * ch;
    const val = minV + (i / 4) * range;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right';
    const label = Number.isInteger(val) ? formatBigNum(Math.round(val)) : val.toFixed(1);
    ctx.fillText(label, pad.l - 5, y + 3.5);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.l + i * xStep, y = pad.t + ch - ((d.value - minV) / range) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.l + (data.length - 1) * xStep, pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  data.forEach((d, i) => {
    const x = pad.l + i * xStep, y = pad.t + ch - ((d.value - minV) / range) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  data.forEach((d, i) => {
    const x = pad.l + i * xStep, y = pad.t + ch - ((d.value - minV) / range) * ch;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  });

  // X labels — smart spacing
  ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(data.length / Math.floor(cw / 36)));
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1)
      ctx.fillText(d.label, pad.l + i * xStep, pad.t + ch + 18);
  });
}

function drawBarChart(id, data, color) {
  if (!data || !data.length) { clearCanvas(id); return; }
  const s = setupCanvas(id);
  if (!s) return;
  const { ctx, w, h } = s;
  const { text, grid } = chartTheme();

  const maxV = Math.max(...data.map(d => d.value)) || 1;

  // Adaptive left padding
  ctx.font = '10px -apple-system,sans-serif';
  const yLabelW = ctx.measureText(formatBigNum(Math.round(maxV))).width;
  const pad = { t: 14, r: 14, b: 28, l: Math.max(34, yLabelW + 10) };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const gap  = cw / data.length;
  const barW = Math.max(4, gap * 0.6);

  ctx.clearRect(0, 0, w, h);

  // Grid + Y labels
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch - (i / 4) * ch;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(formatBigNum(Math.round(maxV * i / 4)), pad.l - 5, y + 3.5);
  }

  // Bars
  data.forEach((d, i) => {
    const x    = pad.l + i * gap + (gap - barW) / 2;
    const barH = Math.max(3, (d.value / maxV) * ch);
    const y    = pad.t + ch - barH;
    const grad = ctx.createLinearGradient(0, y, 0, pad.t + ch);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '77');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [4, 4, 1, 1]);
    else ctx.rect(x, y, barW, barH);
    ctx.fill();
  });

  // X labels — smart spacing
  ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(data.length / Math.floor(cw / 32)));
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1)
      ctx.fillText(d.label, pad.l + i * gap + gap / 2, pad.t + ch + 18);
  });
}
