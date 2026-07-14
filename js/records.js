/* ===================================================
   records.js — Personal records grouped by muscle
   =================================================== */
'use strict';

// ── Fórmulas de 1RM ────────────────────────────────────
// Epley:   w × (1 + r/30)
// Brzycki: w × 36 / (37 - r)
// Media de ambas para mayor precisión
function calc1RM(weight, reps) {
  if (reps === 1) return weight;
  if (reps <= 0 || weight <= 0) return 0;
  const epley   = weight * (1 + reps / 30);
  const brzycki = reps < 37 ? weight * 36 / (37 - reps) : epley;
  return Math.round((epley + brzycki) / 2);
}

// % del 1RM para cada número de reps (tabla Prilepin / Brzycki aproximada)
const ORM_PCT = [100, 97, 94, 92, 89, 86, 83, 81, 78, 75, 73, 71, 70];
// índice 0 = 1 rep, índice 1 = 2 reps, ...

function ormAtReps(orm, reps) {
  const idx = Math.min(reps - 1, ORM_PCT.length - 1);
  return Math.round(orm * ORM_PCT[idx] / 100);
}

// ── Computar récords con más info ──────────────────────
function computeRecords(workouts) {
  const r = {};
  workouts.forEach(w => {
    w.series.forEach(s => {
      if (!r[s.exerciseId]) r[s.exerciseId] = {
        maxWeight: 0, maxWeightReps: 0, maxReps: 0, maxVolume: 0,
        best1RM: 0,
        firstDate: w.date, lastDate: w.date,
        recordDate: w.date,
        maxWeightDate: w.date,
        maxRepsDate: w.date,
        maxVolumeDate: w.date,
        best1RMDate: w.date,
        firstWeight: s.weight
      };
      const rec = r[s.exerciseId];

      // Rango de fechas
      if (w.date < rec.firstDate) { rec.firstDate = w.date; rec.firstWeight = s.weight; }
      if (w.date > rec.lastDate)  rec.lastDate = w.date;

      // Peso máximo + reps hechas con ese peso
      if (s.weight > rec.maxWeight) {
        rec.maxWeight     = s.weight;
        rec.maxWeightReps = s.reps;   // reps del set con más peso
        rec.recordDate    = w.date;
        rec.maxWeightDate = w.date;
      } else if (s.weight === rec.maxWeight && s.reps > rec.maxWeightReps) {
        rec.maxWeightReps = s.reps;   // mismo peso, más reps → actualizar
        rec.maxWeightDate = w.date;
      }

      // Reps máximas absolutas (cualquier peso)
      if (s.reps > rec.maxReps) {
        rec.maxReps = s.reps;
        rec.maxRepsDate = w.date;
      }

      // Saltar series de cardio en los cálculos de records de fuerza
      if (s.cardio) return;

      // Volumen mejor set
      const v = s.weight * s.reps;
      if (v > rec.maxVolume) {
        rec.maxVolume = v;
        rec.maxVolumeDate = w.date;
      }

      // Mejor 1RM estimado
      const orm = calc1RM(s.weight, s.reps);
      if (orm > rec.best1RM) {
        rec.best1RM = orm;
        rec.best1RMDate = w.date;
      }
    });
  });
  return r;
}

function maxWeightForExercise(workouts, exId) {
  let max = 0;
  workouts.forEach(w => w.series.forEach(s => {
    if (s.exerciseId === exId && s.weight > max) max = s.weight;
  }));
  return max;
}

// ── Badge de récord reciente ────────────────────────────
function recencyBadge(dateStr) {
  if (!dateStr) return '';
  const days = Math.floor((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000);
  if (days <= 7)  return `<span class="rec-badge new">🏆 NUEVO</span>`;
  if (days <= 30) return `<span class="rec-badge recent">⭐ Este mes</span>`;
  return '';
}

// ── Tabla de pesos por reps ─────────────────────────────
function ormTable(orm) {
  if (orm <= 0) return '';
  const rows = [1, 2, 3, 4, 5, 6, 8, 10, 12].map(reps => {
    const kg = ormAtReps(orm, reps);
    return `<div class="rec-orm-row">
      <span class="rec-orm-reps">${reps} rep${reps > 1 ? 's' : ''}</span>
      <div class="rec-orm-bar-wrap">
        <div class="rec-orm-bar" style="width:${ORM_PCT[Math.min(reps-1,ORM_PCT.length-1)]}%"></div>
      </div>
      <span class="rec-orm-kg">${kg} kg</span>
      <span class="rec-orm-pct">${ORM_PCT[Math.min(reps-1,ORM_PCT.length-1)]}%</span>
    </div>`;
  }).join('');
  return `<div class="rec-orm-table">${rows}</div>`;
}

// ── Progresión histórica ────────────────────────────────
function progressionBadge(rec) {
  if (!rec.firstDate || rec.firstDate === rec.recordDate) return '';
  if (rec.firstWeight <= 0 || rec.maxWeight <= 0) return '';
  const pct   = Math.round((rec.maxWeight - rec.firstWeight) / rec.firstWeight * 100);
  const gained = rec.maxWeight - rec.firstWeight;
  if (gained <= 0) return '';
  const sign = '+';
  return `<div class="rec-progression">
    <span class="rec-prog-val">${sign}${gained} kg</span>
    <span class="rec-prog-sub">${sign}${pct}% desde el primer registro</span>
  </div>`;
}

// ── Render principal ────────────────────────────────────
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
      const orm     = r.best1RM || calc1RM(r.maxWeight, r.maxReps);
      const bestVol = Math.round(r.maxVolume);
      const badge   = recencyBadge(r.maxWeightDate || r.recordDate);
      const prog    = progressionBadge(r);
      const prTags = [
        r.maxWeightDate ? `Peso ${formatDate(r.maxWeightDate)}` : '',
        r.best1RMDate ? `1RM ${formatDate(r.best1RMDate)}` : '',
        r.maxVolumeDate ? `Volumen ${formatDate(r.maxVolumeDate)}` : '',
        r.maxRepsDate ? `Reps ${formatDate(r.maxRepsDate)}` : ''
      ].filter(Boolean).slice(0, 3);

      return `<div class="rec-item">
        <div class="rec-item-header">
          <div class="rec-item-name">${ex.name}</div>
          ${badge}
        </div>

        <!-- 4 métricas principales -->
        <div class="rec-item-stats">
          <div class="rec-stat">
            <div class="rec-stat-val mc-${mc}-text">${r.maxWeight}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">Peso máx</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val">${r.maxWeightReps}</div>
            <div class="rec-stat-lbl">Reps con máx</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val mc-${mc}-text">${orm}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">1RM est.</div>
          </div>
          <div class="rec-stat-div"></div>
          <div class="rec-stat">
            <div class="rec-stat-val">${bestVol}<span class="rec-stat-unit">kg</span></div>
            <div class="rec-stat-lbl">Vol mejor</div>
          </div>
        </div>

        <!-- Progresión histórica -->
        ${prog}
        <div class="rec-pr-tags">${prTags.map(tag => `<span class="rec-pr-tag">${tag}</span>`).join('')}</div>

        <!-- Tabla de pesos por reps (colapsable) -->
        <details class="rec-orm-details">
          <summary class="rec-orm-summary">Ver tabla de pesos por reps</summary>
          ${ormTable(orm)}
        </details>

        <!-- Fecha del récord -->
        <div class="rec-date">Último PR de peso el ${formatDate(r.maxWeightDate || r.recordDate)}</div>
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
