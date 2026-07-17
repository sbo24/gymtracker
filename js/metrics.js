'use strict';

function normalizeSearchText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compareByMuscleOrder(a, b) {
  const ai = MUSCLE_ORDER.indexOf(a);
  const bi = MUSCLE_ORDER.indexOf(b);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

function groupSeriesByExercise(series = []) {
  const grouped = {};
  const order = [];
  series.forEach(s => {
    if (!grouped[s.exerciseId]) {
      grouped[s.exerciseId] = [];
      order.push(s.exerciseId);
    }
    grouped[s.exerciseId].push(s);
  });
  return { grouped, order };
}

function buildWorkoutDraft(workout = {}) {
  return {
    date: workout.date || new Date().toISOString().split('T')[0],
    title: workout.title || '',
    notes: workout.notes || '',
    photo: workout.photo || workout.photo_url || '',
    series: Array.isArray(workout.series) ? workout.series.map(s => ({ ...s })) : []
  };
}

function totalWorkoutVolume(workout) {
  return Math.round((workout?.series || []).reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0));
}

function findWorkoutById(workouts, id) {
  return workouts.find(w => w.id === id) || null;
}

function findLastWorkout(workouts) {
  if (!workouts?.length) return null;
  return [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function findWorkoutFromYesterday(workouts) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  return (workouts || []).find(w => w.date === yesterday) || null;
}

function scoreExerciseMatch(exercise, query) {
  if (!query) return 0;
  const name = normalizeSearchText(exercise.name);
  const muscle = normalizeSearchText(exercise.muscle);
  const notes = normalizeSearchText(exercise.notes);
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 60;
  if (muscle.startsWith(query)) return 40;
  if (muscle.includes(query)) return 30;
  if (notes.includes(query)) return 20;
  return 0;
}

function filterAndSortExercises(exercises, query = '', muscle = '') {
  const q = normalizeSearchText(query);
  let items = [...exercises];
  if (muscle) items = items.filter(e => e.muscle === muscle);
  if (!q) {
    return items.sort((a, b) =>
      compareByMuscleOrder(a.muscle || 'Otro', b.muscle || 'Otro') ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );
  }
  return items
    .map(ex => ({ ex, score: scoreExerciseMatch(ex, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      compareByMuscleOrder(a.ex.muscle || 'Otro', b.ex.muscle || 'Otro') ||
      a.ex.name.localeCompare(b.ex.name, 'es', { sensitivity: 'base' })
    )
    .map(x => x.ex);
}

function exerciseSessions(workouts, exId) {
  return [...(workouts || [])]
    .filter(w => (w.series || []).some(s => s.exerciseId === exId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getBestSet(sets = [], mode = 'orm') {
  if (!sets.length) return null;
  return sets.reduce((best, s) => {
    if (s.cardio) return best;
    const score = mode === 'volume'
      ? seriesVol(s)
      : mode === 'weight'
        ? s.weight
        : calc1RM(s.weight, s.reps);
    if (!best || score > best.score) return { ...s, score };
    return best;
  }, null);
}

function buildExerciseProgressSeries(workouts, exId) {
  const sessions = exerciseSessions(workouts, exId);
  const maxWeightBySession = [];
  const best1RMBySession = [];
  const volumeBySession = [];
  const bestSetBySession = [];

  sessions.forEach(w => {
    const sets = w.series.filter(s => s.exerciseId === exId);
    const maxWeight = Math.max(...sets.map(s => s.weight));
    const bestOrmSet = getBestSet(sets, 'orm');
    const bestVolSet = getBestSet(sets, 'volume');
    maxWeightBySession.push({ label: w.date.slice(5), value: maxWeight, date: w.date });
    best1RMBySession.push({ label: w.date.slice(5), value: bestOrmSet?.score || 0, date: w.date });
    volumeBySession.push({
      label: w.date.slice(5),
      value: Math.round(sets.reduce((sum, s) => sum + seriesVol(s), 0)),
      date: w.date
    });
    bestSetBySession.push({
      date: w.date,
      set: bestOrmSet,
      volumeSet: bestVolSet
    });
  });

  return { sessions, maxWeightBySession, best1RMBySession, volumeBySession, bestSetBySession };
}

function rollingAverage(data, windowSize = 7) {
  if (!data?.length) return [];
  return data.map((item, idx) => {
    const slice = data.slice(Math.max(0, idx - windowSize + 1), idx + 1);
    const avg = slice.reduce((sum, x) => sum + x.value, 0) / slice.length;
    return { ...item, value: Math.round(avg * 10) / 10 };
  });
}

function weeklyVolumeDetailed(workouts) {
  const map = {};
  (workouts || []).forEach(w => {
    const key = getWeekKey(new Date(w.date));
    if (!map[key]) map[key] = { label: key.slice(5), value: 0, sessions: 0 };
    map[key].sessions += 1;
    w.series.forEach(s => { map[key].value += seriesVol(s); });
  });
  const rows = Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row], idx, arr) => {
      const prev = arr[idx - 1]?.[1]?.value || 0;
      const change = prev ? Math.round(((row.value - prev) / prev) * 100) : null;
      return { ...row, value: Math.round(row.value), change };
    });
  return rows;
}

function latestPRs(workouts, exercises) {
  const sorted = [...(workouts || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const latest = sorted[sorted.length - 1];
  const previous = sorted.slice(0, -1);
  const prevRecords = computeRecords(previous);
  const currentRecords = computeRecords(sorted);
  const prs = [];

  (latest.series || []).forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    const prev = prevRecords[s.exerciseId] || {};
    const current = currentRecords[s.exerciseId] || {};
    const seen = `${s.exerciseId}`;
    if (prs.some(p => p.key === seen)) return;

    const improvements = [];
    if ((current.maxWeight || 0) > (prev.maxWeight || 0)) improvements.push('Peso');
    if ((current.best1RM || 0) > (prev.best1RM || 0)) improvements.push('1RM');
    if ((current.maxVolume || 0) > (prev.maxVolume || 0)) improvements.push('Volumen');
    if ((current.maxReps || 0) > (prev.maxReps || 0)) improvements.push('Reps');

    if (improvements.length) {
      prs.push({
        key: seen,
        exerciseId: s.exerciseId,
        exerciseName: ex.name,
        muscle: ex.muscle || 'Otro',
        tags: improvements,
        current
      });
    }
  });

  return prs;
}

function sumWorkoutVolume(workouts = []) {
  return workouts.reduce((sum, w) => sum + totalWorkoutVolume(w), 0);
}

function averageWorkoutVolume(workouts = []) {
  return workouts.length ? Math.round(sumWorkoutVolume(workouts) / workouts.length) : 0;
}

function comparePeriods(current = [], previous = []) {
  const currentVolume = sumWorkoutVolume(current);
  const previousVolume = sumWorkoutVolume(previous);
  const currentCount = current.length;
  const previousCount = previous.length;
  const currentAvg = averageWorkoutVolume(current);
  const previousAvg = averageWorkoutVolume(previous);
  const pct = (now, before) => before ? Math.round(((now - before) / before) * 100) : null;
  return {
    volume: { value: currentVolume, change: pct(currentVolume, previousVolume) },
    workouts: { value: currentCount, change: pct(currentCount, previousCount) },
    avgVolume: { value: currentAvg, change: pct(currentAvg, previousAvg) }
  };
}

function previousRangeWorkouts(allWorkouts = [], rangeDays = 0) {
  if (!rangeDays) return [];
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - rangeDays);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - rangeDays);
  const startStr = previousStart.toISOString().split('T')[0];
  const endStr = currentStart.toISOString().split('T')[0];
  return allWorkouts.filter(w => w.date >= startStr && w.date < endStr);
}

function trainingDaysOfWeek(workouts = []) {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const counts = new Array(7).fill(0);
  workouts.forEach(w => {
    const jsDay = new Date(w.date + 'T00:00:00').getDay();
    const idx = (jsDay + 6) % 7;
    counts[idx] += 1;
  });
  const max = Math.max(...counts, 1);
  return days.map((label, idx) => ({ label, value: counts[idx], pct: Math.round((counts[idx] / max) * 100) }));
}

function mostFrequentTrainingDay(workouts = []) {
  const rows = trainingDaysOfWeek(workouts);
  return rows.reduce((best, row) => row.value > (best?.value || 0) ? row : best, null);
}

function weightCompositionStats(weights = []) {
  if (!weights.length) return null;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const first = sorted[0];
  const values = sorted.map(w => w.weight);
  const leanMass = current.fat ? Math.round((current.weight * (1 - current.fat / 100)) * 10) / 10 : null;
  return {
    current: current.weight,
    delta: Math.round((current.weight - first.weight) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
    fat: current.fat || null,
    leanMass
  };
}

function topExercisesByVolume(workouts = [], exercises = [], limit = 5) {
  const map = {};
  workouts.forEach(w => {
    (w.series || []).forEach(s => {
      map[s.exerciseId] = (map[s.exerciseId] || 0) + seriesVol(s);
    });
  });
  return Object.entries(map)
    .map(([id, value]) => ({
      exerciseId: parseInt(id),
      name: exercises.find(e => e.id === parseInt(id))?.name || 'Ejercicio',
      value: Math.round(value)
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function topExercisesByFrequency(workouts = [], exercises = [], limit = 5) {
  const map = {};
  workouts.forEach(w => {
    const unique = [...new Set((w.series || []).map(s => s.exerciseId))];
    unique.forEach(id => { map[id] = (map[id] || 0) + 1; });
  });
  return Object.entries(map)
    .map(([id, value]) => ({
      exerciseId: parseInt(id),
      name: exercises.find(e => e.id === parseInt(id))?.name || 'Ejercicio',
      value
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function exerciseImprovementRanking(workouts = [], exercises = [], limit = 5) {
  return exercises
    .map(ex => {
      const progress = buildExerciseProgressSeries(workouts, ex.id);
      const first = progress.best1RMBySession[0]?.value || 0;
      const last = progress.best1RMBySession[progress.best1RMBySession.length - 1]?.value || 0;
      return { exerciseId: ex.id, name: ex.name, value: last - first, sessions: progress.sessions.length };
    })
    .filter(x => x.sessions >= 2 && x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function leastRecentlyTrainedExercises(workouts = [], exercises = [], limit = 5) {
  return exercises
    .map(ex => {
      const sessions = exerciseSessions(workouts, ex.id);
      const lastDate = sessions[sessions.length - 1]?.date || null;
      const daysAgo = lastDate ? Math.floor((new Date() - new Date(lastDate + 'T00:00:00')) / 86400000) : null;
      return { exerciseId: ex.id, name: ex.name, lastDate, value: daysAgo };
    })
    .filter(x => x.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function exerciseProgressSnapshot(workouts = [], exId) {
  const progress = buildExerciseProgressSeries(workouts, exId);
  const maxSeries = progress.maxWeightBySession;
  const ormSeries = progress.best1RMBySession;
  const lastSession = progress.sessions[progress.sessions.length - 1] || null;
  const lastDate = lastSession?.date || null;
  const maxDelta = maxSeries.length >= 2 ? maxSeries[maxSeries.length - 1].value - maxSeries[0].value : 0;
  const ormDelta = ormSeries.length >= 2 ? ormSeries[ormSeries.length - 1].value - ormSeries[0].value : 0;
  const recent = progress.bestSetBySession[progress.bestSetBySession.length - 1]?.set || null;
  const status = ormDelta > 0 ? 'progress' : progress.sessions.length >= 3 ? 'flat' : 'new';
  return { lastDate, maxDelta, ormDelta, recent, status, sessions: progress.sessions.length };
}

function muscleVolumeBreakdown(workouts = [], exercises = []) {
  const rows = {};
  workouts.forEach(w => {
    (w.series || []).forEach(s => {
      const muscle = exercises.find(e => e.id === s.exerciseId)?.muscle || 'Otro';
      if (!rows[muscle]) rows[muscle] = { muscle, volume: 0, sets: 0 };
      rows[muscle].volume += seriesVol(s);
      rows[muscle].sets += 1;
    });
  });
  const totalVolume = Object.values(rows).reduce((sum, row) => sum + row.volume, 0) || 1;
  return Object.values(rows)
    .map(row => ({
      ...row,
      volume: Math.round(row.volume),
      pct: Math.round((row.volume / totalVolume) * 100)
    }))
    .sort((a, b) => b.volume - a.volume);
}

function muscleBalanceInsight(workouts = [], exercises = []) {
  const rows = muscleVolumeBreakdown(workouts, exercises);
  if (!rows.length) return null;
  const dominant = rows[0];
  const low = rows[rows.length - 1];
  return {
    dominant,
    low,
    message: dominant.pct >= 40
      ? `${dominant.muscle} concentra el ${dominant.pct}% del volumen del rango`
      : `${dominant.muscle} es el grupo dominante del periodo`
  };
}
