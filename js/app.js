/* ===================================================
   app.js — Boot entry point
   Loads after all modules. Only responsible for init.
   =================================================== */
'use strict';

// ===== SERVICE WORKER =====
function registerSW() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// ===== INIT — called by sync.js after successful auth =====
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
  await initAuth(); // defined in sync.js — shows login or boots app
});
