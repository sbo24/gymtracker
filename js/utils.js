/* ===================================================
   utils.js — Shared utility functions
   =================================================== */
'use strict';

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function formatDate(ds) {
  if (!ds) return '';
  return new Date(ds + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatBigNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return n.toString();
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ===== ACTION SHEET =====
function showActionSheet(items, title = '') {
  const sheet   = document.getElementById('actionSheet');
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('actionSheetContent');
  content.innerHTML = (title ? `<div class="action-sheet-title">${title}</div>` : '') +
    items.map(item => `
      <div class="action-sheet-item ${item.danger ? 'danger' : ''}" onclick="${item.action}; closeActionSheet()">
        <span class="action-sheet-item-icon">${item.icon || ''}</span>
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

// ===== SEED DEFAULT EXERCISES =====
async function seedDefaultExercises() {
  const existing = await dbGetAll('exercises');
  if (existing.length) return;
  const defaults = [
    // Pecho
    { name: 'Pecho máquina próxima a la prensa',   muscle: 'Pecho',     notes: '' },
    { name: 'Pecho máquina de la derecha',          muscle: 'Pecho',     notes: '' },
    { name: 'Aperturas máquina entrada',            muscle: 'Pecho',     notes: 'Conversión lbs: 150lbs=68kg' },
    { name: 'Pecho máquina entrada press plano',    muscle: 'Pecho',     notes: '' },
    // Tríceps
    { name: 'Fondos con lastre',                                muscle: 'Tríceps',  notes: '' },
    { name: 'Fondos con polea máquinas expendedoras',          muscle: 'Tríceps',  notes: '' },
    { name: 'Fondos con polea máquina derecha expendedoras',   muscle: 'Tríceps',  notes: '' },
    { name: 'Fondos máquina fondo al lado de hombro',          muscle: 'Tríceps',  notes: '' },
    // Espalda
    { name: 'Jalón al pecho con agarre dentro',               muscle: 'Espalda',  notes: '' },
    { name: 'Dorsal en polea posición de caballero dentro',   muscle: 'Espalda',  notes: '' },
    { name: 'Dorsal sentado agarre en V de Samuel',           muscle: 'Espalda',  notes: '' },
    { name: 'Lumbar en máquina',                              muscle: 'Espalda',  notes: '' },
    // Bíceps
    { name: 'Curl de bíceps martillo',        muscle: 'Bíceps',    notes: '' },
    { name: 'Curl Bayesti polea',             muscle: 'Bíceps',    notes: '' },
    { name: 'Curl predicador máquina entrada',muscle: 'Bíceps',    notes: '' },
    { name: 'Arm curl máquina entrada',       muscle: 'Bíceps',    notes: '' },
    // Antebrazo
    { name: 'Curl de muñeca con mancuernas', muscle: 'Antebrazo', notes: '' },
    { name: 'Curl inverso con barra',        muscle: 'Antebrazo', notes: '' },
    { name: 'Farmer walk',                   muscle: 'Antebrazo', notes: '' },
    // Piernas
    { name: 'Prensa en máquina fondo sala',                      muscle: 'Piernas', notes: '' },
    { name: 'Extensión de cuádriceps máquina entrada',           muscle: 'Piernas', notes: 'Conversión lbs: 140lbs=63,5kg' },
    { name: 'Extensión de cuádriceps fondo del pasillo',         muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral',                                   muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral sentado fondo pasillo',             muscle: 'Piernas', notes: '' },
    { name: 'Curl de femoral tumbado entrada',                   muscle: 'Piernas', notes: '' },
    { name: 'Gemelos máquina sentado izquierda de femoral',      muscle: 'Piernas', notes: '' },
    // Hombros
    { name: 'Press militar en máquina',                        muscle: 'Hombros', notes: '' },
    { name: 'Elevaciones laterales máquina fondo entrada',     muscle: 'Hombros', notes: '' },
    { name: 'Hombro posterior',                                muscle: 'Hombros', notes: '' },
  ];
  for (const ex of defaults) await dbPut('exercises', ex);
}

// ===== EXPORT / IMPORT / CLEAR =====
async function exportData() {
  const [exercises, workouts, weight, photos] = await Promise.all([
    dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight'), dbGetAll('photos')
  ]);

  // Limpiar campos internos y de usuario antes de exportar
  // El JSON exportado es portátil — no lleva IDs ni user_ids atados al dispositivo
  const clean = arr => arr.map(({ id, user_id, local_id, ...rest }) => rest);

  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    exercises: clean(exercises),
    workouts:  clean(workouts),
    weight:    clean(weight),
    photos:    photos.map(({ id, user_id, local_id, data: imgData, ...rest }) => ({
      ...rest,
      // No incluir base64 en el export (puede ser enorme); solo URLs de Supabase
      photo_url: rest.photo_url || null
    })).filter(p => p.photo_url), // solo exportar fotos que están en la nube
    goals: JSON.parse(localStorage.getItem('goals') || '{}')
  };

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `gymtracker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('✓ Datos exportados');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.exercises || !data.workouts) { showToast('Archivo inválido'); return; }

    // Limpiar datos locales actuales
    await Promise.all([
      dbClear('exercises'), dbClear('workouts'),
      dbClear('weight'),    dbClear('photos')
    ]);

    // Insertar sin IDs fijos — IndexedDB asignará nuevos IDs autoincrement
    // Esto evita conflictos entre usuarios y entre dispositivos
    for (const x of data.exercises) {
      const { id, user_id, local_id, ...rest } = x;
      await dbPut('exercises', rest);
    }
    for (const x of data.workouts) {
      const { id, user_id, local_id, ...rest } = x;
      // Asegurar que series es un array válido
      await dbPut('workouts', { ...rest, series: rest.series || [] });
    }
    for (const x of (data.weight || [])) {
      const { id, user_id, local_id, ...rest } = x;
      await dbPut('weight', rest);
    }
    for (const x of (data.photos || [])) {
      const { id, user_id, local_id, ...rest } = x;
      if (rest.photo_url) await dbPut('photos', rest);
    }
    if (data.goals) localStorage.setItem('goals', JSON.stringify(data.goals));

    showToast('✓ Datos importados');

    // Sincronizar con Supabase para que el cloud refleje los datos importados
    if (typeof syncNow === 'function') syncNow('push');

    navigateTo('dashboard', false);
  } catch (err) {
    console.error('Import error:', err);
    showToast('Error al importar — comprueba el archivo');
  }
  event.target.value = '';
}

function confirmClearData() {
  showActionSheet([
    { icon: '🗑️', label: 'Borrar TODOS los datos', danger: true, action: 'clearAllData()' }
  ], 'Esta acción no se puede deshacer');
}

async function clearAllData() {
  await Promise.all([dbClear('exercises'), dbClear('workouts'), dbClear('weight')]);
  localStorage.removeItem('goals');
  showToast('Datos borrados');
  await seedDefaultExercises();
  navigateTo('dashboard', false);
}
