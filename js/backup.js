/* ===================================================
   backup.js — GitHub Gist backup
   Token is stored in localStorage, never hardcoded in public code.
   =================================================== */
'use strict';

const GIST_ID_KEY     = 'gh_gist_id';
const LAST_BACKUP_KEY = 'gh_last_backup';
const BACKUP_INTERVAL_DAYS = 1;

// Token se carga desde localStorage — el usuario lo introduce en Ajustes
function getGistToken() { return localStorage.getItem('gh_token') || ''; }
function getGistId()    { return localStorage.getItem(GIST_ID_KEY) || ''; }

// Ya no se inicializa automáticamente — el usuario lo introduce en Ajustes
function initBackupToken() { /* no-op */ }

// ===== CREAR o ACTUALIZAR GIST =====
async function pushGistBackup() {
  const [exercises, workouts, weight, templates] = await Promise.all([
    dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight'), dbGetAll('templates')
  ]);

  const clean = arr => arr.map(({ id, user_id, local_id, ...rest }) => rest);
  const payload = {
    version: 2,
    backedUpAt: new Date().toISOString(),
    exercises: clean(exercises),
    workouts:  clean(workouts),
    weight:    clean(weight),
    templates: clean(templates),
    goals:     JSON.parse(localStorage.getItem('goals') || '{}')
  };

  const content  = JSON.stringify(payload, null, 2);
  const filename = 'gymtracker-backup.json';
  const gistId   = getGistId();

  const body = {
    description: `GymTracker backup — ${new Date().toLocaleDateString('es-ES')}`,
    public: false,
    files: { [filename]: { content } }
  };

  let url    = 'https://api.github.com/gists';
  let method = 'POST';
  if (gistId) { url = `https://api.github.com/gists/${gistId}`; method = 'PATCH'; }

  const r = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${getGistToken()}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${r.status}`);
  }

  const data = await r.json();
  localStorage.setItem(GIST_ID_KEY, data.id);
  localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
  return data.html_url;
}

// ===== RESTAURAR DESDE GIST =====
async function pullGistBackup() {
  const gistId = getGistId();
  if (!gistId) throw new Error('No hay backup previo. Haz un backup primero.');

  const r = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `Bearer ${getGistToken()}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);

  const data = await r.json();
  const file = data.files['gymtracker-backup.json'];
  if (!file) throw new Error('Archivo de backup no encontrado en el Gist');

  let content = file.content;
  if (file.truncated) {
    const raw = await fetch(file.raw_url);
    content = await raw.text();
  }

  const payload = JSON.parse(content);
  if (!payload.exercises || !payload.workouts) throw new Error('Backup inválido');

  await Promise.all([dbClear('exercises'), dbClear('workouts'), dbClear('weight'), dbClear('templates')]);

  for (const x of payload.exercises) { const { id, ...rest } = x; await dbPut('exercises', rest); }
  for (const x of payload.workouts)  { const { id, ...rest } = x; await dbPut('workouts', { ...rest, series: rest.series || [] }); }
  for (const x of (payload.weight || [])) { const { id, ...rest } = x; await dbPut('weight', rest); }
  for (const x of (payload.templates || [])) { const { id, ...rest } = x; await dbPut('templates', { ...rest, series: rest.series || [] }); }
  if (payload.goals) localStorage.setItem('goals', JSON.stringify(payload.goals));
  if (typeof renderTemplateSummary === 'function') renderTemplateSummary();

  return payload.backedUpAt;
}

// ===== BACKUP AUTOMÁTICO (cada 24h al arrancar) =====
async function autoBackupIfNeeded() {
  const last    = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  const elapsed = (Date.now() - last) / (1000 * 60 * 60 * 24);
  if (elapsed < BACKUP_INTERVAL_DAYS) return;
  try {
    await pushGistBackup();
    console.log('Auto-backup a GitHub Gist completado');
  } catch (e) {
    console.warn('Auto-backup fallido:', e.message);
  }
}

// ===== UI =====
async function handleManualBackup() {
  const btn = document.getElementById('backupGistBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    await pushGistBackup();
    showToast('✓ Backup guardado en GitHub');
    renderBackupStatus();
  } catch (e) {
    showToast('⚠ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Hacer backup ahora'; }
  }
}

async function confirmRestoreBackup() {
  const btn = document.getElementById('restoreGistBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Restaurando...'; }
  try {
    const date = await pullGistBackup();
    showToast('✓ Datos restaurados desde ' + new Date(date).toLocaleDateString('es-ES'));
    if (typeof syncNow === 'function') syncNow('push');
    navigateTo('dashboard', false);
  } catch (e) {
    showToast('⚠ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Restaurar backup'; }
  }
}

function handleRestoreBackup() {
  showActionSheet([{
    icon: '♻️',
    label: 'Restaurar desde GitHub',
    danger: true,
    action: 'confirmRestoreBackup()'
  }], 'Esto reemplazará todos tus datos locales');
}

function saveGistToken() {
  const input = document.getElementById('gistTokenInput');
  const token = input?.value.trim();
  if (!token) { showToast('Introduce un token'); return; }
  localStorage.setItem('gh_token', token);
  if (input) input.value = '';
  showToast('✓ Token guardado');
  renderBackupStatus();
}

function renderBackupStatus() {
  const el = document.getElementById('backupStatus');
  if (!el) return;
  const token  = getGistToken();
  const gistId = getGistId();
  const last   = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || '0');
  const lastStr = last ? new Date(last).toLocaleString('es-ES') : 'Nunca';
  const gistLink = gistId
    ? `<a href="https://gist.github.com/${gistId}" target="_blank" class="backup-gist-link">Ver Gist ↗</a>`
    : '';
  if (!token) {
    el.innerHTML = `<div class="backup-status-row"><span class="backup-dot grey"></span><span>Sin token — introdúcelo arriba</span></div>`;
    return;
  }
  el.innerHTML = `
    <div class="backup-status-row">
      <span class="backup-dot green"></span>
      <span>Token configurado · Último backup: ${lastStr}</span>
    </div>
    ${gistLink}`;
  // Mostrar token enmascarado en el input si está guardado
  const input = document.getElementById('gistTokenInput');
  if (input && !input.value) input.placeholder = '●●●●●●●● (guardado)';
}
