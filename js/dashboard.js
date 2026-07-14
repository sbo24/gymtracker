/* ===================================================
   dashboard.js — Dashboard view
   =================================================== */
'use strict';

async function renderDashboard() {
  // Resetear calendario al mes actual cada vez que se carga el dashboard
  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth();
  const [weights, workouts, exercises] = await Promise.all([
    dbGetAll('weight'), dbGetAll('workouts'), dbGetAll('exercises')
  ]);
  weights.sort((a, b) => a.date.localeCompare(b.date));
  workouts.sort((a, b) => b.date.localeCompare(a.date));

  // ── Peso corporal hero ──────────────────────────────
  const latest  = weights[weights.length - 1];
  const weightEl = document.getElementById('dashWeight');
  const deltaEl  = document.getElementById('dashWeightDelta');

  if (latest) {
    weightEl.textContent = latest.weight;
    const weekAgo = new Date(latest.date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const prev = weights.filter(w => w.date <= weekAgo.toISOString().split('T')[0]).pop();
    if (prev) {
      const d = (latest.weight - prev.weight).toFixed(1);
      const up = parseFloat(d) > 0;
      deltaEl.textContent = (up ? '▲ +' : '▼ ') + d + ' kg esta semana';
      deltaEl.style.display = 'inline-flex';
    } else {
      deltaEl.style.display = 'none';
    }
  } else {
    weightEl.textContent = '—';
    deltaEl.style.display = 'none';
  }

  // ── Stats tiles ─────────────────────────────────────
  document.getElementById('dashWorkouts').textContent  = workouts.length;
  document.getElementById('dashExercises').textContent = exercises.length;
  document.getElementById('dashRecords').textContent   = Object.keys(computeRecords(workouts)).length;

  // ── KPI strip ───────────────────────────────────────
  renderKpiStrip(workouts);

  // ── Último entreno ──────────────────────────────────
  renderLastWorkout(workouts, exercises);
  renderQuickActions(workouts);
  renderRecentPRs(workouts, exercises);

  // ── Resumen de esta semana ──────────────────────────
  renderWeekSummary(workouts, exercises);

  // ── Gráficas ────────────────────────────────────────
  const wData = weights.slice(-14).map(w => ({ label: w.date.slice(5), value: w.weight }));
  const wTrend = rollingAverage(wData, 4);
  drawLineChart('chartWeightDash', wTrend.length > 1 ? wTrend : wData, '#0a84ff');
  drawBarChart('chartVolumeDash', weeklyVolumeDetailed(workouts).slice(-10), '#5e5ce6');

  // ── Objetivos ───────────────────────────────────────
  renderDashGoals(weights, workouts, exercises);

  // ── Calendario ──────────────────────────────────────
  renderCalendar(workouts);
}

// ── KPI strip: racha + días sin entrenar + vol. total ──
function renderKpiStrip(workouts) {
  const trainedDates = new Set(workouts.map(w => w.date));
  const today = new Date().toISOString().split('T')[0];

  // Racha actual
  let streak = 0, d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (trainedDates.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0) { d.setDate(d.getDate() - 1); if ((new Date() - d) > 2 * 86400000) break; }
    else break;
  }

  // Días desde último entreno
  const lastDate = workouts[0]?.date;
  let daysSince = '—';
  if (lastDate) {
    const diff = Math.floor((new Date(today) - new Date(lastDate)) / 86400000);
    daysSince = diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : `Hace ${diff}d`;
  }

  // Volumen total
  const totalVol = workouts.reduce((s, w) => s + workoutVol(w), 0);

  // Entrenos este mes
  const thisMonth = today.slice(0, 7);
  const monthCount = workouts.filter(w => w.date.slice(0, 7) === thisMonth).length;

  document.getElementById('dashKpiStrip').innerHTML = `
    <div class="dash-kpi" onclick="navigateTo('stats')">
      <div class="dash-kpi-val">${streak}</div>
      <div class="dash-kpi-lbl">🔥 Racha</div>
    </div>
    <div class="dash-kpi-div"></div>
    <div class="dash-kpi" onclick="navigateTo('workouts')">
      <div class="dash-kpi-val">${daysSince}</div>
      <div class="dash-kpi-lbl">Último</div>
    </div>
    <div class="dash-kpi-div"></div>
    <div class="dash-kpi" onclick="navigateTo('workouts')">
      <div class="dash-kpi-val">${monthCount}</div>
      <div class="dash-kpi-lbl">Este mes</div>
    </div>
    <div class="dash-kpi-div"></div>
    <div class="dash-kpi" onclick="navigateTo('stats')">
      <div class="dash-kpi-val">${formatBigNum(Math.round(totalVol))}</div>
      <div class="dash-kpi-lbl">kg total</div>
    </div>`;
}

// ── Tarjeta del último entreno ──────────────────────────
function renderLastWorkout(workouts, exercises) {
  const el = document.getElementById('dashLastWorkout');
  if (!workouts.length) {
    el.innerHTML = `<div class="dash-empty-hint">Aún no has registrado ningún entreno</div>`;
    return;
  }
  const w    = workouts[0];
  const vol  = Math.round(workoutVol(w));
  const sets = w.series.length;

  // Músculos únicos
  const muscles = [...new Set(
    w.series.map(s => exercises.find(e => e.id === s.exerciseId)?.muscle).filter(Boolean)
  )];
  const muscleTags = muscles.map(m => {
    const mc = muscleClass(m);
    return `<span class="wl-muscle-tag mc-${mc}-bg" style="color:var(--text2)">${muscleEmoji(m)} ${m}</span>`;
  }).join('');

  // Top 3 ejercicios
  const exOrder = [], grouped = {};
  w.series.forEach(s => {
    if (!grouped[s.exerciseId]) { grouped[s.exerciseId] = []; exOrder.push(s.exerciseId); }
    grouped[s.exerciseId].push(s);
  });
  const topEx = exOrder.slice(0, 3).map(id => {
    const ex  = exercises.find(e => e.id === id);
    const maxW = Math.max(...grouped[id].map(s => s.weight));
    return ex ? `<span class="dash-ex-pill">${ex.name} <b>${maxW}kg</b></span>` : '';
  }).join('');

  el.innerHTML = `<div class="dash-last-card" onclick="openWorkoutEdit(${w.id})">
    <div class="dash-last-header">
      <div>
        <div class="dash-last-date">${formatDate(w.date)}</div>
        <div class="dash-last-meta">${sets} series · ${formatBigNum(vol)} kg vol.</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
    <div class="wl-muscles" style="margin:8px 0 6px">${muscleTags}</div>
    <div class="dash-ex-pills">${topEx}</div>
    ${w.notes ? `<div class="dash-last-notes">"${w.notes}"</div>` : ''}
  </div>`;
}

function renderQuickActions(workouts) {
  const el = document.getElementById('dashQuickActions');
  if (!workouts.length) {
    el.innerHTML = '';
    return;
  }
  const yesterday = findWorkoutFromYesterday(workouts);
  const target = yesterday || workouts[0];
  const label = yesterday ? 'Repetir ayer' : 'Repetir último';
  el.innerHTML = `<div class="dash-quick-row">
    <button class="dash-quick-btn primary" onclick="repeatLastWorkout()">${label}</button>
    <button class="dash-quick-btn" onclick="editLastWorkout()">Editar último</button>
    <button class="dash-quick-btn" onclick="openTemplatePicker()">Plantillas</button>
  </div>`;
}

function renderRecentPRs(workouts, exercises) {
  const el = document.getElementById('dashRecentPRs');
  const prs = latestPRs(workouts, exercises);
  if (!prs.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="dash-pr-card">
    <div class="dash-pr-title">Mejoras recientes</div>
    ${prs.slice(0, 4).map(pr => `
      <div class="dash-pr-row">
        <div>
          <div class="dash-pr-name">${pr.exerciseName}</div>
          <div class="dash-pr-tags">${pr.tags.join(' · ')}</div>
        </div>
        <div class="dash-pr-value">${pr.current.best1RM || pr.current.maxWeight}kg</div>
      </div>
    `).join('')}
  </div>`;
}

// ── Resumen de la semana en curso ───────────────────────
function renderWeekSummary(workouts, exercises) {
  const el = document.getElementById('dashWeekSummary');

  const now   = new Date();
  const mon   = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // lunes
  mon.setHours(0, 0, 0, 0);
  const monStr = mon.toISOString().split('T')[0];

  const weekWorkouts = workouts.filter(w => w.date >= monStr);

  if (!weekWorkouts.length) {
    el.innerHTML = `<div class="dash-empty-hint">Aún no has entrenado esta semana 💪</div>`;
    return;
  }

  const weekVol  = Math.round(weekWorkouts.reduce((s, w) => s + workoutVol(w), 0));
  const weekSets = weekWorkouts.reduce((s, w) => s + w.series.length, 0);

  // Músculo más trabajado
  const muscleSets = {};
  weekWorkouts.forEach(w => w.series.forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    const m  = ex?.muscle || 'Otro';
    muscleSets[m] = (muscleSets[m] || 0) + 1;
  }));
  const topMuscle = Object.entries(muscleSets).sort((a, b) => b[1] - a[1])[0];

  // Comparar con semana anterior
  const prevMon = new Date(mon); prevMon.setDate(prevMon.getDate() - 7);
  const prevMonStr = prevMon.toISOString().split('T')[0];
  const prevWorkouts = workouts.filter(w => w.date >= prevMonStr && w.date < monStr);
  const prevVol = Math.round(prevWorkouts.reduce((s, w) => s + workoutVol(w), 0));
  const volDiff = prevVol > 0 ? Math.round((weekVol - prevVol) / prevVol * 100) : null;
  const volTrend = volDiff !== null
    ? `<span class="dash-week-trend ${volDiff >= 0 ? 'up' : 'down'}">${volDiff >= 0 ? '▲' : '▼'} ${Math.abs(volDiff)}% vs semana anterior</span>`
    : '';

  el.innerHTML = `<div class="dash-week-card">
    <div class="dash-week-stats">
      <div class="dash-week-stat">
        <div class="dash-week-val">${weekWorkouts.length}</div>
        <div class="dash-week-lbl">Sesiones</div>
      </div>
      <div class="dash-week-stat">
        <div class="dash-week-val">${formatBigNum(weekVol)}</div>
        <div class="dash-week-lbl">kg volumen</div>
      </div>
      <div class="dash-week-stat">
        <div class="dash-week-val">${weekSets}</div>
        <div class="dash-week-lbl">Series</div>
      </div>
      ${topMuscle ? `<div class="dash-week-stat">
        <div class="dash-week-val">${muscleEmoji(topMuscle[0])}</div>
        <div class="dash-week-lbl">${topMuscle[0]}</div>
      </div>` : ''}
    </div>
    ${volTrend}
  </div>`;
}

// ── Goals ───────────────────────────────────────────────
function renderDashGoals(weights, workouts, exercises) {
  const goalsEl = document.getElementById('dashGoals');
  const goals   = JSON.parse(localStorage.getItem('goals') || '{}');
  let html = '';

  if (goals.weight && weights.length) {
    const cur    = weights[weights.length - 1].weight;
    const start  = weights[0].weight;
    const target = parseFloat(goals.weight);
    const total  = Math.abs(start - target) || 1;
    const done   = Math.abs(start - cur);
    const pct    = Math.min(100, Math.round(done / total * 100));
    html += goalBar('Objetivo de peso', `${cur} kg → ${target} kg`, pct);
  }

  if (goals.strengthExercise && goals.strengthWeight) {
    const ex = exercises.find(e => e.id === parseInt(goals.strengthExercise));
    if (ex) {
      const maxKg  = maxWeightForExercise(workouts, ex.id);
      const target = parseFloat(goals.strengthWeight);
      const pct    = Math.min(100, Math.round(maxKg / target * 100));
      html += goalBar(`Fuerza: ${ex.name}`, `${maxKg} kg → ${target} kg`, pct);
    }
  }

  goalsEl.innerHTML = html || `<div class="empty-state">
    <div class="empty-state-text">Sin objetivos</div>
    <div class="empty-state-sub">Define tus metas en Ajustes → Objetivos</div>
  </div>`;
}

function goalBar(label, detail, pct) {
  return `<div class="goal-item">
    <div class="goal-header">
      <span class="goal-label">${label}</span>
      <span class="goal-pct">${pct}%</span>
    </div>
    <div class="goal-detail">${detail}</div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
  </div>`;
}

// ── Calendario ──────────────────────────────────────────
// Estado del calendario — mes visible
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth();
let _calWorkouts = [];

function renderCalendar(workouts) {
  _calWorkouts = workouts; // guardar para navegación
  _renderCalendarMonth(_calYear, _calMonth, workouts);
}

function calNav(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0;  _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  _renderCalendarMonth(_calYear, _calMonth, _calWorkouts);
}

function _renderCalendarMonth(year, month, workouts) {
  const now     = new Date();
  const trained = new Set(workouts.map(w => w.date));
  const firstDay = new Date(year, month, 1).getDay();
  const days     = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().split('T')[0];
  const monthName = new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Contar días entrenados en este mes
  let trainedCount = 0;
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (trained.has(ds)) trainedCount++;
  }

  let html = `
    <div class="cal-nav-row">
      <button class="cal-nav-btn" onclick="calNav(-1)">‹</button>
      <div class="cal-nav-center">
        <div class="calendar-month-label" style="padding:0;margin:0">${cap(monthName)}</div>
        <div class="cal-trained-count">${trainedCount} días entrenados</div>
      </div>
      <button class="cal-nav-btn" onclick="calNav(1)" ${isCurrentMonth ? 'disabled style="opacity:0.3"' : ''}>›</button>
    </div>
    <div class="calendar-grid" style="padding:0 12px 12px">`;

  ['L','M','X','J','V','S','D'].forEach(d => { html += `<div class="cal-day-name">${d}</div>`; });
  const adjFirst = (firstDay + 6) % 7;
  for (let i = 0; i < adjFirst; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-day', trained.has(ds) ? 'trained' : '', ds === todayStr ? 'today' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}">${d}</div>`;
  }
  html += '</div>';
  document.getElementById('dashCalendar').innerHTML = html;
}
