/* ===================================================
   app.js — Boot entry point
   Loads after all modules. Only responsible for init.
   =================================================== */
'use strict';

// ===== SERVICE WORKER =====
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    // Cuando hay una nueva versión del SW esperando
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Hay una actualización disponible — activar inmediatamente
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});

  // Cuando el SW se actualiza y toma control, recargar la página
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// ===== INIT — called by sync.js after successful auth =====
async function bootApp() {
  await seedDefaultExercises();
  navigateTo('dashboard', false);
  // Listener delegado para autoguardado del editor de entrenamiento
  if (typeof initWorkoutEditorListeners === 'function') initWorkoutEditorListeners();
  // Inicializar token de backup en localStorage (primera vez)
  initBackupToken();
  // Backup automático a GitHub Gist (cada 24h, en segundo plano)
  setTimeout(() => autoBackupIfNeeded(), 3000);
  // Renderizar estado del backup en Ajustes
  setTimeout(() => renderBackupStatus(), 500);
  setTimeout(() => {
    if (typeof renderTemplateSummary === 'function') renderTemplateSummary();
  }, 500);
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
