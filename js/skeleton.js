/* ===================================================
   skeleton.js — Skeleton loaders para vistas principales
   =================================================== */
'use strict';

// Bloques reutilizables
const sk = {
  line:  (w = '100%', h = '14px', r = '8px') =>
    `<div class="sk-block" style="width:${w};height:${h};border-radius:${r}"></div>`,
  circle: (size = '40px') =>
    `<div class="sk-block" style="width:${size};height:${size};border-radius:50%;flex-shrink:0"></div>`,
  card:  (inner) =>
    `<div class="sk-card">${inner}</div>`,
};

// ── Plantillas por vista ────────────────────────────────────────────────────

function skDashboard() {
  return `
    <div class="sk-view">
      <!-- Hero peso -->
      <div class="sk-card sk-hero">
        ${sk.line('60px','13px','6px')}
        ${sk.line('120px','52px','10px')}
        ${sk.line('100px','16px','8px')}
      </div>

      <!-- Stats tiles -->
      <div class="sk-row sk-tiles">
        ${[1,2,3].map(() => `
          <div class="sk-card sk-tile">
            ${sk.line('36px','32px','8px')}
            ${sk.line('56px','11px','6px')}
          </div>`).join('')}
      </div>

      <!-- KPI strip -->
      <div class="sk-card sk-kpi-strip">
        ${[1,2,3,4].map(() => `
          <div class="sk-kpi-item">
            ${sk.line('28px','24px','6px')}
            ${sk.line('44px','10px','5px')}
          </div>`).join('')}
      </div>

      <!-- Último entreno -->
      <div class="sk-section-label">${sk.line('110px','11px','6px')}</div>
      ${sk.card(`
        <div style="display:flex;gap:12px;align-items:center">
          ${sk.circle('44px')}
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            ${sk.line('70%','14px')}
            ${sk.line('45%','11px')}
          </div>
        </div>
      `)}

      <!-- Semana -->
      <div class="sk-section-label">${sk.line('130px','11px','6px')}</div>
      ${sk.card(`
        <div style="display:flex;gap:8px;align-items:flex-end;height:60px">
          ${[1,2,3,4,5,6,7].map((_,i) => `
            <div class="sk-block sk-bar" style="height:${20+Math.random()*40}%;flex:1;border-radius:4px 4px 0 0"></div>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          ${[1,2,3,4,5,6,7].map(() => sk.line('10px','9px','4px')).join('')}
        </div>
      `)}

      <!-- Gráfica peso -->
      <div class="sk-section-label">${sk.line('80px','11px','6px')}</div>
      ${sk.card(`<div class="sk-block" style="width:100%;height:90px;border-radius:8px"></div>`)}
    </div>`;
}

function skWorkouts() {
  return `
    <div class="sk-view">
      <!-- Search bar -->
      <div class="sk-block" style="height:40px;border-radius:12px;margin-bottom:16px"></div>

      <!-- Filter chips -->
      <div class="sk-row" style="gap:8px;margin-bottom:20px;overflow:hidden">
        ${[80,64,90,72,60].map(w => `
          <div class="sk-block" style="width:${w}px;height:32px;border-radius:20px;flex-shrink:0"></div>
        `).join('')}
      </div>

      <!-- Workout cards -->
      ${[1,2,3,4].map(() => sk.card(`
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            ${sk.line('90px','13px')}
            ${sk.line('80px','22px','20px')}
          </div>
          ${sk.line('60%','14px')}
          <div style="display:flex;gap:8px">
            ${sk.line('54px','22px','20px')}
            ${sk.line('64px','22px','20px')}
            ${sk.line('48px','22px','20px')}
          </div>
        </div>
      `)).join('')}
    </div>`;
}

function skExercises() {
  return `
    <div class="sk-view">
      <!-- Search -->
      <div class="sk-block" style="height:40px;border-radius:12px;margin-bottom:16px"></div>
      <!-- Muscle chips -->
      <div class="sk-row" style="gap:8px;margin-bottom:20px;overflow:hidden">
        ${[60,72,56,80,64].map(w => `
          <div class="sk-block" style="width:${w}px;height:32px;border-radius:20px;flex-shrink:0"></div>
        `).join('')}
      </div>
      <!-- Groups -->
      ${[1,2,3].map(() => `
        <div style="margin-bottom:20px">
          ${sk.line('90px','12px','6px')}
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:1px">
            ${[1,2,3].map(() => sk.card(`
              <div style="display:flex;align-items:center;gap:12px">
                ${sk.circle('36px')}
                <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                  ${sk.line('55%','13px')}
                  ${sk.line('35%','10px')}
                </div>
              </div>
            `)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function skStats() {
  return `
    <div class="sk-view">
      <!-- Summary cards -->
      <div class="sk-row sk-tiles" style="margin-bottom:16px">
        ${[1,2,3].map(() => `
          <div class="sk-card sk-tile">
            ${sk.line('36px','28px','8px')}
            ${sk.line('52px','11px','6px')}
          </div>`).join('')}
      </div>
      <!-- Tabs -->
      <div class="sk-row" style="gap:8px;margin-bottom:20px">
        ${[1,2,3,4].map(() => `
          <div class="sk-block" style="flex:1;height:34px;border-radius:10px"></div>
        `).join('')}
      </div>
      <!-- Chart -->
      ${sk.card(`<div class="sk-block" style="width:100%;height:120px;border-radius:8px"></div>`)}
      <!-- Rows -->
      ${[1,2,3,4].map(() => sk.card(`
        <div style="display:flex;justify-content:space-between;align-items:center">
          ${sk.line('40%','13px')}
          ${sk.line('20%','13px')}
        </div>
      `)).join('')}
    </div>`;
}

function skDefault() {
  return `
    <div class="sk-view">
      ${[1,2,3,4,5].map(() => sk.card(`
        <div style="display:flex;flex-direction:column;gap:10px">
          ${sk.line('65%','14px')}
          ${sk.line('45%','11px')}
        </div>
      `)).join('')}
    </div>`;
}

// ── API pública ─────────────────────────────────────────────────────────────

const SKELETON_MAP = {
  dashboard:  skDashboard,
  workouts:   skWorkouts,
  exercises:  skExercises,
  stats:      skStats,
  challenges: skDefault,
  weight:     skDefault,
  records:    skDefault,
  goals:      skDefault,
  photos:     skDefault,
  settings:   skDefault,
};

function showSkeleton(view) {
  const fn = SKELETON_MAP[view];
  if (!fn) return;
  // IDs usan camelCase: viewDashboard, viewWorkouts, etc.
  const id = 'view' + view.charAt(0).toUpperCase() + view.slice(1);
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = fn();
}
