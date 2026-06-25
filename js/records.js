/* ===================================================
   records.js — Personal records grouped by muscle
   =================================================== */
'use strict';

function computeRecords(workouts) {
  const r = {};
  workouts.forEach(w => w.series.forEach(s => {
    if (!r[s.exerciseId]) r[s.exerciseId] = { maxWeight: 0, maxReps: 0, maxVolume: 0 };
    if (s.weight > r[s.exerciseId].maxWeight) r[s.exerciseId].maxWeight = s.weight;
    if (s.reps   > r[s.exerciseId].maxReps)   r[s.exerciseId].maxReps   = s.reps;
    const v = s.weight * s.reps;
    if (v > r[s.exerciseId].maxVolume) r[s.exerciseId].maxVolume = v;
  }));
  return r;
}

function maxWeightForExercise(workouts, exId) {
  let max = 0;
  workouts.forEach(w => w.series.forEach(s => {
    if (s.exerciseId === exId && s.weight > max) max = s.weight;
  }));
  return max;
}

async function renderRecords() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const records = computeRecords(workouts);
  const list    = document.getElementById('recordsList');

  if (!Object.keys(records).length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg></div><div class="empty-state-text">Sin récords</div><div class="empty-state-sub">Empieza a entrenar para ver tus récords</div></div>`;
    return;
  }

  // Group by muscle
  const groups = {};
  Object.entries(records).forEach(([exId, r]) => {
    const ex = exercises.find(e => e.id === parseInt(exId));
    if (!ex) return;
    const m = ex.muscle || 'Otro';
    if (!groups[m]) groups[m] = [];
    groups[m].push({ ex, r });
  });

  Object.values(groups).forEach(g => g.sort((a, b) => b.r.maxWeight - a.r.maxWeight));
  const sortedMuscles = Object.keys(groups).sort((a, b) => MUSCLE_ORDER.indexOf(a) - MUSCLE_ORDER.indexOf(b));

  list.innerHTML = sortedMuscles.map(m => {
    const mc    = muscleClass(m);
    const emoji = muscleEmoji(m);

    const items = groups[m].map(({ ex, r }) => {
      const orm     = r.maxWeight > 0 ? Math.round(r.maxWeight * (1 + r.maxReps / 30)) : 0;
      const bestVol = Math.round(r.maxVolume);
      return `<div class="rec-item">
        <div class="rec-item-name">${ex.name}</div>
        <div class="rec-item-stats">
          <div class="rec-stat">
            <div class="rec-stat-val mc-${mc}-text">${r.maxWeight}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">Peso máx</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val">${r.maxReps}</div>
            <div class="rec-stat-lbl">Reps máx</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val">${orm}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">1RM est.</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val">${bestVol}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">Vol mejor</div>
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="rec-group">
      <div class="rec-group-header mc-${mc}-bg">
        <div class="rec-group-dot mc-${mc}"></div>
        <span class="rec-group-emoji">${emoji}</span>
        <span class="rec-group-name">${m}</span>
        <span class="rec-group-count">${groups[m].length}</span>
      </div>
      <div class="rec-group-items">${items}</div>
    </div>`;
  }).join('');
}
