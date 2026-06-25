/* ===================================================
   goals.js — Goals view
   =================================================== */
'use strict';

async function renderGoals() {
  const exercises = await dbGetAll('exercises');
  const sel = document.getElementById('goalExercise');
  sel.innerHTML = '<option value="">— Seleccionar —</option>' +
    exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  const goals = JSON.parse(localStorage.getItem('goals') || '{}');
  if (goals.weight)           document.getElementById('goalWeight').value           = goals.weight;
  if (goals.strengthExercise) document.getElementById('goalExercise').value          = goals.strengthExercise;
  if (goals.strengthWeight)   document.getElementById('goalStrengthWeight').value    = goals.strengthWeight;

  const [weights, workouts] = await Promise.all([dbGetAll('weight'), dbGetAll('workouts')]);
  weights.sort((a, b) => a.date.localeCompare(b.date));
  let html = '';

  if (goals.weight && weights.length) {
    const cur    = weights[weights.length - 1].weight;
    const start  = weights[0].weight;
    const target = parseFloat(goals.weight);
    const pct    = Math.min(100, Math.max(0, Math.round(
      Math.abs(start - cur) / (Math.abs(start - target) || 1) * 100
    )));
    html += goalBar('Objetivo de peso', `Actual: ${cur} kg → Meta: ${target} kg`, pct);
  }

  if (goals.strengthExercise && goals.strengthWeight) {
    const ex = exercises.find(e => e.id === parseInt(goals.strengthExercise));
    if (ex) {
      const maxKg  = maxWeightForExercise(workouts, ex.id);
      const target = parseFloat(goals.strengthWeight);
      const pct    = Math.min(100, Math.round(maxKg / target * 100));
      html += goalBar(`Fuerza: ${ex.name}`, `Actual: ${maxKg} kg → Meta: ${target} kg`, pct);
    }
  }

  document.getElementById('goalsList').innerHTML = html ||
    '<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div class="empty-state-text">Define objetivos arriba</div></div>';
}

function saveGoals() {
  localStorage.setItem('goals', JSON.stringify({
    weight:           document.getElementById('goalWeight').value,
    strengthExercise: document.getElementById('goalExercise').value,
    strengthWeight:   document.getElementById('goalStrengthWeight').value
  }));
  showToast('✓ Objetivos guardados');
  renderGoals();
}
