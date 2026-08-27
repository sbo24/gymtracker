/* ===================================================
   stats.js — Statistics view
   =================================================== */
'use strict';

let currentStatsTab = 'general';
let statsRangeDays = 30;

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
  const weights = filterWeightByRange(allWeights);

  renderStatsSummary(workouts, weights, allWorkouts, exercises);
  renderStatsTab(currentStatsTab, workouts, exercises, weights, allWorkouts, allWeights);

  const picker = document.getElementById('statsExercisePicker');
  const cur = picker.value;
  picker.innerHTML = '<option value="">— Selecciona un ejercicio —</option>' +
    exercises.map(e => `<option value="${e.id}" ${e.id == cur ? 'selected' : ''}>${e.name}</option>`).join('');
}

async function renderStatsTab(tab, workouts, exercises, weights, allWorkouts, allWeights) {
  if (!workouts) {
    const [aw, ex, wt] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises'), dbGetAll('weight')]);
    workouts = filterByRange(aw);
    exercises = ex;
    weights = filterWeightByRange(wt);
    allWorkouts = aw;
    allWeights = wt;
  }
  if (tab === 'general') renderStatsGeneral(workouts, weights, allWorkouts, exercises, allWeights);
  else if (tab === 'exercise') renderStatsExercise(workouts, exercises);
  else if (tab === 'muscles') renderStatsMuscles(workouts, exercises);
  else if (tab === 'compare') renderCompareSetup();
}

// ===== WEIGHT EQUIVALENT =====
function weightEquivalent(kg) {
  const refs = [
    { min: 1, max: 5, emoji: '🍎', name: 'manzana', w: 0.18 },
    { min: 5, max: 20, emoji: '🐈', name: 'gato', w: 4.5 },
    { min: 20, max: 60, emoji: '🦮', name: 'pastor alemán', w: 30 },
    { min: 60, max: 150, emoji: '👤', name: 'persona adulta', w: 75 },
    { min: 150, max: 300, emoji: '🐷', name: 'cerdo', w: 180 },
    { min: 300, max: 600, emoji: '🐻', name: 'oso pardo', w: 300 },
    { min: 600, max: 1000, emoji: '🐎', name: 'caballo', w: 550 },
    { min: 1000, max: 2000, emoji: '🦬', name: 'bisonte', w: 900 },
    { min: 2000, max: 4000, emoji: '🦏', name: 'rinoceronte', w: 2300 },
    { min: 4000, max: 8000, emoji: '🦛', name: 'hipopótamo', w: 3500 },
    { min: 8000, max: 20000, emoji: '🐘', name: 'elefante africano', w: 6000 },
    { min: 20000, max: 50000, emoji: '🚗', name: 'coche', w: 1500 },
    { min: 50000, max: 100000, emoji: '🚌', name: 'autobús', w: 12000 },
    { min: 100000, max: 200000, emoji: '✈️', name: 'avión comercial vacío', w: 80000 },
    { min: 200000, max: 500000, emoji: '🚢', name: 'barco de crucero', w: 200000 },
    { min: 500000, max: Infinity, emoji: '🌍', name: 'tonelada de la Tierra', w: 1000000 },
  ];
  const match = refs.find(r => kg >= r.min && kg < r.max) || refs[refs.length - 1];
  const count = Math.round(kg / match.w);
  if (count <= 0) return null;
  return count === 1
    ? `= 1 ${match.emoji} ${match.name}`
    : `= ${count.toLocaleString()} ${match.emoji} ${match.name}s`;
}

// ===== SUMMARY =====
function renderStatsSummary(workouts, weights, allWorkouts, exercises) {
  const totalVol = workouts.reduce((s, w) => s + w.series.reduce((a, r) => a + seriesVol(r), 0), 0);

  const trainedDates = new Set(workouts.map(w => w.date));
  let streak = 0, d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (trainedDates.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0) { d.setDate(d.getDate() - 1); if ((new Date() - d) > 2 * 86400000) break; }
    else break;
  }

  const totalSets    = workouts.reduce((s, w) => s + w.series.length, 0);
  const equiv        = weightEquivalent(Math.round(totalVol));
  const prs          = latestPRs(workouts, exercises);
  const compare      = comparePeriods(workouts, previousRangeWorkouts(allWorkouts, statsRangeDays));
  const volumeDelta  = compare.volume.change;
  const prevVol      = compare.volume.prevValue || 0;
  const avgVolPerSession = workouts.length ? Math.round(totalVol / workouts.length) : 0;

  // Max weight ever lifted (single series)
  let maxKgEver = 0;
  workouts.forEach(w => w.series.forEach(s => { if (!s.cardio && s.weight > maxKgEver) maxKgEver = s.weight; }));

  // Estimated time (avg ~45 min/session)
  const estHours = Math.round(workouts.length * 0.75);

  // Total days since first workout
  const allSorted = [...allWorkouts].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = allSorted[0]?.date;
  const daysSinceStart = firstDate
    ? Math.floor((new Date() - new Date(firstDate)) / 86400000)
    : 0;

  // Volume comparison bar width
  const maxBarVol = Math.max(totalVol, prevVol, 1);
  const curBarPct  = Math.round((totalVol / maxBarVol) * 100);
  const prevBarPct = Math.round((prevVol / maxBarVol) * 100);

  // Equivalentes múltiples ordenados por espectacularidad
  const equivList = buildEquivList(Math.round(totalVol));

  const volDeltaColor = volumeDelta === null ? 'var(--text3)' : volumeDelta >= 0 ? '#34c759' : '#ff3b30';
  const volDeltaLabel = volumeDelta === null ? '—' : `${volumeDelta > 0 ? '+' : ''}${volumeDelta}%`;

  document.getElementById('statsSummaryGrid').innerHTML = `
    <!-- HERO CARD: Volumen total -->
    <div class="stats-vol-hero">
      <div class="stats-vol-hero-top">
        <div>
          <div class="stats-vol-hero-label">Kilos totales levantados</div>
          <div class="stats-vol-hero-val">${formatBigNum(Math.round(totalVol))}<span class="stats-vol-hero-unit"> kg</span></div>
        </div>
        <div class="stats-vol-delta-badge" style="background:${volumeDelta >= 0 ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.15)'}; color:${volDeltaColor}">
          ${volumeDelta === null ? '' : (volumeDelta >= 0 ? '↑' : '↓')} ${volDeltaLabel}
          <div style="font-size:9px;font-weight:500;opacity:0.8;margin-top:1px">vs período ant.</div>
        </div>
      </div>

      <!-- Barra comparativa actual vs anterior -->
      ${prevVol > 0 ? `
      <div class="stats-vol-compare-bars">
        <div class="stats-vol-compare-row">
          <span class="stats-vol-compare-lbl">Este período</span>
          <div class="stats-vol-bar-track">
            <div class="stats-vol-bar-fill current" style="width:${curBarPct}%"></div>
          </div>
          <span class="stats-vol-compare-val">${formatBigNum(Math.round(totalVol))} kg</span>
        </div>
        <div class="stats-vol-compare-row">
          <span class="stats-vol-compare-lbl">Período ant.</span>
          <div class="stats-vol-bar-track">
            <div class="stats-vol-bar-fill prev" style="width:${prevBarPct}%"></div>
          </div>
          <span class="stats-vol-compare-val">${formatBigNum(Math.round(prevVol))} kg</span>
        </div>
      </div>` : ''}

      <!-- Equivalentes de peso divertidos -->
      ${equivList.length ? `
      <div class="stats-vol-equivs">
        ${equivList.slice(0, 2).map(eq => `<div class="stats-vol-equiv-chip">${eq}</div>`).join('')}
      </div>` : ''}
    </div>

    <!-- KPI STRIP: 4 métricas clave -->
    <div class="stats-kpi-row">
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${streak}</div>
        <div class="stats-kpi-lbl">Racha<br>días</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${prs.length}</div>
        <div class="stats-kpi-lbl">PRs<br>período</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${formatBigNum(avgVolPerSession)}</div>
        <div class="stats-kpi-lbl">kg/sesión<br>media</div>
      </div>
      <div class="stats-kpi-card">
        <div class="stats-kpi-val">${maxKgEver}</div>
        <div class="stats-kpi-lbl">Peso máx<br>levantado</div>
      </div>
    </div>

    <!-- Fila de datos de vida -->
    <div class="stats-life-row">
      <div class="stats-life-item">
        <span class="stats-life-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg>
        </span>
        <div>
          <div class="stats-life-val">${allWorkouts.length}</div>
          <div class="stats-life-lbl">entrenos totales</div>
        </div>
      </div>
      <div class="stats-life-item">
        <span class="stats-life-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </span>
        <div>
          <div class="stats-life-val">~${estHours}h</div>
          <div class="stats-life-lbl">tiempo total (est.)</div>
        </div>
      </div>
      <div class="stats-life-item">
        <span class="stats-life-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </span>
        <div>
          <div class="stats-life-val">${daysSinceStart}</div>
          <div class="stats-life-lbl">días desde inicio</div>
        </div>
      </div>
      <div class="stats-life-item">
        <span class="stats-life-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        </span>
        <div>
          <div class="stats-life-val">${totalSets.toLocaleString()}</div>
          <div class="stats-life-lbl">series totales</div>
        </div>
      </div>
    </div>
  `;
}

function buildEquivList(kg) {
  if (!kg || kg <= 0) return [];

  const refs = [
    { name: 'manzanas',              emoji: '🍎', w: 0.18 },
    { name: 'pizzas familiares',     emoji: '🍕', w: 0.8 },
    { name: 'sandías gigantes',      emoji: '🍉', w: 6 },
    { name: 'gatos',                 emoji: '🐈', w: 4.5 },
    { name: 'perros labradores',     emoji: '🦮', w: 30 },
    { name: 'barriles de cerveza',   emoji: '🍺', w: 62 },
    { name: 'personas adultas',      emoji: '👤', w: 75 },
    { name: 'motos scooter',         emoji: '🛵', w: 110 },
    { name: 'cerdos ibéricos',       emoji: '🐷', w: 160 },
    { name: 'gorilas lomo plateado', emoji: '🦍', w: 180 },
    { name: 'motos de carreras',     emoji: '🏍️', w: 220 },
    { name: 'osos grizzly',          emoji: '🐻', w: 320 },
    { name: 'caballos pura sangre',  emoji: '🐎', w: 520 },
    { name: 'toros bravos',          emoji: '🐂', w: 580 },
    { name: 'bisontes americanos',   emoji: '🦬', w: 900 },
    { name: 'coches compactos',      emoji: '🚗', w: 1200 },
    { name: 'coches SUV / Tesla',    emoji: '🚙', w: 2100 },
    { name: 'rinocerontes blancos',  emoji: '🦏', w: 2300 },
    { name: 'hipopótamos adultos',   emoji: '🦛', w: 3400 },
    { name: 'orcas macho',           emoji: '🐋', w: 5000 },
    { name: 'tractores agrícolas',   emoji: '🚜', w: 5500 },
    { name: 'elefantes africanos',   emoji: '🐘', w: 6000 },
    { name: 'tiranosaurios Rex 🦖',  emoji: '🦖', w: 8000 },
    { name: 'autobuses urbanos',     emoji: '🚌', w: 13000 },
    { name: 'camiones de basura',    emoji: '🚛', w: 22000 },
    { name: 'tanques de guerra',     emoji: '🛡️', w: 55000 },
    { name: 'aviones comerciales',   emoji: '✈️', w: 80000 },
    { name: 'ballenas azules',       emoji: '🐋', w: 140000 },
    { name: 'estatuas de la Libertad', emoji: '🗽', w: 225000 },
    { name: 'cohetes Saturno V',     emoji: '🚀', w: 2900000 },
    { name: 'torres Eiffel',         emoji: '🗼', w: 10100000 },
    { name: 'cruceros de lujo',      emoji: '🚢', w: 120000000 }
  ];

  const results = [];
  // 1. Objeto grande que se acerque al volumen (count entre 1 y 50)
  const bigCandidates = refs.filter(r => {
    const c = kg / r.w;
    return c >= 0.8 && c <= 80;
  });
  if (bigCandidates.length) {
    const bestBig = bigCandidates[bigCandidates.length - 1];
    const c = Math.round(kg / bestBig.w);
    if (c >= 1) results.push(`${c.toLocaleString()} ${bestBig.emoji} ${bestBig.name}`);
  }

  // 2. Objeto mediano/divertido (count entre 50 y 1.000)
  const midCandidates = refs.filter(r => {
    const c = kg / r.w;
    return c > 20 && c <= 2000 && !results.some(res => res.includes(r.name));
  });
  if (midCandidates.length) {
    // Tomar uno representativo de mitad de rango
    const bestMid = midCandidates[Math.floor(midCandidates.length / 2)];
    const c = Math.round(kg / bestMid.w);
    if (c >= 1) results.push(`${c.toLocaleString()} ${bestMid.emoji} ${bestMid.name}`);
  }

  // 3. Si aún tenemos menos de 2 o queremos un tercero muy relatable (como personas o animales)
  if (results.length < 3) {
    const relatable = refs.find(r => ['personas adultas', 'gorilas lomo plateado', 'coches compactos', 'elefantes africanos'].includes(r.name) && !results.some(res => res.includes(r.name)));
    if (relatable) {
      const c = Math.round(kg / relatable.w);
      if (c >= 1) results.push(`${c.toLocaleString()} ${relatable.emoji} ${relatable.name}`);
    }
  }

  // Fallback si la lista quedó vacía
  if (!results.length) {
    const fallback = refs.slice().reverse().find(r => kg >= r.w) || refs[0];
    const c = Math.max(1, Math.round(kg / fallback.w));
    results.push(`${c.toLocaleString()} ${fallback.emoji} ${fallback.name}`);
  }

  return results.slice(0, 3);
}

// ===== GENERAL TAB =====
function renderStatsGeneral(workouts, weights, allWorkouts, exercises) {
  const wpw = workoutsPerWeek(workouts);
  const avgPW = wpw.length ? (wpw.reduce((s, d) => s + d.value, 0) / wpw.length).toFixed(1) : '0';
  document.getElementById('statsAvgPerWeek').textContent = `Media: ${avgPW} entrenos/semana`;

  const wVol = weeklyVolumeDetailed(workouts);
  const bestWeek = wVol.length ? wVol.reduce((a, b) => b.value > a.value ? b : a) : null;
  if (bestWeek)
    document.getElementById('statsBestWeek').textContent = `Mejor semana: ${bestWeek.label} — ${bestWeek.value.toLocaleString()} kg · ${bestWeek.sessions} sesiones`;

  renderStatsHighlights(workouts, allWorkouts, exercises);
  renderStatsWeekPattern(workouts);
  drawBarChart('chartWorkoutsPerWeek', wpw.slice(-16), '#0a84ff');
  drawBarChart('chartWeeklyVolume', wVol.slice(-16), '#5e5ce6');
  drawBarChart('chartMonthlyVolume', monthlyVolume(workouts).slice(-8), '#ff9f0a');

  if (weights) {
    weights.sort((a, b) => a.date.localeCompare(b.date));
    const weightSeries = weights.slice(-20).map(w => ({ label: w.date.slice(5), value: w.weight }));
    drawLineChart('chartWeightStats', rollingAverage(weightSeries, 4), '#34c759');
    const body = weightCompositionStats(weights);
    document.getElementById('statsWeightMeta').textContent = body
      ? `${body.current} kg · ${body.delta > 0 ? '+' : ''}${body.delta} kg · min ${body.min} · max ${body.max}${body.leanMass ? ` · masa magra ${body.leanMass} kg` : ''}${body.fat ? ` · ${body.fat}% grasa` : ''}`
      : '';
  }
}

function renderStatsHighlights(workouts, allWorkouts, exercises) {
  const el = document.getElementById('statsHighlights');
  const compare = comparePeriods(workouts, previousRangeWorkouts(allWorkouts, statsRangeDays));
  const prs = latestPRs(workouts, exercises).length;
  const bestWeek = weeklyVolumeDetailed(workouts).reduce((a, b) => !a || b.value > a.value ? b : a, null);
  const topDay = mostFrequentTrainingDay(workouts);
  const cards = [
    { label: 'Entrenos', value: compare.workouts.value, sub: compare.workouts.change === null ? 'Sin comparación' : `${compare.workouts.change > 0 ? '+' : ''}${compare.workouts.change}% vs anterior` },
    { label: 'Vol/entreno', value: `${formatBigNum(compare.avgVolume.value)} kg`, sub: compare.avgVolume.change === null ? 'Sin comparación' : `${compare.avgVolume.change > 0 ? '+' : ''}${compare.avgVolume.change}% vs anterior` },
    { label: 'PRs', value: prs, sub: prs ? 'Mejoras registradas' : 'Sin PRs en el rango' },
    { label: 'Mejor semana', value: bestWeek ? formatBigNum(bestWeek.value) : '—', sub: bestWeek ? `${bestWeek.label} · ${bestWeek.sessions} sesiones` : 'Sin datos' },
    { label: 'Día fuerte', value: topDay?.label || '—', sub: topDay?.value ? `${topDay.value} entrenos` : 'Sin patrón' }
  ];
  el.innerHTML = `<div class="stats-highlight-grid">${cards.map(card => `
    <div class="stats-highlight-card">
      <div class="stats-highlight-value">${card.value}</div>
      <div class="stats-highlight-label">${card.label}</div>
      <div class="stats-highlight-sub">${card.sub}</div>
    </div>
  `).join('')}</div>`;
}

function renderStatsWeekPattern(workouts) {
  const el = document.getElementById('statsWeekPattern');
  const days = trainingDaysOfWeek(workouts);
  const topDay = mostFrequentTrainingDay(workouts);
  el.innerHTML = `<div class="stats-week-card">
    <div class="stats-week-title">Consistencia semanal</div>
    <div class="stats-week-bars">${days.map(day => `
      <div class="stats-week-day">
        <div class="stats-week-bar-track"><div class="stats-week-bar-fill" style="height:${Math.max(8, day.pct)}%"></div></div>
        <div class="stats-week-day-label">${day.label}</div>
        <div class="stats-week-day-val">${day.value}</div>
      </div>
    `).join('')}</div>
    <div class="stats-week-sub">${topDay?.value ? `Tu día más frecuente es ${topDay.label} con ${topDay.value} sesiones en el rango` : 'Aún no hay patrón suficiente'}</div>
  </div>`;
}

// ===== EXERCISE TAB =====
async function renderStatsExercise(workouts, exercises) {
  if (!workouts) {
    const [aw, ex] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
    workouts = filterByRange(aw);
    exercises = ex;
  }
  const picker = document.getElementById('statsExercisePicker');
  const cur = picker.value;
  renderExerciseRankings(workouts, exercises);
  if (!cur) {
    clearCanvas('chartExercise'); clearCanvas('chartOneRM'); clearCanvas('chartExVolume');
    document.getElementById('statsExerciseSummary').innerHTML = '';
    document.getElementById('statsExerciseState').innerHTML = '';
    return;
  }
  const exId = parseInt(cur);
  const ex = exercises.find(e => e.id === exId);
  const progress = buildExerciseProgressSeries(workouts, exId);
  const { sessions, maxWeightBySession, best1RMBySession, volumeBySession, bestSetBySession } = progress;
  const allSets = sessions.flatMap(w => w.series.filter(s => s.exerciseId === exId));
  const maxKg = allSets.length ? Math.max(...allSets.map(s => s.weight)) : 0;
  const maxOrm = best1RMBySession.length ? Math.max(...best1RMBySession.map(d => d.value)) : 0;
  const totalVol = allSets.reduce((s, r) => s + seriesVol(r), 0);
  const bestSet = bestSetBySession[bestSetBySession.length - 1]?.set;
  const snapshot = exerciseProgressSnapshot(workouts, exId);

  document.getElementById('statsExerciseSummary').innerHTML = `
    <div class="ex-stat-summary">
      <div class="ex-stat-item"><div class="ex-stat-val">${maxKg} kg</div><div class="ex-stat-lbl">Peso máx</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${maxOrm} kg</div><div class="ex-stat-lbl">1RM est.</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${sessions.length}</div><div class="ex-stat-lbl">Sesiones</div></div>
      <div class="ex-stat-item"><div class="ex-stat-val">${formatBigNum(Math.round(totalVol))}</div><div class="ex-stat-lbl">Vol. total</div></div>
    </div>
    ${bestSet ? `<div class="stats-callout">${ex?.name || 'Ejercicio'} · mejor serie reciente ${bestSet.weight}kg × ${bestSet.reps} reps</div>` : ''}`;
  document.getElementById('statsExerciseState').innerHTML = renderExerciseState(snapshot);

  drawLineChart('chartExercise', maxWeightBySession, '#0a84ff');
  drawLineChart('chartOneRM', best1RMBySession, '#5e5ce6');
  drawBarChart('chartExVolume', volumeBySession, '#ff9f0a');
}

function renderExerciseRankings(workouts, exercises) {
  const el = document.getElementById('statsExerciseRankings');
  const topVol = topExercisesByVolume(workouts, exercises, 3);
  const topFreq = topExercisesByFrequency(workouts, exercises, 3);
  const topGain = exerciseImprovementRanking(workouts, exercises, 3);
  const stale = leastRecentlyTrainedExercises(workouts, exercises, 3);
  const block = (title, rows, formatter) => `
    <div class="stats-mini-list">
      <div class="stats-mini-title">${title}</div>
      ${rows.length ? rows.map((row, idx) => `
        <div class="stats-mini-row">
          <span class="stats-mini-rank">${idx + 1}</span>
          <span class="stats-mini-name">${row.name}</span>
          <span class="stats-mini-value">${formatter(row)}</span>
        </div>
      `).join('') : '<div class="stats-mini-empty">Sin datos</div>'}
    </div>`;
  el.innerHTML = `<div class="stats-mini-grid">
    ${block('Top volumen', topVol, row => `${formatBigNum(row.value)} kg`)}
    ${block('Top frecuencia', topFreq, row => `${row.value} sesiones`)}
    ${block('Más mejorados', topGain, row => `+${row.value} kg 1RM`)}
    ${block('Menos recientes', stale, row => `${row.value} d`)}
  </div>`;
}

function renderExerciseState(snapshot) {
  if (!snapshot?.sessions) return '';
  const tone = snapshot.status === 'progress' ? 'up' : snapshot.status === 'flat' ? 'flat' : 'new';
  const toneLabel = snapshot.status === 'progress' ? 'Progresando' : snapshot.status === 'flat' ? 'Estable' : 'Pocas sesiones';
  const lastDate = snapshot.lastDate ? formatDate(snapshot.lastDate) : '—';
  return `<div class="stats-state-card ${tone}">
    <div class="stats-state-header">
      <div class="stats-state-title">${toneLabel}</div>
      <div class="stats-state-date">Último registro: ${lastDate}</div>
    </div>
    <div class="stats-state-grid">
      <div class="stats-state-item"><span class="stats-state-val">${snapshot.maxDelta > 0 ? '+' : ''}${snapshot.maxDelta} kg</span><span class="stats-state-lbl">Peso máx</span></div>
      <div class="stats-state-item"><span class="stats-state-val">${snapshot.ormDelta > 0 ? '+' : ''}${snapshot.ormDelta} kg</span><span class="stats-state-lbl">1RM</span></div>
      <div class="stats-state-item"><span class="stats-state-val">${snapshot.recent ? `${snapshot.recent.weight}×${snapshot.recent.reps}` : '—'}</span><span class="stats-state-lbl">Mejor serie</span></div>
    </div>
  </div>`;
}

// ===== MUSCLES TAB =====
function renderStatsMuscles(workouts, exercises) {
  const rows = muscleVolumeBreakdown(workouts, exercises);
  const volByMuscle = {}, setsByMuscle = {};
  rows.forEach(row => {
    volByMuscle[row.muscle] = row.volume;
    setsByMuscle[row.muscle] = row.sets;
  });
  const sortedVol = rows.map(row => [row.muscle, row.volume, row.pct]);
  const maxVol = sortedVol[0]?.[1] || 1;
  const maxSets = Math.max(...Object.values(setsByMuscle), 1);
  renderMuscleInsights(workouts, exercises, rows);

  document.getElementById('muscleDistribution').innerHTML = sortedVol.map(([m, v, pctTotal]) => {
    const mc = muscleClass(m);
    const pct = Math.round(v / maxVol * 100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track"><div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div></div>
      <div class="muscle-bar-val">${pctTotal}%</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';

  const sortedSets = Object.entries(setsByMuscle).sort((a, b) => b[1] - a[1]);
  document.getElementById('muscleSetCount').innerHTML = sortedSets.map(([m, v]) => {
    const mc = muscleClass(m);
    const pct = Math.round(v / maxSets * 100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track"><div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div></div>
      <div class="muscle-bar-val">${v} sets</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';
  document.getElementById('statsMuscleBalance').innerHTML = renderMuscleBalance(rows);
}

function renderMuscleInsights(workouts, exercises, rows) {
  const el = document.getElementById('statsMuscleInsights');
  const insight = muscleBalanceInsight(workouts, exercises);
  if (!rows.length || !insight) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="stats-insight-card">
    <div class="stats-insight-title">Balance del rango</div>
    <div class="stats-insight-text">${insight.message}</div>
    <div class="stats-insight-sub">Menos trabajado: ${insight.low.muscle} · ${insight.low.pct}% del volumen</div>
  </div>`;
}

function renderMuscleBalance(rows) {
  if (!rows.length) return '';
  return `<div class="stats-balance-grid">${rows.map(row => `
    <div class="stats-balance-card">
      <div class="stats-balance-name">${row.muscle}</div>
      <div class="stats-balance-val">${row.pct}%</div>
      <div class="stats-balance-sub">${row.sets} series · ${formatBigNum(row.volume)} kg</div>
    </div>
  `).join('')}</div>`;
}

// ===== COMPARE TAB =====
async function renderCompareSetup() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  workouts.sort((a, b) => b.date.localeCompare(a.date));
  const opts = workouts.map(w => {
    const vol = Math.round(w.series.reduce((s, r) => s + seriesVol(r), 0));
    const label = `${formatDate(w.date)}${w.title ? ' · ' + w.title : ''} · ${formatBigNum(vol)}kg`;
    return `<option value="${w.id}">${label}</option>`;
  }).join('');
  const empty = '<option value="">— Selecciona un entreno —</option>';
  document.getElementById('cmpWorkoutA').innerHTML = empty + opts;
  document.getElementById('cmpWorkoutB').innerHTML = empty + opts;
  document.getElementById('cmpResult').innerHTML = '<div class="cmp-hint">Selecciona dos entrenamientos para compararlos</div>';
}

async function renderCompare() {
  const idA = parseInt(document.getElementById('cmpWorkoutA').value);
  const idB = parseInt(document.getElementById('cmpWorkoutB').value);
  if (!idA || !idB) return;

  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const wA = workouts.find(w => w.id === idA);
  const wB = workouts.find(w => w.id === idB);
  if (!wA || !wB) return;

  const el = document.getElementById('cmpResult');

  // Métricas globales
  const volA = Math.round(wA.series.reduce((s, r) => s + seriesVol(r), 0));
  const volB = Math.round(wB.series.reduce((s, r) => s + seriesVol(r), 0));
  const setsA = wA.series.filter(s => !s.cardio).length;
  const setsB = wB.series.filter(s => !s.cardio).length;

  const diffPct = volB > 0 ? Math.round((volA - volB) / volB * 100) : null;
  const diffSign = diffPct > 0 ? '+' : '';
  const diffColor = diffPct > 0 ? 'var(--green)' : diffPct < 0 ? 'var(--red)' : 'var(--text3)';

  // Ejercicios en común
  const exIdsA = new Set(wA.series.map(s => s.exerciseId));
  const exIdsB = new Set(wB.series.map(s => s.exerciseId));
  const common = [...exIdsA].filter(id => exIdsB.has(id));
  const onlyA = [...exIdsA].filter(id => !exIdsB.has(id));
  const onlyB = [...exIdsB].filter(id => !exIdsA.has(id));

  const exName = id => exercises.find(e => e.id === id)?.name || 'Ejercicio';

  // Filas de comparación por ejercicio común
  const exRows = common.map(id => {
    const sA = wA.series.filter(s => s.exerciseId === id);
    const sB = wB.series.filter(s => s.exerciseId === id);
    const maxA = Math.max(...sA.map(s => s.weight));
    const maxB = Math.max(...sB.map(s => s.weight));
    const vA = Math.round(sA.reduce((s, r) => s + seriesVol(r), 0));
    const vB = Math.round(sB.reduce((s, r) => s + seriesVol(r), 0));
    const better = maxA > maxB ? 'A' : maxB > maxA ? 'B' : '';
    const mc = muscleClass(exercises.find(e => e.id === id)?.muscle || '');
    return `<div class="cmp-ex-row">
      <div class="cmp-ex-name"><span class="muscle-dot-sm mc-${mc}"></span>${exName(id)}</div>
      <div class="cmp-ex-vals">
        <span class="cmp-val ${better === 'A' ? 'winner' : ''}">${maxA}kg ×${sA.length}s</span>
        <span class="cmp-vs">vs</span>
        <span class="cmp-val ${better === 'B' ? 'winner' : ''}">${maxB}kg ×${sB.length}s</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <!-- Cabeceras -->
    <div class="cmp-header-row">
      <div class="cmp-header-col">
        <div class="cmp-header-date">${formatDate(wA.date)}</div>
        ${wA.title ? `<div class="cmp-header-title">${wA.title}</div>` : ''}
      </div>
      <div class="cmp-header-mid">vs</div>
      <div class="cmp-header-col right">
        <div class="cmp-header-date">${formatDate(wB.date)}</div>
        ${wB.title ? `<div class="cmp-header-title">${wB.title}</div>` : ''}
      </div>
    </div>

    <!-- Métricas globales -->
    <div class="cmp-metrics">
      <div class="cmp-metric">
        <div class="cmp-metric-val ${volA >= volB ? 'winner' : ''}">${formatBigNum(volA)} kg</div>
        <div class="cmp-metric-lbl">Volumen A</div>
      </div>
      <div class="cmp-metric-center">
        <div style="font-size:13px;font-weight:700;color:${diffColor}">${diffPct !== null ? diffSign + diffPct + '%' : '—'}</div>
        <div style="font-size:10px;color:var(--text3)">diferencia</div>
      </div>
      <div class="cmp-metric">
        <div class="cmp-metric-val ${volB >= volA ? 'winner' : ''}">${formatBigNum(volB)} kg</div>
        <div class="cmp-metric-lbl">Volumen B</div>
      </div>
    </div>
    <div class="cmp-sets-row">
      <span>${setsA} series</span><span style="color:var(--text3)">·</span><span>${setsB} series</span>
    </div>

    <!-- Ejercicios comunes -->
    ${common.length ? `
    <div class="cmp-section-title">Ejercicios en común (${common.length})</div>
    <div class="cmp-ex-list">${exRows}</div>` : ''}

    <!-- Solo en A -->
    ${onlyA.length ? `
    <div class="cmp-section-title" style="color:var(--accent)">Solo en A (${onlyA.length})</div>
    <div class="cmp-only-list">${onlyA.map(id => `<span class="cmp-only-tag a">${exName(id)}</span>`).join('')}</div>` : ''}

    <!-- Solo en B -->
    ${onlyB.length ? `
    <div class="cmp-section-title" style="color:var(--green)">Solo en B (${onlyB.length})</div>
    <div class="cmp-only-list">${onlyB.map(id => `<span class="cmp-only-tag b">${exName(id)}</span>`).join('')}</div>` : ''}
  `;
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
    w.series.forEach(s => { m[k] += seriesVol(s); });
  });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k.slice(5), value: Math.round(v) }));
}

function workoutsPerWeek(workouts) {
  const m = {};
  workouts.forEach(w => { const k = getWeekKey(new Date(w.date)); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k.slice(5), value: v }));
}

// Semana lunes-domingo (ISO week)
function getWeekKey(date) {
  return getWeekMonday(date);
}
