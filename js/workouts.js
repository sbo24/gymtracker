/* ===================================================
   workouts.js — Workout list, edit, series, picker
   =================================================== */
'use strict';

let blockCount      = 0;
let seriesLineCount = 0;
let _pickerBid      = null;

// ===== FILTERS =====
let workoutRange = 'all';

function setWorkoutRange(range, btn) {
  workoutRange = range;
  document.querySelectorAll('#workoutRangeFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  // Hide date picker when using quick chips (except calendar chip)
  if (range !== 'custom') {
    document.getElementById('workoutDatePicker').style.display = 'none';
    document.getElementById('workoutDatePickerChip').classList.remove('active');
  }
  renderWorkoutList();
}

function toggleWorkoutDatePicker(btn) {
  const picker = document.getElementById('workoutDatePicker');
  const visible = picker.style.display !== 'none';
  picker.style.display = visible ? 'none' : 'block';
  btn.classList.toggle('active', !visible);
  if (!visible) {
    // Switch to custom range when opening picker
    workoutRange = 'custom';
    document.querySelectorAll('#workoutRangeFilter .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
  }
}

function clearWorkoutDatePicker() {
  document.getElementById('workoutDateFrom').value = '';
  document.getElementById('workoutDateTo').value   = '';
  workoutRange = 'all';
  document.querySelectorAll('#workoutRangeFilter .chip').forEach(c => c.classList.remove('active'));
  document.querySelector('#workoutRangeFilter .chip').classList.add('active'); // "Todo"
  document.getElementById('workoutDatePicker').style.display = 'none';
  document.getElementById('workoutDatePickerChip').classList.remove('active');
  renderWorkoutList();
}

function applyWorkoutFilters(workouts, exercises) {
  const now    = new Date();
  const today  = now.toISOString().split('T')[0];
  const q      = (document.getElementById('workoutSearch')?.value || '').toLowerCase().trim();

  // Range filter
  let filtered = workouts;
  if (workoutRange === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().split('T')[0];
    filtered = filtered.filter(w => w.date >= fromStr);
  } else if (workoutRange === 'month') {
    filtered = filtered.filter(w => w.date.slice(0, 7) === today.slice(0, 7));
  } else if (workoutRange === '3m') {
    const from = new Date(now); from.setMonth(from.getMonth() - 3);
    const fromStr = from.toISOString().split('T')[0];
    filtered = filtered.filter(w => w.date >= fromStr);
  } else if (workoutRange === 'custom') {
    const from = document.getElementById('workoutDateFrom')?.value;
    const to   = document.getElementById('workoutDateTo')?.value;
    if (from) filtered = filtered.filter(w => w.date >= from);
    if (to)   filtered = filtered.filter(w => w.date <= to);
  }

  // Text search
  if (q) {
    filtered = filtered.filter(w =>
      w.date.includes(q) ||
      (w.notes || '').toLowerCase().includes(q) ||
      w.series.some(s => {
        const ex = exercises.find(e => e.id === s.exerciseId);
        return ex && ex.name.toLowerCase().includes(q);
      })
    );
  }

  return filtered;
}

// ===== LIST =====
async function renderWorkoutList() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  workouts.sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('workoutList');

  if (!workouts.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg></div>
      <div class="empty-state-text">Sin entrenamientos</div>
      <div class="empty-state-sub">Pulsa + para registrar el primero</div>
    </div>`;
    document.getElementById('workoutFilterInfo').style.display = 'none';
    return;
  }

  const filtered = applyWorkoutFilters(workouts, exercises);

  // Filter info bar
  const infoEl = document.getElementById('workoutFilterInfo');
  const isFiltered = workoutRange !== 'all' ||
    (document.getElementById('workoutSearch')?.value || '').trim();
  if (isFiltered && filtered.length !== workouts.length) {
    const totalVol = filtered.reduce((s, w) => s + w.series.reduce((a, r) => a + r.weight * r.reps, 0), 0);
    infoEl.textContent = `${filtered.length} entreno${filtered.length !== 1 ? 's' : ''} · ${formatBigNum(Math.round(totalVol))} kg vol. total`;
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4" stroke-linecap="round"/></svg></div>
      <div class="empty-state-text">Sin resultados</div>
      <div class="empty-state-sub">Prueba con otro rango de fechas</div>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(w => {
    const vol       = w.series.reduce((s, r) => s + r.weight * r.reps, 0);
    const totalSets = w.series.length;

    const exOrder = [], grouped = {};
    w.series.forEach(s => {
      const ex  = exercises.find(e => e.id === s.exerciseId);
      const key = s.exerciseId;
      if (!grouped[key]) { grouped[key] = { ex, sets: [] }; exOrder.push(key); }
      grouped[key].sets.push(s);
    });

    const muscles = [...new Set(exOrder.map(k => grouped[k].ex?.muscle).filter(Boolean))];
    const muscleTags = muscles.map(m => {
      const mc = muscleClass(m);
      return `<span class="wl-muscle-tag mc-${mc}-bg" style="color:var(--text2)">${muscleEmoji(m)} ${m}</span>`;
    }).join('');

    const exRows = exOrder.map(key => {
      const { ex, sets } = grouped[key];
      const name  = ex ? ex.name : 'Ejercicio eliminado';
      const mc    = ex ? muscleClass(ex.muscle) : 'otro';
      const maxKg = Math.max(...sets.map(s => s.weight));
      const setsStr = sets.map(s =>
        `<span class="wl-set-badge">${s.weight}<span style="font-size:10px;opacity:0.7">kg</span>×${s.reps}</span>`
      ).join('');
      return `<div class="wl-ex-row">
        <div class="wl-ex-left">
          <div class="wl-ex-dot mc-${mc}"></div>
          <div class="wl-ex-info">
            <div class="wl-ex-name">${name}</div>
            <div class="wl-sets-row">${setsStr}</div>
          </div>
        </div>
        <div class="wl-ex-max">${maxKg}<span style="font-size:11px;opacity:0.6"> kg</span></div>
      </div>`;
    }).join('');

    const photoSrc = w.photo || w.photo_url;
    return `<div class="wl-card" onclick="openWorkoutEdit(${w.id})">
      <div class="wl-header">
        <div>
          <div class="wl-date">${formatDate(w.date)}</div>
          <div class="wl-meta">${totalSets} series · ${Math.round(vol).toLocaleString()} kg vol.</div>
        </div>
        <div class="wl-actions">
          <button class="wl-copy-btn" onclick="event.stopPropagation(); copyWorkout(${w.id})" title="Copiar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="wl-del-btn" onclick="event.stopPropagation(); confirmDeleteWorkout(${w.id})" title="Eliminar"></button>
        </div>
      </div>
      <div class="wl-muscles">${muscleTags}</div>
      <div class="wl-exercises">${exRows}</div>
      ${w.notes ? `<div class="wl-notes">"${w.notes}"</div>` : ''}
      ${photoSrc ? `<img src="${photoSrc}" alt="Foto" onclick="event.stopPropagation()" style="margin-top:10px;width:100%;height:140px;object-fit:cover;border-radius:10px;display:block;" />` : ''}
    </div>`;
  }).join('');
}

function confirmDeleteWorkout(id) {
  showActionSheet([
    { icon: '🗑️', label: 'Eliminar entrenamiento', danger: true, action: `deleteWorkout(${id})` }
  ], 'Esta acción no se puede deshacer');
}

async function deleteWorkout(id) {
  await dbDelete('workouts', id);
  showToast('Entrenamiento eliminado');
  syncNow('push');
  renderWorkoutList();
}

async function copyWorkout(id) {
  const all      = await dbGetAll('workouts');
  const original = all.find(w => w.id === id);
  if (!original) return;

  blockCount = 0;
  document.getElementById('editWorkoutId').value = '';
  document.getElementById('workoutDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('workoutNotes').value  = original.notes || '';
  document.getElementById('exerciseBlocksContainer').innerHTML = '';

  const grouped = {}, order = [];
  original.series.forEach(s => {
    if (!grouped[s.exerciseId]) { grouped[s.exerciseId] = []; order.push(s.exerciseId); }
    grouped[s.exerciseId].push(s);
  });
  for (const exId of order) await addExerciseBlock(exId, grouped[exId]);

  navigateTo('workoutEdit');
  showToast('Entrenamiento copiado — revisa y guarda');
}

// ===== EDIT =====
function handleWorkoutPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    document.getElementById('workoutPhotoData').value = data;
    const preview = document.getElementById('workoutPhotoPreview');
    preview.style.backgroundImage  = `url(${data})`;
    preview.style.backgroundSize   = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.style.minHeight = '160px';
    preview.innerHTML = `<div class="workout-photo-remove" onclick="event.stopPropagation();removeWorkoutPhoto()">✕ Quitar foto</div>`;
  };
  reader.readAsDataURL(file);
}

function removeWorkoutPhoto() {
  document.getElementById('workoutPhotoData').value = '';
  document.getElementById('workoutPhotoInput').value = '';
  const preview = document.getElementById('workoutPhotoPreview');
  preview.style.backgroundImage = '';
  preview.style.minHeight = '';
  preview.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Añadir foto</span>`;
}

async function openWorkoutEdit(id) {
  blockCount = 0;
  document.getElementById('editWorkoutId').value = id || '';
  document.getElementById('workoutDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('workoutNotes').value  = '';
  document.getElementById('exerciseBlocksContainer').innerHTML = '';
  removeWorkoutPhoto();

  if (id) {
    const all = await dbGetAll('workouts');
    const w   = all.find(x => x.id === id);
    if (w) {
      document.getElementById('workoutDate').value  = w.date;
      document.getElementById('workoutNotes').value = w.notes || '';
      const photoSrc = w.photo || w.photo_url;
      if (photoSrc) {
        document.getElementById('workoutPhotoData').value = photoSrc;
        const preview = document.getElementById('workoutPhotoPreview');
        preview.style.backgroundImage    = `url(${photoSrc})`;
        preview.style.backgroundSize     = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.style.minHeight = '160px';
        preview.innerHTML = `<div class="workout-photo-remove" onclick="event.stopPropagation();removeWorkoutPhoto()">✕ Quitar foto</div>`;
      }
      const grouped = {};
      const order   = [];
      w.series.forEach(s => {
        if (!grouped[s.exerciseId]) {
          grouped[s.exerciseId] = [];
          order.push(s.exerciseId);   // preservar orden de primera aparición
        }
        grouped[s.exerciseId].push(s);
      });
      for (const exId of order)
        await addExerciseBlock(exId, grouped[exId]);
    }
  } else {
    await addExerciseBlock();
  }
  navigateTo('workoutEdit');
}

async function addExerciseBlock(selectedExId = null, existingSets = []) {
  const exercises = await dbGetAll('exercises');
  blockCount++;
  const bid  = blockCount;
  const cont = document.getElementById('exerciseBlocksContainer');

  const selEx    = exercises.find(e => e.id === selectedExId);
  const selName  = selEx ? selEx.name : '';
  const selMc    = selEx ? muscleClass(selEx.muscle) : 'otro';
  const selEmoji = selEx ? muscleEmoji(selEx.muscle) : '🏋️';

  const block = document.createElement('div');
  block.className = 'workout-exercise-block';
  block.id = `block-${bid}`;
  block.innerHTML = `
    <div class="wex-header" id="wexHeader-${bid}" onclick="openExercisePicker(${bid})">
      <div class="wex-ex-icon mc-${selMc}-bg" id="wexIcon-${bid}">${selEmoji}</div>
      <div class="wex-ex-name" id="wexName-${bid}">${selName || '— Toca para elegir ejercicio —'}</div>
      <button class="wex-del" onclick="event.stopPropagation();removeBlock(${bid})" title="Eliminar">×</button>
    </div>
    <input type="hidden" id="blockEx-${bid}" value="${selectedExId || ''}" />
    <div class="wex-series-list" id="blockSeries-${bid}"></div>
    <button class="wex-add-series" onclick="addSeriesLine(${bid})">+ Añadir serie</button>`;
  cont.appendChild(block);

  if (existingSets.length) existingSets.forEach(s => addSeriesLine(bid, s));
  else addSeriesLine(bid);
}

// ===== EXERCISE PICKER =====
async function openExercisePicker(bid) {
  _pickerBid = bid;
  const exercises = await dbGetAll('exercises');

  const groups = {};
  exercises.forEach(e => {
    const m = e.muscle || 'Otro';
    if (!groups[m]) groups[m] = [];
    groups[m].push(e);
  });

  let html = '';
  MUSCLE_ORDER.forEach(m => {
    if (!groups[m]) return;
    const mc = muscleClass(m);
    html += `<div class="picker-group-label">
      <span class="picker-group-dot mc-${mc}"></span>${m}
      <span class="picker-group-count">${groups[m].length}</span>
    </div>`;
    groups[m].forEach(e => {
      html += `<div class="picker-item" onclick="selectExerciseForBlock(${bid}, ${e.id})">
        <span class="picker-item-name">${e.name}</span>
        ${e.notes ? `<span class="picker-item-notes">${e.notes}</span>` : ''}
      </div>`;
    });
  });

  document.getElementById('exercisePickerList').innerHTML = html ||
    '<div style="padding:24px;text-align:center;color:var(--text3)">No hay ejercicios. Crea uno primero.</div>';
  document.getElementById('exercisePickerSearch').value = '';
  document.getElementById('exercisePickerSheet').classList.add('active');
  document.getElementById('modalOverlay').classList.add('active');
  setTimeout(() => document.getElementById('exercisePickerSearch').focus(), 350);
}

function filterPickerList() {
  const q = document.getElementById('exercisePickerSearch').value.toLowerCase().trim();
  document.querySelectorAll('.picker-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.picker-group-label').forEach(label => {
    let anyVisible = false, el = label.nextElementSibling;
    while (el && el.classList.contains('picker-item')) {
      if (el.style.display !== 'none') anyVisible = true;
      el = el.nextElementSibling;
    }
    label.style.display = anyVisible ? '' : 'none';
  });
}

function selectExerciseForBlock(bid, exId) {
  document.getElementById(`blockEx-${bid}`).value = exId;
  const item = document.querySelector(`.picker-item[onclick*="selectExerciseForBlock(${bid}, ${exId})"]`);
  const name = item ? item.querySelector('.picker-item-name').textContent : '';
  document.getElementById(`wexName-${bid}`).textContent = name;
  dbGetAll('exercises').then(exercises => {
    const ex = exercises.find(e => e.id === exId);
    if (ex) {
      const mc   = muscleClass(ex.muscle);
      const icon = document.getElementById(`wexIcon-${bid}`);
      icon.className = `wex-ex-icon mc-${mc}-bg`;
      icon.innerHTML = `<div class="muscle-dot-sm mc-${mc}"></div>`;
    }
  });
  closeExercisePicker();
}

function closeExercisePicker() {
  document.getElementById('exercisePickerSheet').classList.remove('active');
  document.getElementById('modalOverlay').classList.remove('active');
  _pickerBid = null;
}

// ===== SERIES =====
function addSeriesLine(bid, data = {}) {
  seriesLineCount++;
  const lid  = seriesLineCount;
  const cont = document.getElementById(`blockSeries-${bid}`);
  const idx  = cont.querySelectorAll('.wex-series-row').length + 1;
  const row  = document.createElement('div');
  row.className = 'wex-series-row';
  row.id = `sline-${lid}`;
  row.innerHTML = `
    <div class="wex-series-num">${idx}</div>
    <div class="wex-input-wrap">
      <div class="wex-input-label">kg</div>
      <input type="number" class="wex-input" value="${data.weight || ''}" placeholder="80" step="0.5" inputmode="decimal" data-field="weight" />
    </div>
    <div class="wex-input-wrap">
      <div class="wex-input-label">reps</div>
      <input type="number" class="wex-input" value="${data.reps || ''}" placeholder="8" inputmode="numeric" data-field="reps" />
    </div>
    <button class="wex-del-series" onclick="removeSeriesLine(${lid})">×</button>`;
  cont.appendChild(row);
}

function removeSeriesLine(lid) {
  const row = document.getElementById(`sline-${lid}`);
  if (row) {
    const cont = row.parentElement;
    row.remove();
    cont.querySelectorAll('.wex-series-num').forEach((el, i) => { el.textContent = i + 1; });
  }
}

function removeBlock(bid) {
  const block = document.getElementById(`block-${bid}`);
  if (block) block.remove();
}

// ===== SAVE =====
async function saveWorkout() {
  const date = document.getElementById('workoutDate').value;
  if (!date) { showToast('Selecciona una fecha'); return; }

  const series = [];
  document.querySelectorAll('.workout-exercise-block').forEach(block => {
    const hiddenInput = block.querySelector('input[type="hidden"][id^="blockEx-"]');
    const exId = parseInt(hiddenInput?.value || '0');
    if (!exId) return;
    block.querySelectorAll('.wex-series-row').forEach(row => {
      const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
      const reps   = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
      if (reps > 0) series.push({ exerciseId: exId, weight, reps });
    });
  });

  if (!series.length) { showToast('Añade al menos una serie con reps'); return; }

  const idVal    = document.getElementById('editWorkoutId').value;
  const photoData = document.getElementById('workoutPhotoData').value;
  const obj = { date, notes: document.getElementById('workoutNotes').value.trim(), series };
  if (photoData) obj.photo = photoData;
  if (idVal) obj.id = parseInt(idVal);

  await dbPut('workouts', obj);
  showToast('✓ Entrenamiento guardado');
  syncNow('push');
  goBack();
}
