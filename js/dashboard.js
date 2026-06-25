/* ===================================================
   dashboard.js — Dashboard view
   =================================================== */
'use strict';

async function renderDashboard() {
  const [weights, workouts, exercises] = await Promise.all([
    dbGetAll('weight'), dbGetAll('workouts'), dbGetAll('exercises')
  ]);
  weights.sort((a, b) => a.date.localeCompare(b.date));

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
      deltaEl.textContent = (d > 0 ? '▲ +' : '▼ ') + d + ' kg esta semana';
      deltaEl.style.display = 'inline-flex';
    }
  } else {
    weightEl.textContent = '—';
    deltaEl.style.display = 'none';
  }

  document.getElementById('dashWorkouts').textContent  = workouts.length;
  document.getElementById('dashExercises').textContent = exercises.length;
  document.getElementById('dashRecords').textContent   = Object.keys(computeRecords(workouts)).length;

  const wData = weights.slice(-14).map(w => ({ label: w.date.slice(5), value: w.weight }));
  drawLineChart('chartWeightDash', wData, '#0a84ff');
  drawBarChart('chartVolumeDash', weeklyVolume(workouts).slice(-8), '#5e5ce6');

  renderDashGoals(weights, workouts, exercises);
  renderCalendar(workouts);
}

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

function renderCalendar(workouts) {
  const now     = new Date();
  const trained = new Set(workouts.map(w => w.date));
  const year    = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days     = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().split('T')[0];
  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  let html = `<div class="calendar-month-label">${cap(monthName)}</div><div class="calendar-grid">`;
  ['D','L','M','X','J','V','S'].forEach(d => { html += `<div class="cal-day-name">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-day', trained.has(ds) ? 'trained' : 'has-data', ds === todayStr ? 'today' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}">${d}</div>`;
  }
  html += '</div>';
  document.getElementById('dashCalendar').innerHTML = html;
}
