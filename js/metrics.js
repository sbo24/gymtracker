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
    const score = mode === 'volume'
      ? s.weight * s.reps
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
      value: Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0)),
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
    w.series.forEach(s => { map[key].value += s.weight * s.reps; });
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
