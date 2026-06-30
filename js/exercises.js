/* ===================================================
   exercises.js — Exercise list & edit
   =================================================== */
'use strict';

let exFilter = '';

function setExFilter(muscle, btn) {
  exFilter = muscle;
  document.querySelectorAll('#exerciseMuscleFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderExerciseList();
}

async function renderExerciseList() {
  const exercises = await dbGetAll('exercises');
  const q    = document.getElementById('exerciseSearch')?.value || '';
  const list = document.getElementById('exerciseList');
  const filtered = filterAndSortExercises(exercises, q, exFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg></div>
      <div class="empty-state-text">Sin ejercicios</div>
      <div class="empty-state-sub">Pulsa + para crear el primero</div>
    </div>`;
    return;
  }

  // Group by muscle
  const groups = {};
  filtered.forEach(e => {
    const m = e.muscle || 'Otro';
    if (!groups[m]) groups[m] = [];
    groups[m].push(e);
  });

  let html = '';
  const sortedGroups = Object.keys(groups).sort(compareByMuscleOrder);

  sortedGroups.forEach(m => {
    const mc = muscleClass(m);
    if (!exFilter && !q) {
      html += `<div class="ex-category-header">
        <div class="ex-category-dot mc-${mc}"></div>
        <div class="ex-category-name">${m}</div>
        <div class="ex-category-count">${groups[m].length}</div>
      </div>`;
    }
    groups[m].forEach(e => {
      html += `<div class="ex-item" onclick="openExerciseEdit(${e.id})">
        <div class="ex-item-color mc-${mc}"></div>
        <div class="ex-item-icon mc-${mc}-bg"><div class="muscle-dot-sm mc-${mc}"></div></div>
        <div class="ex-item-body">
          <div class="ex-item-name">${e.name}</div>
          <div class="ex-item-muscle">${e.muscle || 'Sin grupo'}</div>
          ${e.notes ? `<div class="ex-item-notes">${e.notes}</div>` : ''}
        </div>
        <div class="ex-item-arrow">›</div>
      </div>`;
    });
  });

  list.innerHTML = html;
}

function selectMuscle(btn) {
  document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('exerciseMuscle').value = btn.dataset.m;
}

async function openExerciseEdit(id) {
  document.getElementById('editExerciseId').value = id || '';
  document.getElementById('exerciseName').value   = '';
  document.getElementById('exerciseMuscle').value = '';
  document.getElementById('exerciseNotes').value  = '';
  document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('selected'));

  const delBtn = document.getElementById('deleteExerciseBtn');
  delBtn.style.display = 'none';

  if (id) {
    const all = await dbGetAll('exercises');
    const ex  = all.find(e => e.id === id);
    if (ex) {
      document.getElementById('exerciseName').value   = ex.name;
      document.getElementById('exerciseMuscle').value = ex.muscle || '';
      document.getElementById('exerciseNotes').value  = ex.notes  || '';
      const chip = document.querySelector(`.muscle-chip[data-m="${ex.muscle}"]`);
      if (chip) chip.classList.add('selected');
      delBtn.style.display = 'block';
    }
  }
  navigateTo('exerciseEdit');
  setTimeout(() => document.getElementById('exerciseName').focus(), 300);
}

async function saveExercise() {
  const name = document.getElementById('exerciseName').value.trim();
  if (!name) { showToast('Escribe el nombre del ejercicio'); return; }
  const idVal = document.getElementById('editExerciseId').value;
  const obj = {
    name,
    muscle: document.getElementById('exerciseMuscle').value,
    notes:  document.getElementById('exerciseNotes').value.trim()
  };
  if (idVal) obj.id = parseInt(idVal);
  await dbPut('exercises', obj);
  showToast(idVal ? '✓ Ejercicio actualizado' : '✓ Ejercicio creado');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  goBack();
}

async function deleteExerciseCurrent() {
  const idVal = document.getElementById('editExerciseId').value;
  if (!idVal) return;
  showActionSheet([
    { icon: '🗑️', label: 'Eliminar ejercicio', danger: true, action: `confirmDeleteExercise(${parseInt(idVal)})` }
  ]);
}

async function confirmDeleteExercise(id) {
  await dbDelete('exercises', id);
  showToast('Ejercicio eliminado');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  goBack();
}
