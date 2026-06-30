/* ===================================================
   stats.js — Statistics view
   =================================================== */
'use strict';

let currentStatsTab = 'general';
let statsRangeDays  = 30;

function setStatsRange(days, btn) {
  statsRangeDays = days;
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStats();
}

function filterByRange(workouts) {
  if (!statsRangeDays) return workouts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - statsRangeDays);
  const cutStr = cutoff.toISOString().split('T')[0];
  return workouts.filter(w => w.date >= cutStr);
}

function filterWeightByRange(weights) {
  if (!statsRangeDays) return weights;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - statsRangeDays);
  const cutStr = cutoff.toISOString().split('T')[0];
  return weights.filter(w => w.date >= cutStr);
}

function switchStatsTab(tab, btn) {
  currentStatsTab = tab;
  document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.stats-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('statsTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  renderStats();
}

async function renderStats() {
  const [allWorkouts, exercises, allWeights] = await Promise.all([
    dbGetAll('workouts'), dbGetAll('exercises'), dbGetAll('weight')
  ]);
  const workouts = filterByRange(allWorkouts);
  const weights  = filterWeightByRange(allWeights);

  renderStatsSummary(workouts, weights);
  renderStatsTab(currentStatsTab, workouts, exercises, weights);

  const picker = document.getElementById('statsExercisePicker');
  const cur    = picker.value;
  picker.innerHTML = '<option value="">— Selecciona un ejercicio —</option>' +
    exercises.map(e => `<option value="${e.id}" ${e.id == cur ? 'selected' : ''}>${e.name}</option>`).join('');
}

async function renderStatsTab(tab, workouts, exercises, weights) {
  if (!workouts) {
    const [aw, ex, wt] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises'), dbGetAll('weight')]);
    workouts  = filterByRange(aw);
    exercises = ex;
    weights   = filterWeightByRange(wt);
  }
  if (tab === 'general')       renderStatsGeneral(workouts, weights);
  else if (tab === 'exercise') renderStatsExercise(workouts, exercises);
  else if (tab === 'muscles')  renderStatsMuscles(workouts, exercises);
}

// ===== WEIGHT EQUIVALENT =====
function weightEquivalent(kg) {
  const refs = [
    { min: 1,       max: 5,        emoji: '🍎', name: 'manzana',               w: 0.18 },
    { min: 5,       max: 20,       emoji: '🐈', name: 'gato',                  w: 4.5  },
    { min: 20,      max: 60,       emoji: '🦮', name: 'pastor alemán',          w: 30   },
    { min: 60,      max: 150,      emoji: '👤', name: 'persona adulta',         w: 75   },
    { min: 150,     max: 300,      emoji: '🐷', name: 'cerdo',                  w: 180  },
    { min: 300,     max: 600,      emoji: '🐻', name: 'oso pardo',              w: 300  },
    { min: 600,     max: 1000,     emoji: '🐎', name: 'caballo',                w: 550  },
    { min: 1000,    max: 2000,     emoji: '🦬', name: 'bisonte',                w: 900  },
    { min: 2000,    max: 4000,     emoji: '🦏', name: 'rinoceronte',            w: 2300 },
    { min: 4000,    max: 8000,     emoji: '🦛', name: 'hipopótamo',             w: 3500 },
    { min: 8000,    max: 20000,    emoji: '🐘', name: 'elefante africano',      w: 6000 },
    { min: 20000,   max: 50000,    emoji: '🚗', name: 'coche',                  w: 1500 },
    { min: 50000,   max: 100000,   emoji: '🚌', name: 'autobús',                w: 12000},
    { min: 100000,  max: 200000,   emoji: '✈️',  name: 'avión comercial vacío', w: 80000},
    { min: 200000,  max: 500000,   emoji: '🚢', name: 'barco de crucero',       w: 200000},
    { min: 500000,  max: Infinity, emoji: '🌍', name: 'tonelada de la Tierra',  w: 1000000},
  ];
  const match = refs.find(r => kg >= r.min && kg < r.max) || refs[refs.length - 1];
  const count = Math.round(kg / match.w);
  if (count <= 0) return null;
  return count === 1
    ? `= 1 ${match.emoji} ${match.name}`
    : `= ${count.toLocaleString()} ${match.emoji} ${match.name}s`;
}

// ===== SUMMARY =====
function renderStatsSummary(workouts, weights) {
  const totalVol = workouts.reduce((s, w) => s + w.series.reduce((a, r) => a + r.weight * r.reps, 0), 0);

  const trainedDates = new Set(workouts.map(w => w.date));
  let streak = 0, d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (trainedDates.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0) { d.setDate(d.getDate() - 1); if ((new Date() - d) > 2 * 86400000) break; }
    else break;
  }

  const wVol      = weeklyVolume(workouts);
  const totalSets = workouts.reduce((s, w) => s + w.series.length, 0);
  const equiv     = weightEquivalent(Math.round(totalVol));

  document.getElementById('statsSummaryGrid').innerHTML = `
    <div class="stat-summary-card" style="background:linear-gradient(135deg,#0a84ff,#5e5ce6)">
      <div class="stat-summary-val">${formatBigNum(Math.round(totalVol))}</div>
      <div class="stat-summary-label">kg totales<br>levantados</div>
      ${equiv ? `<div class="stat-summary-equiv">${equiv}</div>` : ''}
    </div>
    <div class="stat-summary-card" style="background:linear-gradient(135deg,#ff9f0a,#ff6b00)">
      <div class="stat-summary-val">${streak}</div>
      <div class="stat-summary-label">días de<br>racha</div>
    </div>
    <div class="stat-summary-card" style="background:linear-gradient(135deg,#34c759,#30b0c7)">
      <div class="stat-summary-val">${workouts.length}</div>
      <div class="stat-summary-label">entrenos<br>totales</div>
    </div>
    <div class="stat-summary-card" style="background:linear-gradient(135deg,#5e5ce6,#bf5af2)">
      <div class="stat-summary-val">${totalSets}</div>
      <div class="stat-summary-label">series<br>totales</div>
    </div>`;
}

// ===== GENERAL TAB =====
function renderStatsGeneral(workouts, weights) {
  const wpw   = workoutsPerWeek(workouts);
  const avgPW = wpw.length ? (wpw.reduce((s, d) => s + d.value, 0) / wpw.length).toFixed(1) : '0';
  document.getElementById('statsAvgPerWeek').textContent = `Media: ${avgPW} entrenos/semana`;

  const wVol     = weeklyVolumeDetailed(workouts);
  const bestWeek = wVol.length ? wVol.reduce((a, b) => b.value > a.value ? b : a) : null;
  if (bestWeek)
    document.getElementById('statsBestWeek').textContent = `Mejor semana: ${bestWeek.label} — ${bestWeek.value.toLocaleString()} kg · ${bestWeek.sessions} sesiones`;

  drawBarChart('chartWorkoutsPerWeek', wpw.slice(-16), '#0a84ff');
  drawBarChart('chartWeeklyVolume', wVol.slice(-16), '#5e5ce6');
  drawBarChart('chartMonthlyVolume', monthlyVolume(workouts).slice(-8), '#ff9f0a');

  if (weights) {
    weights.sort((a, b) => a.date.localeCompare(b.date));
    const weightSeries = weights.slice(-20).map(w => ({ label: w.date.slice(5), value: w.weight }));
    drawLineChart('chartWeightStats', rollingAverage(weightSeries, 4), '#34c759');
  }
}

// ===== EXERCISE TAB =====
async function renderStatsExercise(workouts, exercises) {
  if (!workouts) {
    const [aw, ex] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
    workouts  = filterByRange(aw);
    exercises = ex;
  }
  const picker = document.getElementById('statsExercisePicker');
  const cur    = picker.value;
  if (!cur) {
    clearCanvas('chartExercise'); clearCanvas('chartOneRM'); clearCanvas('chartExVolume');
    document.getElementById('statsExerciseSummary').innerHTML = '';
    return;
  }
  const exId = parseInt(cur);
  const ex   = exercises.find(e => e.id === exId);
  const progress = buildExerciseProgressSeries(workouts, exId);
  const { sessions, maxWeightBySession, best1RMBySession, volumeBySession, bestSetBySession } = progress;
  const allSets = sessions.flatMap(w => w.series.filter(s => s.exerciseId === exId));
  const maxKg   = allSets.length ? Math.max(...allSets.map(s => s.weight)) : 0;
  const maxOrm  = best1RMBySession.length ? Math.max(...best1RMBySession.map(d => d.value)) : 0;
  const totalVol = allSets.reduce((s, r) => s + r.weight * r.reps, 0);
  const bestSet = bestSetBySession[bestSetBySession.length - 1]?.set;

  document.getElementById('statsExerciseSummary').innerHTML = `
    <div class="ex-stat-summary">
      <div class="ex-stat-item"><div class="ex-stat-val">${maxKg} kg</div><div class="ex-stat-lbl">Peso máx</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${maxOrm} kg</div><div class="ex-stat-lbl">1RM est.</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${sessions.length}</div><div class="ex-stat-lbl">Sesiones</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${formatBigNum(Math.round(totalVol))}</div><div class="ex-stat-lbl">Vol. total</div></div>
    </div>
    ${bestSet ? `<div class="stats-callout">${ex?.name || 'Ejercicio'} · mejor serie reciente ${bestSet.weight}kg × ${bestSet.reps} reps</div>` : ''}`;

  drawLineChart('chartExercise', maxWeightBySession, '#0a84ff');
  drawLineChart('chartOneRM', best1RMBySession, '#5e5ce6');
  drawBarChart('chartExVolume', volumeBySession, '#ff9f0a');
}

// ===== MUSCLES TAB =====
function renderStatsMuscles(workouts, exercises) {
  const volByMuscle = {}, setsByMuscle = {};
  workouts.forEach(w => {
    w.series.forEach(s => {
      const ex = exercises.find(e => e.id === s.exerciseId);
      const m  = ex?.muscle || 'Otro';
      volByMuscle[m]  = (volByMuscle[m]  || 0) + s.weight * s.reps;
      setsByMuscle[m] = (setsByMuscle[m] || 0) + 1;
    });
  });

  const sortedVol  = Object.entries(volByMuscle).sort((a, b) => b[1] - a[1]);
  const maxVol     = sortedVol[0]?.[1] || 1;
  const maxSets    = Math.max(...Object.values(setsByMuscle)) || 1;

  document.getElementById('muscleDistribution').innerHTML = sortedVol.map(([m, v]) => {
    const mc  = muscleClass(m);
    const pct = Math.round(v / maxVol * 100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track"><div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div></div>
      <div class="muscle-bar-val">${formatBigNum(Math.round(v))}</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';

  const sortedSets = Object.entries(setsByMuscle).sort((a, b) => b[1] - a[1]);
  document.getElementById('muscleSetCount').innerHTML = sortedSets.map(([m, v]) => {
    const mc  = muscleClass(m);
    const pct = Math.round(v / maxSets * 100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track"><div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div></div>
      <div class="muscle-bar-val">${v} sets</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';
}

// ===== VOLUME HELPERS =====
function weeklyVolume(workouts) {
  return weeklyVolumeDetailed(workouts).map(({ label, value }) => ({ label, value }));
}

function monthlyVolume(workouts) {
  const m = {};
  workouts.forEach(w => {
    const k = w.date.slice(0, 7);
    if (!m[k]) m[k] = 0;
    w.series.forEach(s => { m[k] += s.weight * s.reps; });
  });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k.slice(5), value: Math.round(v) }));
}

function workoutsPerWeek(workouts) {
  const m = {};
  workouts.forEach(w => { const k = getWeekKey(new Date(w.date)); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k.slice(5), value: v }));
}

function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
