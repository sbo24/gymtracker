/* ===================================================
   workouts.js — Workout list, edit, series, picker
   =================================================== */
'use strict';

let blockCount      = 0;
let seriesLineCount = 0;
let _pickerBid      = null;

// ===== AUTOSAVE =====
let _autoSaveTimer  = null;
let _autoSaveDirty  = false; // hay cambios sin guardar

function scheduleAutoSave() {
  _autoSaveDirty = true;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => autoSaveWorkout(), 1500);
}

async function autoSaveWorkout() {
  if (!_autoSaveDirty) return;
  const draft = buildWorkoutPayloadFromEditor();
  if (!draft.date) return;
  // Solo guardar si hay al menos una serie con datos
  const hasSeries = draft.series.some(s => s.cardio ? s.duration > 0 : s.reps > 0);
  if (!hasSeries) return;

  const idVal = document.getElementById('editWorkoutId').value;
  const obj   = { date: draft.date, notes: draft.notes, series: draft.series };
  if (draft.photo) obj.photo = draft.photo;
  if (idVal) obj.id = parseInt(idVal);

  const savedId = await dbPut('workouts', obj);
  // Si era nuevo, guardar el ID asignado para futuros autoguardados
  if (!idVal && savedId) {
    document.getElementById('editWorkoutId').value = savedId;
  }

  _autoSaveDirty = false;
  showAutoSaveIndicator();
  // Sincronizar con Supabase en segundo plano
  if (typeof syncNow === 'function') syncNow('push');
}

function showAutoSaveIndicator() {
  const el = document.getElementById('autoSaveIndicator');
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

// Guardar al salir de la vista (llamado desde nav.js antes de cambiar vista)
async function saveWorkoutOnLeave() {
  if (!_autoSaveDirty) return;
  clearTimeout(_autoSaveTimer);
  await autoSaveWorkout();
}

function resetWorkoutEditorState() {
  blockCount = 0;
  document.getElementById('editWorkoutId').value = '';
  document.getElementById('workoutDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('workoutNotes').value = '';
  document.getElementById('exerciseBlocksContainer').innerHTML = '';
  document.getElementById('workoutTemplateHint').textContent = '';
  removeWorkoutPhoto();
}

function setWorkoutPhotoPreview(photoSrc) {
  if (!photoSrc) return;
  document.getElementById('workoutPhotoData').value = photoSrc;
  const preview = document.getElementById('workoutPhotoPreview');
  preview.style.backgroundImage = `url(${photoSrc})`;
  preview.style.backgroundSize = 'cover';
  preview.style.backgroundPosition = 'center';
  preview.style.minHeight = '160px';
  preview.innerHTML = `<div class="workout-photo-remove" onclick="event.stopPropagation();removeWorkoutPhoto()">✕ Quitar foto</div>`;
}

async function hydrateWorkoutEditor(draft, options = {}) {
  resetWorkoutEditorState();
  document.getElementById('editWorkoutId').value = options.editId || '';
  document.getElementById('workoutDate').value = draft.date || new Date().toISOString().split('T')[0];
  document.getElementById('workoutNotes').value = draft.notes || '';
  if (draft.photo) setWorkoutPhotoPreview(draft.photo);

  const { grouped, order } = groupSeriesByExercise(draft.series || []);
  if (order.length) {
    for (const exId of order) {
      await addExerciseBlock(parseInt(exId), grouped[exId]);
      // Restaurar nota del bloque (guardada en la primera serie que la tenga)
      const blockNote = grouped[exId].find(s => s.note)?.note || '';
      if (blockNote) {
        // Encontrar el bid del bloque recién añadido (el último)
        const allBlocks = document.querySelectorAll('.workout-exercise-block');
        const lastBlock = allBlocks[allBlocks.length - 1];
        if (lastBlock) {
          const bid = lastBlock.id.replace('block-', '');
          const textarea = document.getElementById(`blockNote-${bid}`);
          const toggleBtn = document.getElementById(`wexNoteToggle-${bid}`);
          if (textarea) {
            textarea.value = blockNote;
            textarea.style.display = 'block';
            if (toggleBtn) toggleBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> Ocultar nota`;
            const preview = document.getElementById(`blockNotePreview-${bid}`);
            if (preview) { preview.textContent = blockNote; }
          }
        }
      }
    }
  } else {
    await addExerciseBlock();
  }

  if (options.templateLabel) {
    document.getElementById('workoutTemplateHint').textContent = `Plantilla cargada: ${options.templateLabel}`;
  }
}

async function loadWorkoutIntoEditor(workout, options = {}) {
  await hydrateWorkoutEditor(buildWorkoutDraft(workout), options);
  navigateTo('workoutEdit');
}

function buildWorkoutPayloadFromEditor() {
  const date = document.getElementById('workoutDate').value;
  const title = document.getElementById('workoutTitle').value.trim();
  const series = [];
  document.querySelectorAll('.workout-exercise-block').forEach(block => {
    const hiddenInput = block.querySelector('input[type="hidden"][id^="blockEx-"]');
    const exId = parseInt(hiddenInput?.value || '0');
    if (!exId) return;
    // Nota del bloque
    const bid = block.id.replace('block-', '');
    const blockNoteEl = document.getElementById(`blockNote-${bid}`);
    const blockNote = blockNoteEl?.value.trim() || '';
    const isCardio = block.dataset.muscle === 'Cardio';

    block.querySelectorAll('.wex-series-row').forEach(row => {
      if (isCardio) {
        const duration = parseFloat(row.querySelector('[data-field="duration"]')?.value) || 0;
        if (duration > 0) {
          series.push({
            exerciseId: exId,
            duration,
            distance:  parseFloat(row.querySelector('[data-field="distance"]')?.value) || null,
            speed:     parseFloat(row.querySelector('[data-field="speed"]')?.value)    || null,
            incline:   parseFloat(row.querySelector('[data-field="incline"]')?.value)  || null,
            cardio: true,
            ...(blockNote ? { note: blockNote } : {})
          });
        }
      } else {
        const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
        const reps = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
        if (reps > 0) series.push({ exerciseId: exId, weight, reps, ...(blockNote ? { note: blockNote } : {}) });
      }
    });
  });
  return {
    date,
    title,
    notes: document.getElementById('workoutNotes').value.trim(),
    series,
    photo: document.getElementById('workoutPhotoData').value || ''
  };
}

async function latestWorkoutForActions() {
  const workouts = await dbGetAll('workouts');
  workouts.sort((a, b) => b.date.localeCompare(a.date));
  return { workouts, latest: findLastWorkout(workouts), yesterday: findWorkoutFromYesterday(workouts) };
}

async function editLastWorkout() {
  const { latest } = await latestWorkoutForActions();
  if (!latest) { showToast('Aún no tienes entrenos'); return; }
  openWorkoutEdit(latest.id);
}

async function repeatLastWorkout() {
  const { yesterday, latest } = await latestWorkoutForActions();
  const target = yesterday || latest;
  if (!target) { showToast('Aún no tienes entrenos'); return; }
  copyWorkout(target.id);
}

// ===== FILTERS =====
let workoutRange = 'all';
let workoutMuscleFilter = '';

function setWorkoutRange(range, btn) {
  workoutRange = range;
  document.querySelectorAll('#workoutRangeFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  if (range !== 'custom') {
    document.getElementById('workoutDatePicker').style.display = 'none';
    document.getElementById('workoutDatePickerChip').classList.remove('active');
  }
  renderWorkoutList();
}

function setWorkoutMuscle(muscle, btn) {
  workoutMuscleFilter = muscle;
  document.querySelectorAll('#workoutMuscleFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
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

  // Muscle filter
  if (workoutMuscleFilter) {
    filtered = filtered.filter(w => {
      const muscles = [...new Set(w.series.map(s => {
        const ex = exercises.find(e => e.id === s.exerciseId);
        return ex?.muscle;
      }).filter(Boolean))];
      return muscles.includes(workoutMuscleFilter);
    });
  }

  // Text search
  if (q) {
    filtered = filtered.filter(w =>
      w.date.includes(q) ||
      (w.title || '').toLowerCase().includes(q) ||
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
    const totalVol = filtered.reduce((s, w) => s + w.series.reduce((a, r) => a + (r.cardio ? 0 : (r.weight || 0) * (r.reps || 0)), 0), 0);
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
    // Ignorar series de cardio en el cálculo de volumen
    const vol       = w.series.reduce((s, r) => s + (r.cardio ? 0 : (r.weight || 0) * (r.reps || 0)), 0);
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
      const maxKg = sets[0]?.cardio
        ? (sets[0].distance ? `${sets[0].distance}km` : `${sets[0].duration}min`)
        : Math.max(...sets.map(s => s.weight));
      const setsStr = sets.map(s => {
        if (s.cardio) {
          const parts = [`${s.duration}min`];
          if (s.distance) parts.push(`${s.distance}km`);
          if (s.speed)    parts.push(`${s.speed}km/h`);
          if (s.incline)  parts.push(`${s.incline}% incl`);
          return `<span class="wl-set-badge wl-set-cardio">${parts.join(' · ')}</span>`;
        }
        return `<span class="wl-set-badge">${s.weight}<span style="font-size:10px;opacity:0.7">kg</span>×${s.reps}</span>`;
      }).join('');
      const exNote = sets.find(s => s.note)?.note || '';
      return `<div class="wl-ex-row">
        <div class="wl-ex-left">
          <div class="wl-ex-dot mc-${mc}"></div>
          <div class="wl-ex-info">
            <div class="wl-ex-name">${name}</div>
            <div class="wl-sets-row">${setsStr}</div>
            ${exNote ? `<div class="wl-ex-note">${exNote}</div>` : ''}
          </div>
        </div>
        <div class="wl-ex-max">${sets[0]?.cardio ? maxKg : `${maxKg}<span style="font-size:11px;opacity:0.6"> kg</span>`}</div>
      </div>`;
    }).join('');

    const photoSrc = w.photo || w.photo_url;
    const titleHtml = w.title ? `<div class="wl-title">${w.title}</div>` : '';
    return `<div class="wl-card" onclick="openWorkoutEdit(${w.id})">
      <div class="wl-header">
        <div>
          <div class="wl-date">${formatDate(w.date)}</div>
          ${titleHtml}
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
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  renderWorkoutList();
}

async function copyWorkout(id) {
  const all      = await dbGetAll('workouts');
  const original = all.find(w => w.id === id);
  if (!original) return;
  const draft = buildWorkoutDraft(original);
  draft.date = new Date().toISOString().split('T')[0];
  await loadWorkoutIntoEditor(draft, { editId: '' });
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
  resetWorkoutEditorState();
  if (id) {
    const all = await dbGetAll('workouts');
    const w   = all.find(x => x.id === id);
    if (w) await hydrateWorkoutEditor(buildWorkoutDraft(w), { editId: id });
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
  block.dataset.muscle = selEx?.muscle || '';
  block.innerHTML = `
    <div class="wex-header" id="wexHeader-${bid}" onclick="openExercisePicker(${bid})">
      <div class="wex-ex-icon mc-${selMc}-bg" id="wexIcon-${bid}">${selEmoji}</div>
      <div class="wex-ex-name" id="wexName-${bid}">${selName || '— Toca para elegir ejercicio —'}</div>
      <button class="wex-del" onclick="event.stopPropagation();removeBlock(${bid})" title="Eliminar">×</button>
    </div>
    <input type="hidden" id="blockEx-${bid}" value="${selectedExId || ''}" />
    <div class="wex-series-list" id="blockSeries-${bid}"></div>
    <div class="wex-actions-row">
      <button class="wex-add-series" onclick="addSeriesLine(${bid})">+ Añadir serie</button>
      <button class="wex-copy-last-btn" id="copyLastBtn-${bid}" onclick="copyLastSeriesFromHistory(${bid})" title="Copiar última serie registrada de este ejercicio" style="display:none">⟳ Última</button>
    </div>
    <div class="wex-note-row">
      <button class="wex-note-toggle" onclick="toggleBlockNote(${bid})" id="wexNoteToggle-${bid}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Añadir nota
      </button>
      <textarea class="wex-note-input" id="blockNote-${bid}" placeholder="Sensaciones, técnica, ajuste de máquina..." rows="2" style="display:none" oninput="renderBlockNotePreview(${bid});scheduleAutoSave()"></textarea>
      <div class="wex-note-preview" id="blockNotePreview-${bid}" style="display:none"></div>
    </div>`;
  cont.appendChild(block);

  if (existingSets.length) {
    existingSets.forEach(s => addSeriesLine(bid, s));
    // Mostrar botón "Última" si hay series cargadas
    const btn = document.getElementById(`copyLastBtn-${bid}`);
    if (btn) btn.style.display = 'flex';
  } else {
    addSeriesLine(bid);
  }
}

// ===== EXERCISE PICKER =====
async function openExercisePicker(bid) {
  _pickerBid = bid;
  const exercises = await dbGetAll('exercises');
  const sorted = filterAndSortExercises(exercises);
  const groups = {};
  sorted.forEach(e => {
    const muscle = e.muscle || 'Otro';
    if (!groups[muscle]) groups[muscle] = [];
    groups[muscle].push(e);
  });

  let html = '';
  [...new Set(sorted.map(e => e.muscle || 'Otro'))].forEach(m => {
    const mc = muscleClass(m);
    html += `<div class="picker-group-label">
      <span class="picker-group-dot mc-${mc}"></span>${m}
      <span class="picker-group-count">${groups[m].length}</span>
    </div>`;
    groups[m].forEach(e => {
      html += `<div class="picker-item" data-exercise-id="${e.id}" data-search="${normalizeSearchText(`${e.name} ${e.muscle || ''} ${e.notes || ''}`)}" onclick="selectExerciseForBlock(${bid}, ${e.id})">
        <span class="picker-item-name">${e.name}</span>
        <span class="picker-item-muscle">${e.muscle || 'Otro'}</span>
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
  const q = normalizeSearchText(document.getElementById('exercisePickerSearch').value);
  document.querySelectorAll('.picker-item').forEach(item => {
    const haystack = item.dataset.search || '';
    item.style.display = !q || haystack.includes(q) ? '' : 'none';
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
      // Actualizar data-muscle en el bloque
      const block = document.getElementById(`block-${bid}`);
      if (block) block.dataset.muscle = ex.muscle || '';
      // Si cambia a/desde cardio, limpiar las series actuales y añadir una nueva
      const cont = document.getElementById(`blockSeries-${bid}`);
      if (cont && cont.children.length > 0) {
        cont.innerHTML = '';
        seriesLineCount; // no resetear el contador global
        addSeriesLine(bid);
      }
    }
  });
  // Mostrar siempre el botón "Última" (copia la última serie del bloque)
  const btn = document.getElementById(`copyLastBtn-${bid}`);
  if (btn) btn.style.display = 'flex';
  closeExercisePicker();
}

async function toggleBlockNote(bid) {
  const textarea  = document.getElementById(`blockNote-${bid}`);
  const btn       = document.getElementById(`wexNoteToggle-${bid}`);
  const preview   = document.getElementById(`blockNotePreview-${bid}`);
  if (!textarea) return;
  const visible = textarea.style.display !== 'none';
  textarea.style.display = visible ? 'none' : 'block';
  // Si se cierra y hay texto, mostrar preview
  if (visible && textarea.value.trim()) {
    if (preview) { preview.textContent = textarea.value.trim(); preview.style.display = 'block'; }
  } else {
    if (preview) preview.style.display = 'none';
  }
  // Actualizar icono del botón
  btn.innerHTML = visible
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Añadir nota`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> Ocultar nota`;
  if (!visible) setTimeout(() => textarea.focus(), 50);
}

function renderBlockNotePreview(bid) {
  const textarea = document.getElementById(`blockNote-${bid}`);
  const preview  = document.getElementById(`blockNotePreview-${bid}`);
  if (!textarea || !preview) return;
  const val = textarea.value.trim();
  preview.textContent = val;
  preview.style.display = val ? 'block' : 'none';
}

function copyLastSeriesFromHistory(bid) {
  // Coge la última serie del bloque actual (la que acabas de introducir)
  const cont = document.getElementById(`blockSeries-${bid}`);
  if (!cont) return;
  const rows = cont.querySelectorAll('.wex-series-row');
  if (!rows.length) { showToast('Añade una serie primero'); return; }

  const lastRow = rows[rows.length - 1];
  const weight  = lastRow.querySelector('[data-field="weight"]')?.value || '';
  const reps    = lastRow.querySelector('[data-field="reps"]')?.value || '';

  addSeriesLine(bid, { weight: parseFloat(weight) || 0, reps: parseInt(reps) || 0 });
}

function closeExercisePicker() {  document.getElementById('exercisePickerSheet').classList.remove('active');
  document.getElementById('modalOverlay').classList.remove('active');
  _pickerBid = null;
}

// ===== SERIES =====
function addSeriesLine(bid, data = {}) {
  seriesLineCount++;
  const lid  = seriesLineCount;
  const cont = document.getElementById(`blockSeries-${bid}`);
  const idx  = cont.querySelectorAll('.wex-series-row').length + 1;

  // Detectar si el ejercicio es de cardio
  const block    = document.getElementById(`block-${bid}`);
  const isCardio = block?.dataset.muscle === 'Cardio';

  const row = document.createElement('div');
  row.className = 'wex-series-row';
  row.id = `sline-${lid}`;

  if (isCardio) {
    row.className = 'wex-series-row wex-series-row-cardio';
    row.innerHTML = `
      <div class="wex-cardio-header">
        <span class="wex-series-num">${idx}</span>
        <button class="wex-del-series" onclick="removeSeriesLine(${lid})">×</button>
      </div>
      <div class="wex-cardio-wrap">
        <div class="wex-cardio-main">
          <div class="wex-input-wrap" style="flex:1">
            <div class="wex-input-label">Tiempo (min) *</div>
            <input type="number" class="wex-input" value="${data.duration || ''}" placeholder="30" step="1" inputmode="numeric" data-field="duration" oninput="scheduleAutoSave()" />
          </div>
        </div>
        <div class="wex-cardio-optional">
          <div class="wex-input-wrap">
            <div class="wex-input-label">km</div>
            <input type="number" class="wex-input" value="${data.distance || ''}" placeholder="—" step="0.1" inputmode="decimal" data-field="distance" oninput="scheduleAutoSave()" />
          </div>
          <div class="wex-input-wrap">
            <div class="wex-input-label">km/h</div>
            <input type="number" class="wex-input" value="${data.speed || ''}" placeholder="—" step="0.1" inputmode="decimal" data-field="speed" oninput="scheduleAutoSave()" />
          </div>
          <div class="wex-input-wrap">
            <div class="wex-input-label">% incl</div>
            <input type="number" class="wex-input" value="${data.incline || ''}" placeholder="—" step="0.5" inputmode="decimal" data-field="incline" oninput="scheduleAutoSave()" />
          </div>
        </div>
      </div>`;
  } else {
    row.innerHTML = `
      <div class="wex-series-num">${idx}</div>
      <div class="wex-input-wrap">
        <div class="wex-input-label">kg</div>
        <input type="number" class="wex-input" value="${data.weight || ''}" placeholder="80" step="0.5" inputmode="decimal" data-field="weight" oninput="scheduleAutoSave()" />
      </div>
      <div class="wex-input-wrap">
        <div class="wex-input-label">reps</div>
        <input type="number" class="wex-input" value="${data.reps || ''}" placeholder="8" inputmode="numeric" data-field="reps" oninput="scheduleAutoSave()" />
      </div>
      <button class="wex-del-series" onclick="removeSeriesLine(${lid})">×</button>`;
  }

  cont.appendChild(row);
  // Mostrar botón "Última"
  const blockId = cont.id.replace('blockSeries-', '');
  const btn = document.getElementById(`copyLastBtn-${blockId}`);
  if (btn) btn.style.display = 'flex';
}

function removeSeriesLine(lid) {
  const row = document.getElementById(`sline-${lid}`);
  if (row) {
    const cont = row.parentElement;
    row.remove();
    cont.querySelectorAll('.wex-series-num').forEach((el, i) => { el.textContent = i + 1; });
    scheduleAutoSave();
  }
}

function removeBlock(bid) {
  const block = document.getElementById(`block-${bid}`);
  if (block) { block.remove(); scheduleAutoSave(); }
}

// ===== SAVE =====
async function saveWorkout() {
  const draft = buildWorkoutPayloadFromEditor();
  const date = draft.date;
  if (!date) { showToast('Selecciona una fecha'); return; }
  const { series } = draft;
  if (!series.length) { showToast('Añade al menos una serie con reps'); return; }

  const idVal    = document.getElementById('editWorkoutId').value;
  const obj = { date, notes: draft.notes, series };
  if (draft.photo) obj.photo = draft.photo;
  if (idVal) obj.id = parseInt(idVal);

  await dbPut('workouts', obj);
  showToast('✓ Entrenamiento guardado');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  goBack();
}

async function saveCurrentWorkoutAsTemplate() {
  const draft = buildWorkoutPayloadFromEditor();
  if (!draft.series.length) { showToast('Añade al menos una serie'); return; }
  const weekday = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(draft.date).getDay()];
  const suggested = `Plantilla ${weekday}`;
  const name = window.prompt('Nombre de la plantilla', suggested);
  if (!name || !name.trim()) return;
  await dbPut('templates', {
    name: name.trim(),
    weekday,
    notes: draft.notes,
    series: draft.series,
    updated_at: new Date().toISOString()
  });
  if (typeof notePendingSync === 'function') notePendingSync('Plantilla pendiente de sincronizar');
  if (typeof syncNow === 'function') syncNow('push');
  if (typeof renderTemplateSummary === 'function') renderTemplateSummary();
  showToast('✓ Plantilla guardada');
}

async function openTemplatePicker() {
  const templates = await dbGetAll('templates');
  if (!templates.length) {
    showToast('Aún no hay plantillas guardadas');
    return;
  }
  templates.sort((a, b) => (a.weekday || '').localeCompare(b.weekday || '') || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const items = templates.map(t => ({
    icon: '📋',
    label: `${t.name}${t.weekday ? ` · ${t.weekday}` : ''}`,
    action: `loadTemplateIntoWorkout(${t.id})`
  }));
  showActionSheet(items, 'Selecciona una plantilla');
}

async function loadTemplateIntoWorkout(id) {
  const templates = await dbGetAll('templates');
  const template = templates.find(t => t.id === id);
  if (!template) return;
  const draft = buildWorkoutDraft({
    date: new Date().toISOString().split('T')[0],
    notes: template.notes,
    series: template.series
  });
  await loadWorkoutIntoEditor(draft, { editId: '', templateLabel: template.name });
  closeActionSheet();
  showToast('Plantilla cargada');
}

async function renderTemplateSummary() {
  const el = document.getElementById('templateSummary');
  if (!el) return;
  const templates = await dbGetAll('templates');
  if (!templates.length) {
    el.textContent = 'Sin plantillas guardadas todavía';
    return;
  }
  const weekday = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];
  const todayTemplate = templates.find(t => t.weekday === weekday);
  el.textContent = todayTemplate
    ? `${templates.length} plantillas · hoy toca: ${todayTemplate.name}`
    : `${templates.length} plantillas guardadas`;
}
