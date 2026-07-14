/* ===================================================
   nav.js — Navigation, header, FAB
   =================================================== */
'use strict';

let currentView = 'dashboard';
let viewStack   = [];
const tabViews  = ['dashboard', 'workouts', 'stats', 'settings'];

const headerTitles = {
  dashboard:    'GymTracker',
  workouts:     'Entrenamientos',
  workoutEdit:  'Nuevo entreno',
  exercises:    'Ejercicios',
  exerciseEdit: 'Ejercicio',
  history:      'Historial',
  stats:        'Estadísticas',
  weight:       'Peso corporal',
  records:      'Récords',
  goals:        'Objetivos',
  settings:     'Ajustes',
  photos:       'Fotos de progreso'
};

function navigateTo(view, push = true) {
  // Guardar automáticamente si salimos del editor de entreno
  if (currentView === 'workoutEdit' && view !== 'workoutEdit') {
    if (typeof saveWorkoutOnLeave === 'function') saveWorkoutOnLeave();
  }

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

function goBack() {
  if (viewStack.length > 0) navigateTo(viewStack.pop(), false);
}

function updateHeader(view) {
  document.getElementById('headerTitle').textContent = headerTitles[view] || 'GymTracker';
  const isSub = !tabViews.includes(view);
  const leftBtn = document.getElementById('headerLeft');
  leftBtn.style.visibility = isSub ? 'visible' : 'hidden';
  document.getElementById('headerLeftText').textContent = isSub ? 'Atrás' : '';

  const rightBtn     = document.getElementById('headerRight');
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

function handleHeaderLeft()  { goBack(); }
function handleHeaderRight() {
  if (currentView === 'exercises')    openExerciseEdit(null);
  else if (currentView === 'exerciseEdit') deleteExerciseCurrent();
}

function handleFab() {
  if (currentView === 'workouts')   openWorkoutEdit(null);
  else if (currentView === 'exercises') openExerciseEdit(null);
  else if (currentView === 'weight')    document.getElementById('weightValue').focus();
}

async function renderView(view) {
  switch (view) {
    case 'dashboard':  await renderDashboard();    break;
    case 'workouts':   await renderWorkoutList();  break;
    case 'exercises':  await renderExerciseList(); break;
    case 'stats':      await renderStats();        break;
    case 'weight':     await renderWeight();       break;
    case 'records':    await renderRecords();      break;
    case 'goals':      await renderGoals();        break;
    case 'photos':     await renderPhotos();       break;
    case 'settings':
      if (typeof renderBackupStatus === 'function') renderBackupStatus();
      if (typeof renderTemplateSummary === 'function') renderTemplateSummary();
      break;
  }
}
