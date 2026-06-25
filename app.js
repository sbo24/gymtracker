/* ===================================================
   GymTracker Pro — app.js
   =================================================== */
'use strict';

// ===== IndexedDB =====
const DB_NAME = 'GymTrackerDB';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2); // bump version for photos store
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('exercises'))
        d.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('workouts'))
        d.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('weight'))
        d.createObjectStore('weight', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('photos'))
        d.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function dbPut(store, obj) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(obj);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function dbDelete(store, id) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

function dbClear(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).clear();
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ===== NAVIGATION =====
let currentView = 'dashboard';
let viewStack = [];
const tabViews = ['dashboard', 'workouts', 'history', 'stats', 'settings'];

function navigateTo(view, push = true) {
  if (push && currentView !== view) viewStack.push(currentView);
  currentView = view;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view' + cap(view));
  if (el) el.classList.add('active');

  document.querySelectorAll('.tab-item').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === view)
  );

  updateHeader(view);

  const fabViews = ['workouts', 'exercises', 'weight'];
  document.getElementById('fabBtn').classList.toggle('hidden', !fabViews.includes(view));

  document.getElementById('mainContent').scrollTo({ top: 0 });
  renderView(view);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function goBack() {
  if (viewStack.length > 0) navigateTo(viewStack.pop(), false);
}

const headerTitles = {
  dashboard: 'GymTracker', workouts: 'Entrenamientos', workoutEdit: 'Nuevo entreno',
  exercises: 'Ejercicios', exerciseEdit: 'Ejercicio',
  history: 'Historial', stats: 'Estadísticas', weight: 'Peso corporal',
  records: 'Récords', goals: 'Objetivos', settings: 'Ajustes',
  photos: 'Fotos de progreso'
};

function updateHeader(view) {
  document.getElementById('headerTitle').textContent = headerTitles[view] || 'GymTracker';
  const isSub = !tabViews.includes(view);
  const leftBtn = document.getElementById('headerLeft');
  leftBtn.style.visibility = isSub ? 'visible' : 'hidden';
  document.getElementById('headerLeftText').textContent = isSub ? 'Atrás' : '';

  const rightBtn = document.getElementById('headerRight');
  const rightContent = document.getElementById('headerRightContent');

  if (view === 'exercises') {
    rightBtn.style.visibility = 'visible';
    rightContent.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  } else if (view === 'exerciseEdit' && document.getElementById('editExerciseId').value) {
    rightBtn.style.visibility = 'visible';
    rightContent.innerHTML = '<span style="color:var(--red);font-size:15px;font-weight:600">Eliminar</span>';
  } else {
    rightBtn.style.visibility = 'hidden';
    rightContent.innerHTML = '';
  }
}

function handleHeaderLeft() { goBack(); }
function handleHeaderRight() {
  if (currentView === 'exercises') openExerciseEdit(null);
  else if (currentView === 'exerciseEdit') deleteExerciseCurrent();
}

function handleFab() {
  if (currentView === 'workouts') openWorkoutEdit(null);
  else if (currentView === 'exercises') openExerciseEdit(null);
  else if (currentView === 'weight') document.getElementById('weightValue').focus();
}

// ===== PHOTOS =====
// Photos stored in IndexedDB as base64 blobs — no cloud needed
const PHOTO_STORE = 'photos';
let currentPhotoId = null;

async function renderPhotos() {
  const photos = await dbGetAll('photos');
  photos.sort((a, b) => b.date.localeCompare(a.date));
  const grid = document.getElementById('photoGrid');

  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
      <div class="empty-state-text">Sin fotos</div>
      <div class="empty-state-sub">Añade tu primera foto de progreso</div>
    </div>`;
    return;
  }

  // Group by month
  const groups = {};
  photos.forEach(p => {
    const month = p.date.slice(0, 7);
    if (!groups[month]) groups[month] = [];
    groups[month].push(p);
  });

  grid.innerHTML = Object.entries(groups).map(([month, ps]) => {
    const label = new Date(month + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const imgs = ps.map(p => {
      const src = p.data || p.photo_url || '';
      return `
      <div class="photo-thumb" onclick="openPhotoViewer(${p.id})">
        <img src="${src}" alt="${p.date}" loading="lazy" />
        <div class="photo-thumb-date">${p.date.slice(8)}</div>
      </div>`;
    }).join('');
    return `<div class="photo-month-label">${label}</div><div class="photo-row">${imgs}</div>`;
  }).join('');
}

async function addPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const today = new Date().toISOString().split('T')[0];
    const photoObj = { date: today, data: e.target.result, note: '' };
    const localId = await dbPut('photos', photoObj);
    showToast('✓ Foto añadida');
    renderPhotos();
    // Subir a Supabase en segundo plano
    if (typeof syncNow === 'function') syncNow('push');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function openPhotoViewer(id) {
  const all = await dbGetAll('photos');
  const photo = all.find(p => p.id === id);
  if (!photo) return;
  currentPhotoId = id;
  const src = photo.data || photo.photo_url || '';
  document.getElementById('photoViewerImg').src = src;
  document.getElementById('photoViewerDate').textContent = formatDate(photo.date);
  document.getElementById('photoViewerNote').textContent = photo.note || '';
  const viewer = document.getElementById('photoViewer');
  viewer.style.display = 'flex';
  document.getElementById('app').style.overflow = 'hidden';
}

function closePhotoViewer() {
  document.getElementById('photoViewer').style.display = 'none';
  document.getElementById('app').style.overflow = '';
  currentPhotoId = null;
}

async function deleteCurrentPhoto() {
  if (!currentPhotoId) return;
  await dbDelete('photos', currentPhotoId);
  closePhotoViewer();
  showToast('Foto eliminada');
  syncNow('push');
  renderPhotos();
}

async function renderView(view) {
  switch (view) {
    case 'dashboard':  await renderDashboard(); break;
    case 'workouts':   await renderWorkoutList(); break;
    case 'exercises':  await renderExerciseList(); break;
    case 'history':    await renderHistory(); break;
    case 'stats':      await renderStats(); break;
    case 'weight':     await renderWeight(); break;
    case 'records':    await renderRecords(); break;
    case 'goals':      await renderGoals(); break;
    case 'photos':     await renderPhotos(); break;
  }
}

// ===== DASHBOARD =====
async function renderDashboard() {
  const [weights, workouts, exercises] = await Promise.all([
    dbGetAll('weight'), dbGetAll('workouts'), dbGetAll('exercises')
  ]);
  weights.sort((a, b) => a.date.localeCompare(b.date));

  const latest = weights[weights.length - 1];
  const weightEl = document.getElementById('dashWeight');
  const deltaEl = document.getElementById('dashWeightDelta');

  if (latest) {
    weightEl.textContent = latest.weight;
    const weekAgo = new Date(latest.date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const prev = weights.filter(w => w.date <= weekAgo.toISOString().split('T')[0]).pop();
    if (prev) {
      const d = (latest.weight - prev.weight).toFixed(1);
      deltaEl.textContent = (d > 0 ? '▲ +' : '▼ ') + d + ' kg esta semana';
      deltaEl.style.display = 'inline-flex';
    }
  } else {
    weightEl.textContent = '—';
    deltaEl.style.display = 'none';
  }

  document.getElementById('dashWorkouts').textContent = workouts.length;
  document.getElementById('dashExercises').textContent = exercises.length;
  document.getElementById('dashRecords').textContent = Object.keys(computeRecords(workouts)).length;

  const wData = weights.slice(-14).map(w => ({ label: w.date.slice(5), value: w.weight }));
  drawLineChart('chartWeightDash', wData, '#0a84ff');
  drawBarChart('chartVolumeDash', weeklyVolume(workouts).slice(-8), '#5e5ce6');

  renderDashGoals(weights, workouts, exercises);
  renderCalendar(workouts);
}

function renderDashGoals(weights, workouts, exercises) {
  const goalsEl = document.getElementById('dashGoals');
  const goals = JSON.parse(localStorage.getItem('goals') || '{}');
  let html = '';

  if (goals.weight && weights.length) {
    const cur = weights[weights.length - 1].weight;
    const start = weights[0].weight;
    const target = parseFloat(goals.weight);
    const total = Math.abs(start - target) || 1;
    const done = Math.abs(start - cur);
    const pct = Math.min(100, Math.round(done / total * 100));
    html += goalBar('Objetivo de peso', `${cur} kg → ${target} kg`, pct);
  }

  if (goals.strengthExercise && goals.strengthWeight) {
    const ex = exercises.find(e => e.id === parseInt(goals.strengthExercise));
    if (ex) {
      const maxKg = maxWeightForExercise(workouts, ex.id);
      const target = parseFloat(goals.strengthWeight);
      const pct = Math.min(100, Math.round(maxKg / target * 100));
      html += goalBar(`Fuerza: ${ex.name}`, `${maxKg} kg → ${target} kg`, pct);
    }
  }

  goalsEl.innerHTML = html || `<div class="empty-state">
    <span class="empty-state-icon">🎯</span>
    <div class="empty-state-text">Sin objetivos</div>
    <div class="empty-state-sub">Define tus metas en Ajustes → Objetivos</div>
  </div>`;
}

function goalBar(label, detail, pct) {
  return `<div class="goal-item">
    <div class="goal-header"><span class="goal-label">${label}</span><span class="goal-pct">${pct}%</span></div>
    <div class="goal-detail">${detail}</div>
    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
}

function renderCalendar(workouts) {
  const now = new Date();
  const trained = new Set(workouts.map(w => w.date));
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().split('T')[0];
  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  let html = `<div class="calendar-month-label">${cap(monthName)}</div><div class="calendar-grid">`;
  ['D','L','M','X','J','V','S'].forEach(d => { html += `<div class="cal-day-name">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-day', trained.has(ds) ? 'trained' : 'has-data', ds === todayStr ? 'today' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}">${d}</div>`;
  }
  html += '</div>';
  document.getElementById('dashCalendar').innerHTML = html;
}

// ===== MUSCLE HELPERS =====
const MUSCLE_CLASS = {
  'Pecho': 'pecho', 'Espalda': 'espalda', 'Hombros': 'hombros',
  'Bíceps': 'biceps', 'Tríceps': 'triceps', 'Antebrazo': 'antebrazo',
  'Piernas': 'piernas', 'Glúteos': 'gluteos', 'Core / Abdomen': 'core',
  'Cardio': 'cardio', 'Otro': 'otro'
};
const MUSCLE_EMOJI = {
  'Pecho': '🫀', 'Espalda': '🔵', 'Hombros': '💜', 'Bíceps': '💪',
  'Tríceps': '💪', 'Antebrazo': '🤜', 'Piernas': '🦵', 'Glúteos': '🟠',
  'Core / Abdomen': '⚡', 'Cardio': '🏃', 'Otro': '⚙️'
};

function muscleClass(m) { return MUSCLE_CLASS[m] || 'otro'; }
function muscleEmoji(m) { return MUSCLE_EMOJI[m] || '🏋️'; }

// ===== EXERCISES =====
let exFilter = '';

function setExFilter(muscle, btn) {
  exFilter = muscle;
  document.querySelectorAll('#exerciseMuscleFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderExerciseList();
}

async function renderExerciseList() {
  const exercises = await dbGetAll('exercises');
  const q = (document.getElementById('exerciseSearch')?.value || '').toLowerCase().trim();
  const list = document.getElementById('exerciseList');

  let filtered = exercises;
  if (exFilter) filtered = filtered.filter(e => e.muscle === exFilter);
  if (q) filtered = filtered.filter(e =>
    e.name.toLowerCase().includes(q) || (e.muscle || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q)
  );

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
  const order = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Antebrazo','Piernas','Glúteos','Core / Abdomen','Cardio','Otro'];
  const sortedGroups = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));

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
  document.getElementById('exerciseName').value = '';
  document.getElementById('exerciseMuscle').value = '';
  document.getElementById('exerciseNotes').value = '';
  document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('selected'));

  const delBtn = document.getElementById('deleteExerciseBtn');
  delBtn.style.display = 'none';

  if (id) {
    const all = await dbGetAll('exercises');
    const ex = all.find(e => e.id === id);
    if (ex) {
      document.getElementById('exerciseName').value = ex.name;
      document.getElementById('exerciseMuscle').value = ex.muscle || '';
      document.getElementById('exerciseNotes').value = ex.notes || '';
      // Select the chip
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
    notes: document.getElementById('exerciseNotes').value.trim()
  };
  if (idVal) obj.id = parseInt(idVal);
  await dbPut('exercises', obj);
  showToast(idVal ? '✓ Ejercicio actualizado' : '✓ Ejercicio creado');
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
  syncNow('push');
  goBack();
}

// ===== WORKOUTS =====
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
    return;
  }

  list.innerHTML = workouts.map(w => {
    const vol = w.series.reduce((s, r) => s + r.weight * r.reps, 0);
    const totalSets = w.series.length;

    // Group series by exercise, preserving order
    const exOrder = [];
    const grouped = {};
    w.series.forEach(s => {
      const ex = exercises.find(e => e.id === s.exerciseId);
      const key = s.exerciseId;
      if (!grouped[key]) {
        grouped[key] = { ex, sets: [] };
        exOrder.push(key);
      }
      grouped[key].sets.push(s);
    });

    // Build muscle tags (unique muscles)
    const muscles = [...new Set(exOrder.map(k => grouped[k].ex?.muscle).filter(Boolean))];
    const muscleTags = muscles.map(m => {
      const mc = muscleClass(m);
      return `<span class="wl-muscle-tag mc-${mc}-bg" style="color:var(--text2)">${muscleEmoji(m)} ${m}</span>`;
    }).join('');

    // Build exercise rows
    const exRows = exOrder.map(key => {
      const { ex, sets } = grouped[key];
      const name = ex ? ex.name : 'Ejercicio eliminado';
      const mc = ex ? muscleClass(ex.muscle) : 'otro';
      const maxKg = Math.max(...sets.map(s => s.weight));
      const setsStr = sets.map((s, i) =>
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
      ${(w.photo || w.photo_url) ? `<img class="wl-photo-thumb" src="${w.photo || w.photo_url}" alt="Foto del entrenamiento" onclick="event.stopPropagation();openWorkoutPhotoViewer('${w.id}')" style="margin-top:10px;width:100%;height:140px;object-fit:cover;border-radius:10px;display:block;" />` : ''}
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
  const all = await dbGetAll('workouts');
  const original = all.find(w => w.id === id);
  if (!original) return;
  const today = new Date().toISOString().split('T')[0];
  // Open workout edit pre-filled with today's date and original's series
  blockCount = 0;
  document.getElementById('editWorkoutId').value = '';
  document.getElementById('workoutDate').value = today;
  document.getElementById('workoutNotes').value = original.notes || '';
  document.getElementById('exerciseBlocksContainer').innerHTML = '';
  // Group series by exercise preserving order
  const grouped = {};
  const order = [];
  original.series.forEach(s => {
    if (!grouped[s.exerciseId]) { grouped[s.exerciseId] = []; order.push(s.exerciseId); }
    grouped[s.exerciseId].push(s);
  });
  for (const exId of order) {
    await addExerciseBlock(exId, grouped[exId]);
  }
  navigateTo('workoutEdit');
  showToast('Entrenamiento copiado — revisa y guarda');
}

let blockCount = 0;
let seriesLineCount = 0;

function handleWorkoutPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    document.getElementById('workoutPhotoData').value = data;
    const preview = document.getElementById('workoutPhotoPreview');
    preview.style.backgroundImage = `url(${data})`;
    preview.style.backgroundSize = 'cover';
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
  preview.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span id="workoutPhotoLabel">Añadir foto</span>`;
}


async function openWorkoutEdit(id) {
  blockCount = 0;
  document.getElementById('editWorkoutId').value = id || '';
  document.getElementById('workoutDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('workoutNotes').value = '';
  document.getElementById('exerciseBlocksContainer').innerHTML = '';
  // Reset photo
  removeWorkoutPhoto();

  if (id) {
    const all = await dbGetAll('workouts');
    const w = all.find(x => x.id === id);
    if (w) {
      document.getElementById('workoutDate').value = w.date;
      document.getElementById('workoutNotes').value = w.notes || '';
      // Load photo if present
      if (w.photo || w.photo_url) {
        const photoSrc = w.photo || w.photo_url;
        document.getElementById('workoutPhotoData').value = photoSrc;
        const preview = document.getElementById('workoutPhotoPreview');
        preview.style.backgroundImage = `url(${photoSrc})`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.style.minHeight = '160px';
        preview.innerHTML = `<div class="workout-photo-remove" onclick="event.stopPropagation();removeWorkoutPhoto()">✕ Quitar foto</div>`;
      }
      // Group series by exercise
      const grouped = {};
      w.series.forEach(s => {
        if (!grouped[s.exerciseId]) grouped[s.exerciseId] = [];
        grouped[s.exerciseId].push(s);
      });
      for (const [exId, sets] of Object.entries(grouped)) {
        await addExerciseBlock(parseInt(exId), sets);
      }
    }
  } else {
    await addExerciseBlock();
  }
  navigateTo('workoutEdit');
}

async function addExerciseBlock(selectedExId = null, existingSets = []) {
  const exercises = await dbGetAll('exercises');
  blockCount++;
  const bid = blockCount;
  const cont = document.getElementById('exerciseBlocksContainer');

  // Find selected exercise name for display
  const selEx = exercises.find(e => e.id === selectedExId);
  const selName = selEx ? selEx.name : '';
  const selMc = selEx ? muscleClass(selEx.muscle) : 'otro';
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

  if (existingSets.length) {
    existingSets.forEach(s => addSeriesLine(bid, s));
  } else {
    addSeriesLine(bid);
  }
}

// ===== EXERCISE PICKER MODAL =====
let _pickerBid = null;

async function openExercisePicker(bid) {
  _pickerBid = bid;
  const exercises = await dbGetAll('exercises');

  // Group by muscle
  const order = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Antebrazo','Piernas','Glúteos','Core / Abdomen','Cardio','Otro'];
  const groups = {};
  exercises.forEach(e => {
    const m = e.muscle || 'Otro';
    if (!groups[m]) groups[m] = [];
    groups[m].push(e);
  });

  let html = '';
  order.forEach(m => {
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

  document.getElementById('exercisePickerList').innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--text3)">No hay ejercicios. Crea uno primero.</div>';
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
    const next = label.nextElementSibling;
    // Show group if any item visible
    let anyVisible = false;
    let el = label.nextElementSibling;
    while (el && el.classList.contains('picker-item')) {
      if (el.style.display !== 'none') anyVisible = true;
      el = el.nextElementSibling;
    }
    label.style.display = anyVisible ? '' : 'none';
  });
}

function selectExerciseForBlock(bid, exId) {
  // Update hidden input
  document.getElementById(`blockEx-${bid}`).value = exId;
  // Update header display — need to get exercise data from DOM (already rendered)
  const item = document.querySelector(`.picker-item[onclick*="selectExerciseForBlock(${bid}, ${exId})"]`);
  const name = item ? item.querySelector('.picker-item-name').textContent : '';
  document.getElementById(`wexName-${bid}`).textContent = name;

  // Find muscle for icon - look at the group label above the item
  dbGetAll('exercises').then(exercises => {
    const ex = exercises.find(e => e.id === exId);
    if (ex) {
      const mc = muscleClass(ex.muscle);
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

function addSeriesLine(bid, data = {}) {
  seriesLineCount++;
  const lid = seriesLineCount;
  const cont = document.getElementById(`blockSeries-${bid}`);
  const idx = cont.querySelectorAll('.wex-series-row').length + 1;

  const row = document.createElement('div');
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
    // Renumber
    cont.querySelectorAll('.wex-series-num').forEach((el, i) => { el.textContent = i + 1; });
  }
}

function removeBlock(bid) {
  const block = document.getElementById(`block-${bid}`);
  if (block) block.remove();
}

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
      const reps = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
      if (reps > 0) series.push({ exerciseId: exId, weight, reps });
    });
  });

  if (!series.length) { showToast('Añade al menos una serie con reps'); return; }

  const idVal = document.getElementById('editWorkoutId').value;
  const photoData = document.getElementById('workoutPhotoData').value;
  const obj = { date, notes: document.getElementById('workoutNotes').value.trim(), series };
  if (photoData) obj.photo = photoData;
  if (idVal) obj.id = parseInt(idVal);
  await dbPut('workouts', obj);
  showToast('✓ Entrenamiento guardado');
  syncNow('push');
  goBack();
}

// ===== HISTORY =====
let historyFilter = 'all';

function setHistoryFilter(f, btn) {
  historyFilter = f;
  document.querySelectorAll('#historyFilters .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

async function renderHistory() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const q = (document.getElementById('historySearch')?.value || '').toLowerCase().trim();
  const now = new Date();

  let filtered = workouts.filter(w => {
    if (historyFilter === 'week') return (now - new Date(w.date + 'T00:00:00')) / 86400000 <= 7;
    if (historyFilter === 'month') return w.date.slice(0, 7) === now.toISOString().slice(0, 7);
    return true;
  });

  if (q) {
    filtered = filtered.filter(w =>
      w.date.includes(q) || (w.notes || '').toLowerCase().includes(q) ||
      w.series.some(s => { const ex = exercises.find(e => e.id === s.exerciseId); return ex && ex.name.toLowerCase().includes(q); })
    );
  }

  filtered.sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('historyList');

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4" stroke-linecap="round"/></svg></div><div class="empty-state-text">Sin resultados</div></div>`;
    return;
  }

  list.innerHTML = filtered.map(w => {
    const grouped = {};
    w.series.forEach(s => {
      const ex = exercises.find(e => e.id === s.exerciseId);
      const name = ex ? ex.name : '?';
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    });
    const vol = w.series.reduce((s, r) => s + r.weight * r.reps, 0);
    const detail = Object.entries(grouped).map(([name, sets]) =>
      `<div style="margin-top:6px">
        <span style="font-weight:600;font-size:14px;color:var(--text)">${name}</span>
        <span style="font-size:12px;color:var(--text3);margin-left:8px">${sets.map((s,i) => `S${i+1}: ${s.weight}×${s.reps}`).join('  ')}</span>
      </div>`
    ).join('');

    return `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:0;cursor:pointer" onclick="openWorkoutEdit(${w.id})">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:15px;letter-spacing:-0.3px">${formatDate(w.date)}</span>
        <span style="font-size:12px;color:var(--text3);font-weight:500">${Math.round(vol).toLocaleString()} kg vol.</span>
      </div>
      ${detail}
      ${w.notes ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;font-style:italic">"${w.notes}"</div>` : ''}
    </div>`;
  }).join('');
}

// ===== WEIGHT =====
async function renderWeight() {
  document.getElementById('weightDate').value = new Date().toISOString().split('T')[0];
  const weights = await dbGetAll('weight');
  weights.sort((a, b) => b.date.localeCompare(a.date));

  const chartData = [...weights].reverse().slice(-20).map(w => ({ label: w.date.slice(5), value: w.weight }));
  drawLineChart('chartWeight', chartData, '#34c759');

  const list = document.getElementById('weightList');
  if (!weights.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a1 1 0 0 1 1 1v1h5l1 4H5l1-4h5V4a1 1 0 0 1 1-1z"/><path d="M5 9l2 12h10L19 9"/><path d="M8 13h8"/></svg></div><div class="empty-state-text">Sin registros</div><div class="empty-state-sub">Añade tu peso arriba</div></div>`;
    return;
  }
  list.innerHTML = weights.map(w => `
    <div class="weight-entry">
      <div>
        <div class="weight-entry-value">${w.weight} <span style="font-size:14px;font-weight:500;color:var(--text3)">kg</span></div>
        <div class="weight-entry-date">${formatDate(w.date)}</div>
        ${w.fat ? `<div class="weight-entry-fat">${w.fat}% grasa</div>` : ''}
        ${w.notes ? `<div class="weight-entry-fat">${w.notes}</div>` : ''}
      </div>
      <button class="weight-entry-del" onclick="deleteWeight(${w.id})">×</button>
    </div>`).join('');
}

async function saveWeight() {
  const date = document.getElementById('weightDate').value;
  const weight = parseFloat(document.getElementById('weightValue').value);
  if (!date || isNaN(weight) || weight <= 0) { showToast('Introduce peso válido'); return; }
  await dbPut('weight', {
    date, weight,
    fat: parseFloat(document.getElementById('weightFat').value) || null,
    notes: document.getElementById('weightNotes').value.trim()
  });
  document.getElementById('weightValue').value = '';
  document.getElementById('weightFat').value = '';
  document.getElementById('weightNotes').value = '';
  showToast('✓ Peso registrado');
  syncNow('push');
  renderWeight();
}

async function deleteWeight(id) {
  await dbDelete('weight', id);
  showToast('Registro eliminado');
  syncNow('push');
  renderWeight();
}

// ===== RECORDS =====
function computeRecords(workouts) {
  const r = {};
  workouts.forEach(w => w.series.forEach(s => {
    if (!r[s.exerciseId]) r[s.exerciseId] = { maxWeight: 0, maxReps: 0, maxVolume: 0 };
    if (s.weight > r[s.exerciseId].maxWeight) r[s.exerciseId].maxWeight = s.weight;
    if (s.reps > r[s.exerciseId].maxReps) r[s.exerciseId].maxReps = s.reps;
    const v = s.weight * s.reps;
    if (v > r[s.exerciseId].maxVolume) r[s.exerciseId].maxVolume = v;
  }));
  return r;
}

function maxWeightForExercise(workouts, exId) {
  let max = 0;
  workouts.forEach(w => w.series.forEach(s => { if (s.exerciseId === exId && s.weight > max) max = s.weight; }));
  return max;
}

async function renderRecords() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const records = computeRecords(workouts);
  const list = document.getElementById('recordsList');

  if (!Object.keys(records).length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg></div><div class="empty-state-text">Sin récords</div><div class="empty-state-sub">Empieza a entrenar para ver tus récords</div></div>`;
    return;
  }

  const sorted = Object.entries(records).sort((a, b) => b[1].maxWeight - a[1].maxWeight);
  list.innerHTML = sorted.map(([exId, r]) => {
    const ex = exercises.find(e => e.id === parseInt(exId));
    if (!ex) return '';
    const mc = muscleClass(ex.muscle);
    return `<div class="record-card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div class="ex-item-color mc-${mc}" style="width:3px;height:18px;border-radius:2px;flex-shrink:0"></div>
        <div class="record-exercise">${ex.name}</div>
        <span style="font-size:12px;color:var(--text3);font-weight:500">${ex.muscle || ''}</span>
      </div>
      <div class="record-detail">
        <div class="record-stat">
          <div class="record-stat-value">${r.maxWeight} kg</div>
          <div class="record-stat-label">Peso máx</div>
        </div>
        <div class="record-stat">
          <div class="record-stat-value">${r.maxReps}</div>
          <div class="record-stat-label">Reps máx</div>
        </div>
        <div class="record-stat">
          <div class="record-stat-value">${Math.round(r.maxVolume)}</div>
          <div class="record-stat-label">Vol máx</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== GOALS =====
async function renderGoals() {
  const exercises = await dbGetAll('exercises');
  const sel = document.getElementById('goalExercise');
  sel.innerHTML = '<option value="">— Seleccionar —</option>' +
    exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  const goals = JSON.parse(localStorage.getItem('goals') || '{}');
  if (goals.weight) document.getElementById('goalWeight').value = goals.weight;
  if (goals.strengthExercise) document.getElementById('goalExercise').value = goals.strengthExercise;
  if (goals.strengthWeight) document.getElementById('goalStrengthWeight').value = goals.strengthWeight;

  const [weights, workouts] = await Promise.all([dbGetAll('weight'), dbGetAll('workouts')]);
  weights.sort((a, b) => a.date.localeCompare(b.date));
  let html = '';

  if (goals.weight && weights.length) {
    const cur = weights[weights.length - 1].weight;
    const start = weights[0].weight;
    const target = parseFloat(goals.weight);
    const pct = Math.min(100, Math.max(0, Math.round(Math.abs(start - cur) / (Math.abs(start - target) || 1) * 100)));
    html += goalBar('Objetivo de peso', `Actual: ${cur} kg → Meta: ${target} kg`, pct);
  }

  if (goals.strengthExercise && goals.strengthWeight) {
    const ex = exercises.find(e => e.id === parseInt(goals.strengthExercise));
    if (ex) {
      const maxKg = maxWeightForExercise(workouts, ex.id);
      const target = parseFloat(goals.strengthWeight);
      const pct = Math.min(100, Math.round(maxKg / target * 100));
      html += goalBar(`Fuerza: ${ex.name}`, `Actual: ${maxKg} kg → Meta: ${target} kg`, pct);
    }
  }

  document.getElementById('goalsList').innerHTML = html ||
    '<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div class="empty-state-text">Define objetivos arriba</div></div>';
}

function saveGoals() {
  localStorage.setItem('goals', JSON.stringify({
    weight: document.getElementById('goalWeight').value,
    strengthExercise: document.getElementById('goalExercise').value,
    strengthWeight: document.getElementById('goalStrengthWeight').value
  }));
  showToast('✓ Objetivos guardados');
  renderGoals();
}

// ===== STATS =====
let currentStatsTab = 'general';
let statsRangeDays = 30; // default 30 days

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
  renderStats(); // re-render with current range
}

async function renderStats() {
  const [allWorkouts, exercises, allWeights] = await Promise.all([
    dbGetAll('workouts'), dbGetAll('exercises'), dbGetAll('weight')
  ]);

  const workouts = filterByRange(allWorkouts);
  const weights  = filterWeightByRange(allWeights);

  renderStatsSummary(workouts, weights);
  renderStatsTab(currentStatsTab, workouts, exercises, weights);

  // Populate exercise picker
  const picker = document.getElementById('statsExercisePicker');
  const cur = picker.value;
  picker.innerHTML = '<option value="">— Selecciona un ejercicio —</option>' +
    exercises.map(e => `<option value="${e.id}" ${e.id == cur ? 'selected':''}>${e.name}</option>`).join('');
}

async function renderStatsTab(tab, workouts, exercises, weights) {
  if (!workouts) {
    const [aw, ex, wt] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises'), dbGetAll('weight')]);
    workouts  = filterByRange(aw);
    exercises = ex;
    weights   = filterWeightByRange(wt);
  }
  if (tab === 'general')  renderStatsGeneral(workouts, weights);
  else if (tab === 'exercise') renderStatsExercise(workouts, exercises);
  else if (tab === 'muscles')  renderStatsMuscles(workouts, exercises);
}

function renderStatsSummary(workouts, weights) {
  // Total volume
  const totalVol = workouts.reduce((s, w) => s + w.series.reduce((a, r) => a + r.weight * r.reps, 0), 0);
  // Current streak (consecutive days with workout)
  const trainedDates = new Set(workouts.map(w => w.date));
  let streak = 0, d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (trainedDates.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0) { d.setDate(d.getDate() - 1); if ((new Date() - d) > 2 * 86400000) break; }
    else break;
  }
  // Avg workouts/week
  const wVol = weeklyVolume(workouts);
  const avgPerWeek = wVol.length ? (workouts.length / wVol.length).toFixed(1) : '0';
  // Total sets
  const totalSets = workouts.reduce((s, w) => s + w.series.length, 0);

  document.getElementById('statsSummaryGrid').innerHTML = `
    <div class="stat-summary-card" style="background:linear-gradient(135deg,#0a84ff,#5e5ce6)">
      <div class="stat-summary-val">${formatBigNum(Math.round(totalVol))}</div>
      <div class="stat-summary-label">kg totales<br>levantados</div>
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

function formatBigNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(0) + 'k';
  return n.toString();
}

function renderStatsGeneral(workouts, weights) {
  const wpw = workoutsPerWeek(workouts);
  const avgPW = wpw.length ? (wpw.reduce((s,d) => s+d.value,0) / wpw.length).toFixed(1) : '0';
  document.getElementById('statsAvgPerWeek').textContent = `Media: ${avgPW} entrenos/semana`;

  const wVol = weeklyVolume(workouts);
  const bestWeek = wVol.length ? wVol.reduce((a,b) => b.value > a.value ? b : a) : null;
  if (bestWeek) document.getElementById('statsBestWeek').textContent = `Mejor semana: ${bestWeek.label} — ${bestWeek.value.toLocaleString()} kg`;

  drawBarChart('chartWorkoutsPerWeek', wpw.slice(-16), '#0a84ff');
  drawBarChart('chartWeeklyVolume', wVol.slice(-16), '#5e5ce6');
  drawBarChart('chartMonthlyVolume', monthlyVolume(workouts).slice(-8), '#ff9f0a');

  // Weight chart in stats
  if (weights) {
    weights.sort((a,b) => a.date.localeCompare(b.date));
    drawLineChart('chartWeightStats', weights.slice(-20).map(w => ({ label: w.date.slice(5), value: w.weight })), '#34c759');
  }
}

async function renderStatsExercise(workouts, exercises) {
  if (!workouts) {
    const [aw, ex] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
    workouts  = filterByRange(aw);
    exercises = ex;
  }
  const picker = document.getElementById('statsExercisePicker');
  const cur = picker.value;
  if (!cur) { clearCanvas('chartExercise'); clearCanvas('chartOneRM'); clearCanvas('chartExVolume'); document.getElementById('statsExerciseSummary').innerHTML = ''; return; }
  const exId = parseInt(cur);
  const ex = exercises.find(e => e.id === exId);

  const sessions = workouts
    .filter(w => w.series.some(s => s.exerciseId === exId))
    .sort((a,b) => a.date.localeCompare(b.date));

  // Max weight per session
  const maxData = sessions.map(w => {
    const sets = w.series.filter(s => s.exerciseId === exId);
    return { label: w.date.slice(5), value: Math.max(...sets.map(s => s.weight)) };
  });

  // 1RM Epley: weight * (1 + reps/30)
  const ormData = sessions.map(w => {
    const sets = w.series.filter(s => s.exerciseId === exId);
    const best = sets.reduce((best, s) => {
      const orm = s.weight * (1 + s.reps / 30);
      return orm > best ? orm : best;
    }, 0);
    return { label: w.date.slice(5), value: Math.round(best * 10) / 10 };
  });

  // Volume per session
  const volData = sessions.map(w => {
    const sets = w.series.filter(s => s.exerciseId === exId);
    return { label: w.date.slice(5), value: Math.round(sets.reduce((s,r) => s + r.weight*r.reps, 0)) };
  });

  // Summary card
  const allSets = sessions.flatMap(w => w.series.filter(s => s.exerciseId === exId));
  const maxKg = allSets.length ? Math.max(...allSets.map(s => s.weight)) : 0;
  const maxOrm = ormData.length ? Math.max(...ormData.map(d => d.value)) : 0;
  const totalVol = allSets.reduce((s,r) => s + r.weight*r.reps, 0);
  const mc = ex ? muscleClass(ex.muscle) : 'otro';

  document.getElementById('statsExerciseSummary').innerHTML = `
    <div class="ex-stat-summary">
      <div class="ex-stat-item">
        <div class="ex-stat-val">${maxKg} kg</div>
        <div class="ex-stat-lbl">Peso máx</div>
      </div>
      <div class="ex-stat-item">
        <div class="ex-stat-val">${maxOrm} kg</div>
        <div class="ex-stat-lbl">1RM est.</div>
      </div>
      <div class="ex-stat-item">
        <div class="ex-stat-val">${sessions.length}</div>
        <div class="ex-stat-lbl">Sesiones</div>
      </div>
      <div class="ex-stat-item">
        <div class="ex-stat-val">${formatBigNum(Math.round(totalVol))}</div>
        <div class="ex-stat-lbl">Vol. total</div>
      </div>
    </div>`;

  drawLineChart('chartExercise', maxData, '#0a84ff');
  drawLineChart('chartOneRM', ormData, '#5e5ce6');
  drawBarChart('chartExVolume', volData, '#ff9f0a');
}

function renderStatsMuscles(workouts, exercises) {
  const volByMuscle = {}, setsByMuscle = {};
  workouts.forEach(w => {
    w.series.forEach(s => {
      const ex = exercises.find(e => e.id === s.exerciseId);
      const m = ex?.muscle || 'Otro';
      volByMuscle[m] = (volByMuscle[m] || 0) + s.weight * s.reps;
      setsByMuscle[m] = (setsByMuscle[m] || 0) + 1;
    });
  });

  const order = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Antebrazo','Piernas','Glúteos','Core / Abdomen','Cardio','Otro'];
  const sortedVol = Object.entries(volByMuscle).sort((a,b) => b[1]-a[1]);
  const maxVol = sortedVol[0]?.[1] || 1;
  const maxSets = Math.max(...Object.values(setsByMuscle)) || 1;

  document.getElementById('muscleDistribution').innerHTML = sortedVol.map(([m,v]) => {
    const mc = muscleClass(m);
    const pct = Math.round(v/maxVol*100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track">
        <div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div>
      </div>
      <div class="muscle-bar-val">${formatBigNum(Math.round(v))}</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';

  const sortedSets = Object.entries(setsByMuscle).sort((a,b) => b[1]-a[1]);
  document.getElementById('muscleSetCount').innerHTML = sortedSets.map(([m,v]) => {
    const mc = muscleClass(m);
    const pct = Math.round(v/maxSets*100);
    return `<div class="muscle-bar-row">
      <div class="muscle-bar-name"><span class="muscle-dot-sm mc-${mc}"></span>${m}</div>
      <div class="muscle-bar-track">
        <div class="muscle-bar-fill mc-${mc}" style="width:${pct}%"></div>
      </div>
      <div class="muscle-bar-val">${v} sets</div>
    </div>`;
  }).join('') || '<div style="color:var(--text3);text-align:center;padding:16px">Sin datos</div>';
}

function weeklyVolume(workouts) {
  const m = {};
  workouts.forEach(w => {
    const k = getWeekKey(new Date(w.date));
    if (!m[k]) m[k] = 0;
    w.series.forEach(s => { m[k] += s.weight * s.reps; });
  });
  return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ label: k.slice(5), value: Math.round(v) }));
}

function monthlyVolume(workouts) {
  const m = {};
  workouts.forEach(w => {
    const k = w.date.slice(0,7);
    if (!m[k]) m[k] = 0;
    w.series.forEach(s => { m[k] += s.weight * s.reps; });
  });
  return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ label: k.slice(5), value: Math.round(v) }));
}

function workoutsPerWeek(workouts) {
  const m = {};
  workouts.forEach(w => { const k = getWeekKey(new Date(w.date)); m[k] = (m[k]||0)+1; });
  return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ label: k.slice(5), value: v }));
}

function getWeekKey(date) {
  const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

// ===== CHARTS =====
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function chartTheme() {
  return {
    text: isDark() ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    grid: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };
}

function clearCanvas(id) {
  const c = document.getElementById(id); if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function setupCanvas(id) {
  const canvas = document.getElementById(id); if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement?.offsetWidth - 20 || 300;
  const h = canvas.height;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawLineChart(id, data, color) {
  if (!data || data.length < 2) { clearCanvas(id); return; }
  const s = setupCanvas(id); if (!s) return;
  const { ctx, w, h } = s;
  const { text, grid } = chartTheme();
  const pad = { t: 14, r: 14, b: 30, l: 38 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const vals = data.map(d => d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const xStep = cw / (data.length - 1);

  ctx.clearRect(0, 0, w, h);

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch - (i/4)*ch;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((minV + (i/4)*range).toFixed(1), pad.l - 5, y + 3.5);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.l + i*xStep, y = pad.t + ch - ((d.value-minV)/range)*ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.l + (data.length-1)*xStep, pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  data.forEach((d, i) => {
    const x = pad.l + i*xStep, y = pad.t + ch - ((d.value-minV)/range)*ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  data.forEach((d, i) => {
    const x = pad.l + i*xStep, y = pad.t + ch - ((d.value-minV)/range)*ch;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  });

  // X labels
  ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(data.length / 6));
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length-1)
      ctx.fillText(d.label, pad.l + i*xStep, pad.t + ch + 20);
  });
}

function drawBarChart(id, data, color) {
  if (!data || !data.length) { clearCanvas(id); return; }
  const s = setupCanvas(id); if (!s) return;
  const { ctx, w, h } = s;
  const { text, grid } = chartTheme();
  const pad = { t: 14, r: 14, b: 30, l: 38 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.value)) || 1;
  const gap = cw / data.length;
  const barW = gap * 0.6;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch - (i/4)*ch;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+cw, y); ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV*i/4), pad.l-5, y+3.5);
  }

  data.forEach((d, i) => {
    const x = pad.l + i*gap + (gap-barW)/2;
    const barH = Math.max(3, (d.value/maxV)*ch);
    const y = pad.t + ch - barH;
    const grad = ctx.createLinearGradient(0, y, 0, pad.t+ch);
    grad.addColorStop(0, color); grad.addColorStop(1, color+'77');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [5, 5, 2, 2]);
    else ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.fillStyle = text; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW/2, pad.t+ch+20);
  });
}

// ===== ACTION SHEET =====
function showActionSheet(items, title = '') {
  const sheet = document.getElementById('actionSheet');
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('actionSheetContent');
  content.innerHTML = (title ? `<div class="action-sheet-title">${title}</div>` : '') +
    items.map(item => `<div class="action-sheet-item ${item.danger?'danger':''}" onclick="${item.action}; closeActionSheet()">
      <span class="action-sheet-item-icon">${item.icon||''}</span>
      <span>${item.label}</span>
    </div>`).join('');
  sheet.classList.add('active');
  overlay.classList.add('active');
}

function closeActionSheet() {
  document.getElementById('actionSheet').classList.remove('active');
  document.getElementById('modalOverlay').classList.remove('active');
}

function closeModal() { closeActionSheet(); closeExercisePicker(); }

// ===== TOAST =====
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ===== EXPORT / IMPORT =====
async function exportData() {
  const [exercises, workouts, weight] = await Promise.all([dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight')]);
  const data = { version: 1, exportedAt: new Date().toISOString(), exercises, workouts, weight, goals: JSON.parse(localStorage.getItem('goals') || '{}') };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `gymtracker-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('✓ Datos exportados');
}

async function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.exercises || !data.workouts) { showToast('Archivo inválido'); return; }
    await Promise.all([dbClear('exercises'), dbClear('workouts'), dbClear('weight')]);
    for (const x of data.exercises) await dbPut('exercises', x);
    for (const x of data.workouts) await dbPut('workouts', x);
    for (const x of (data.weight||[])) await dbPut('weight', x);
    if (data.goals) localStorage.setItem('goals', JSON.stringify(data.goals));
    showToast('✓ Datos importados');
    navigateTo('dashboard', false);
  } catch { showToast('Error al importar'); }
  event.target.value = '';
}

function confirmClearData() {
  showActionSheet([{ icon: '🗑️', label: 'Borrar TODOS los datos', danger: true, action: 'clearAllData()' }], 'Esta acción no se puede deshacer');
}

async function clearAllData() {
  await Promise.all([dbClear('exercises'), dbClear('workouts'), dbClear('weight')]);
  localStorage.removeItem('goals');
  showToast('Datos borrados');
  await seedDefaultExercises();
  navigateTo('dashboard', false);
}

// ===== UTILS =====
function formatDate(ds) {
  if (!ds) return '';
  return new Date(ds + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

// ===== SEED =====
async function seedDefaultExercises() {
  const existing = await dbGetAll('exercises');
  if (existing.length) return;
  const defaults = [
    // Pecho
    { name: 'Pecho máquina próxima a la prensa', muscle: 'Pecho', notes: '' },
    { name: 'Pecho máquina de la derecha', muscle: 'Pecho', notes: '' },
    { name: 'Aperturas máquina entrada', muscle: 'Pecho', notes: 'Conversión lbs: 150lbs=68kg' },
    { name: 'Pecho máquina entrada press plano', muscle: 'Pecho', notes: '' },
    // Tríceps
    { name: 'Fondos con lastre', muscle: 'Tríceps', notes: '' },
    { name: 'Fondos con polea máquinas expendedoras', muscle: 'Tríceps', notes: '' },
    { name: 'Fondos con polea máquina derecha expendedoras', muscle: 'Tríceps', notes: '' },
    { name: 'Fondos máquina fondo al lado de hombro', muscle: 'Tríceps', notes: '' },
    // Espalda
    { name: 'Jalón al pecho con agarre dentro', muscle: 'Espalda', notes: '' },
    { name: 'Dorsal en polea posición de caballero dentro', muscle: 'Espalda', notes: '' },
    { name: 'Dorsal sentado agarre en V de Samuel', muscle: 'Espalda', notes: '' },
    { name: 'Lumbar en máquina', muscle: 'Espalda', notes: '' },
    // Bíceps
    { name: 'Curl de bíceps martillo', muscle: 'Bíceps', notes: '' },
    { name: 'Curl Bayesti polea', muscle: 'Bíceps', notes: '' },
    { name: 'Curl predicador máquina entrada', muscle: 'Bíceps', notes: '' },
    { name: 'Arm curl máquina entrada', muscle: 'Bíceps', notes: '' },
    // Antebrazo
    { name: 'Curl de muñeca con mancuernas', muscle: 'Antebrazo', notes: '' },
    { name: 'Curl inverso con barra', muscle: 'Antebrazo', notes: '' },
    { name: 'Farmer walk', muscle: 'Antebrazo', notes: '' },
    // Piernas
    { name: 'Prensa en máquina fondo sala', muscle: 'Piernas', notes: '' },
    { name: 'Extensión de cuádriceps máquina entrada', muscle: 'Piernas', notes: 'Conversión lbs: 140lbs=63,5kg' },
    { name: 'Extensión de cuádriceps fondo del pasillo', muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral', muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral sentado fondo pasillo', muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral tumbado entrada', muscle: 'Piernas', notes: '' },
    { name: 'Gemelos máquina sentado izquierda de femoral', muscle: 'Piernas', notes: '' },
    // Hombros
    { name: 'Press militar en máquina', muscle: 'Hombros', notes: '' },
    { name: 'Elevaciones laterales máquina fondo entrada', muscle: 'Hombros', notes: '' },
    { name: 'Hombro posterior', muscle: 'Hombros', notes: '' },
  ];
  for (const ex of defaults) await dbPut('exercises', ex);
}

// ===== SERVICE WORKER =====
function registerSW() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// ===== INIT =====
// Called by sync.js after successful auth
async function bootApp() {
  await seedDefaultExercises();
  navigateTo('dashboard', false);
}

function confirmLogout() {
  showActionSheet([
    { icon: '', label: 'Cerrar sesión', danger: true, action: 'handleLogout()' }
  ], '¿Cerrar sesión?');
}

document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  registerSW();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderView(currentView));
  await initAuth(); // Auth decides whether to show login or app
});
