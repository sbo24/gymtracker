/* ===================================================
   sync.js — Supabase Auth + Cloud Sync
   =================================================== */

const SUPABASE_URL = 'https://dirwdsmsatiheffbmfwi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcndkc21zYXRpaGVmZmJtZndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODM5OTcsImV4cCI6MjA5Nzg1OTk5N30.97HNObQnuDm59vXPiK_AZ5gcycXr46sFtSkV-w3xDMU';

let _accessToken = null;
let _currentUser = null;
let _suppressPendingSync = false;
let _hasPendingSync = false;

// ===== AUTH HEADERS =====
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${_accessToken || SUPABASE_KEY}`
  };
}

// ===== AUTH API =====
async function sbSignUp(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.msg || data.error_description || 'Error al registrar');
  return data;
}

async function sbSignIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.msg || data.error_description || 'Email o contraseña incorrectos');
  return data;
}

async function sbRefreshToken(refreshToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const data = await r.json();
  if (!r.ok) return null;
  return data;
}

async function sbSignOut() {
  if (!_accessToken) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: authHeaders()
  }).catch(() => { });
}

// ===== SESSION PERSISTENCE =====
function saveSession(session) {
  if (!session) return;
  localStorage.setItem('sb_session', JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user: session.user,
    expires_at: Date.now() + (session.expires_in || 3600) * 1000
  }));
  _accessToken = session.access_token;
  _currentUser = session.user;
}

function loadSession() {
  try {
    const raw = localStorage.getItem('sb_session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem('sb_session');
  _accessToken = null;
  _currentUser = null;
}

// ===== REST HELPERS =====
async function sbGet(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, {
    headers: { ...authHeaders(), 'Prefer': 'return=representation' }
  });
  if (!r.ok) throw new Error(`GET ${table}: ${r.status}`);
  return r.json();
}

// Upsert: inserta o actualiza usando la constraint UNIQUE(user_id, local_id)
async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=user_id,local_id`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`UPSERT ${table}: ${r.status} ${errText}`);
  }
}

// Push seguro: upsert con merge-duplicates.
// Si falla (ej. constraint no creada), lanza el error para que syncNow lo reintente.
// NO hacemos fallback row-by-row — sería lento y propenso a errores.
async function sbSafePush(table, rows) {
  if (!rows.length) return;
  try {
    await sbUpsert(table, rows);
  } catch (e) {
    console.warn(`Upsert failed for ${table}: ${e.message}`);
    throw e; // propagar para que el retry automático de syncNow lo vuelva a intentar
  }
}

// Borrar del cloud los registros que ya no existen en local
async function sbDeleteOrphans(table, localIds) {
  if (!localIds.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=gte.0`, {
      method: 'DELETE', headers: authHeaders()
    }).catch(() => { });
    return;
  }
  const ids = localIds.join(',');
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?local_id=not.in.(${ids})`, {
    method: 'DELETE', headers: authHeaders()
  }).catch(() => { });
}

async function sbDeleteAll(table) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=gte.0`, {
    method: 'DELETE', headers: authHeaders()
  }).catch(() => { });
}

async function sbInsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(`INSERT ${table}: ${r.status} ${await r.text()}`);
}

// ===== STORAGE: subir imagen a Supabase =====
async function sbUploadPhoto(filePath, base64Data) {
  // Convierte base64 a blob
  const res = await fetch(base64Data);
  const blob = await res.blob();

  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${filePath}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${_accessToken}`,
      'Content-Type': blob.type || 'image/jpeg',
      'x-upsert': 'true'
    },
    body: blob
  });
  if (!r.ok) throw new Error(`Upload photo: ${r.status} ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/authenticated/${filePath}`;
}

async function sbGetPhotoUrl(filePath) {
  // Genera URL firmada válida 1 año
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${filePath}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 31536000 })
  });
  if (!r.ok) return null;
  const data = await r.json();
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

async function sbDeletePhoto(filePath) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${filePath}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).catch(() => { });
}

// ===== SYNC STATUS =====
let syncStatus = 'idle';
let _syncRunning = false;      // evitar pushes concurrentes
let _syncRetryTimer = null;    // reintento automático tras error

function setSyncStatus(s, msg) {
  syncStatus = s;
  const el = document.getElementById('syncIndicator');
  if (!el) return;
  const map = {
    pending: msg || '• Cambios pendientes',
    syncing: '↑ Sincronizando...',
    ok: '✓ Sincronizado',
    offline: '⚠ Sin conexión',
    error: msg || '⚠ Error de sync',
    idle: ''
  };
  el.textContent = map[s] || '';
  el.className = 'sync-indicator ' + s;
}

function notePendingSync(msg = '• Cambios pendientes') {
  if (_suppressPendingSync) return;
  _hasPendingSync = true;
  if (!_currentUser) return;
  if (!navigator.onLine) setSyncStatus('offline');
  else setSyncStatus('pending', msg);
}

function clearPendingSync() {
  _hasPendingSync = false;
}

// ===== PUSH local → cloud =====
async function pushToCloud() {
  if (!_currentUser) return;
  const uid = _currentUser.id;
  const [exercises, workouts, weight, photos, templates] = await Promise.all([
    dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight'), dbGetAll('photos'), dbGetAll('templates')
  ]);

  // --- Exercises ---
  const exRows = exercises.map(e => ({
    user_id: uid, local_id: e.id,
    name: e.name, muscle: e.muscle || null, notes: e.notes || null
  }));

  // --- Workouts: subir foto si es base64 ---
  const woRows = await Promise.all(workouts.map(async w => {
    let photo_url = w.photo_url || null;
    if (w.photo && w.photo.startsWith('data:')) {
      const ext = w.photo.split(';')[0].split('/')[1] || 'jpg';
      const filePath = `workout-photos/${uid}/workout_${w.id || Date.now()}.${ext}`;
      try {
        photo_url = await sbUploadPhoto(filePath, w.photo);
        await dbPut('workouts', { ...w, photo: null, photo_url });
      } catch (e) { console.warn('Photo upload error:', e); }
    }
    return {
      user_id: uid, local_id: w.id,
      date: w.date, notes: w.notes || null,
      series: w.series, photo_url
    };
  }));

  // --- Weight ---
  const wtRows = weight.map(w => ({
    user_id: uid, local_id: w.id,
    date: w.date, weight: w.weight, fat: w.fat || null, notes: w.notes || null
  }));

  // --- Progress photos ---
  const phRows = await Promise.all(photos.map(async p => {
    let photo_url = p.photo_url || null;
    if (p.data && p.data.startsWith('data:')) {
      const ext = p.data.split(';')[0].split('/')[1] || 'jpg';
      const filePath = `workout-photos/${uid}/progress_${p.id || Date.now()}.${ext}`;
      try {
        photo_url = await sbUploadPhoto(filePath, p.data);
        await dbPut('photos', { ...p, data: null, photo_url });
      } catch (e) { console.warn('Progress photo upload error:', e); }
    }
    return photo_url ? { user_id: uid, local_id: p.id, date: p.date, notes: p.notes || null, photo_url } : null;
  }));

  const tplRows = templates.map(t => ({
    user_id: uid,
    local_id: t.id,
    name: t.name,
    weekday: t.weekday || null,
    notes: t.notes || null,
    series: t.series || []
  }));

  // Push con fallback automático (upsert si hay constraint, delete+insert si no)
  await sbSafePush('exercises', exRows);
  await sbSafePush('workouts', woRows);
  await sbSafePush('weight_log', wtRows);
  await sbSafePush('workout_templates', tplRows).catch(e => {
    console.warn('Template sync skipped:', e.message);
  });
  const validPhotos = phRows.filter(Boolean);
  if (validPhotos.length) await sbSafePush('progress_photos', validPhotos);

  // NOTA: Se eliminó sbDeleteOrphans — borraba datos en cloud cuando el local
  // estaba vacío (p.ej. tras limpiar caché o cambiar dispositivo).
  // Los registros eliminados por el usuario se gestionan solo mediante
  // el upsert — si no están en local simplemente no se actualizan en cloud.
}

// ===== PULL cloud → local =====
async function pullFromCloud() {
  if (!_currentUser) return false;
  const [exCloud, woCloud, wtCloud, phCloud, tplCloud] = await Promise.all([
    sbGet('exercises'), sbGet('workouts'), sbGet('weight_log'),
    sbGet('progress_photos').catch(() => []),
    sbGet('workout_templates').catch(() => [])
  ]);

  if (!exCloud.length && !woCloud.length && !tplCloud.length) return false;

  _suppressPendingSync = true;
  try {
    await dbClear('exercises');
    await dbClear('workouts');
    await dbClear('weight');
    await dbClear('photos');
    await dbClear('templates');

    for (const e of exCloud)
      await dbPut('exercises', { id: e.local_id || e.id, name: e.name, muscle: e.muscle, notes: e.notes });

    for (const w of woCloud)
      await dbPut('workouts', {
        id: w.local_id || w.id,
        date: w.date, notes: w.notes,
        series: w.series || [],
        photo_url: w.photo_url || null,
        photo: null  // base64 no se guarda en cloud, usar photo_url
      });

    for (const w of wtCloud)
      await dbPut('weight', {
        id: w.local_id || w.id,
        date: w.date, weight: parseFloat(w.weight),
        fat: w.fat ? parseFloat(w.fat) : null, notes: w.notes
      });

    for (const p of phCloud)
      if (p.photo_url)
        await dbPut('photos', {
          id: p.local_id || p.id,
          date: p.date, notes: p.notes,
          photo_url: p.photo_url, data: null
        });

    for (const t of tplCloud)
      await dbPut('templates', {
        id: t.local_id || t.id,
        name: t.name,
        weekday: t.weekday || '',
        notes: t.notes || '',
        series: t.series || [],
        updated_at: t.updated_at || new Date().toISOString()
      });
  } finally {
    _suppressPendingSync = false;
  }

  return true;
}

// ===== MAIN SYNC =====
async function syncNow(direction = 'push') {
  if (!_currentUser || !navigator.onLine) { setSyncStatus('offline'); return; }

  // Si ya hay un sync en curso, programar reintento en lugar de ejecutar en paralelo
  if (_syncRunning) {
    clearTimeout(_syncRetryTimer);
    _syncRetryTimer = setTimeout(() => syncNow(direction), 2000);
    return;
  }

  _syncRunning = true;
  setSyncStatus('syncing');
  try {
    if (direction === 'push') await pushToCloud();
    else await pullFromCloud();
    clearPendingSync();
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 2500);
  } catch (err) {
    console.warn('Sync error (auto-retry in 5s):', err.message);
    // Mostrar error brevemente y programar reintento automático silencioso
    setSyncStatus('error', '⚠ ' + (err.message?.slice(0, 50) || 'Error de sync'));
    clearTimeout(_syncRetryTimer);
    _syncRetryTimer = setTimeout(async () => {
      if (_currentUser && navigator.onLine) {
        setSyncStatus('syncing');
        try {
          await pushToCloud();
          clearPendingSync();
          setSyncStatus('ok');
          setTimeout(() => setSyncStatus('idle'), 2500);
        } catch (e2) {
          console.warn('Sync retry failed:', e2.message);
          setSyncStatus('pending', '• Pendiente de sync');
        }
      }
    }, 5000);
  } finally {
    _syncRunning = false;
  }
}

async function initSync() {
  if (!_currentUser || !navigator.onLine) { setSyncStatus('offline'); return; }
  if (_syncRunning) return;
  _syncRunning = true;
  setSyncStatus('syncing');
  try {
    const pulled = await pullFromCloud();
    if (!pulled) await pushToCloud();
    clearPendingSync();
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 2500);
  } catch (err) {
    console.warn('Init sync error:', err.message);
    setSyncStatus('error', '⚠ ' + (err.message?.slice(0, 60) || 'Error de sync'));
    // Reintento silencioso en 5s
    clearTimeout(_syncRetryTimer);
    _syncRetryTimer = setTimeout(() => syncNow('push'), 5000);
  } finally {
    _syncRunning = false;
  }
}

window.addEventListener('online', () => { if (_currentUser) syncNow('push'); });
window.addEventListener('offline', () => setSyncStatus('offline'));

// ===== AUTH FLOW =====
async function initAuth() {
  const session = loadSession();
  if (session) {
    if (Date.now() < session.expires_at - 60000) {
      _accessToken = session.access_token;
      _currentUser = session.user;
      await initSync();
      showApp();
      return;
    }
    if (session.refresh_token) {
      const fresh = await sbRefreshToken(session.refresh_token);
      if (fresh && fresh.access_token) {
        saveSession(fresh);
        await initSync();
        showApp();
        return;
      }
    }
    clearSession();
  }
  showLogin();
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

const ADMIN_EMAILS = ['saulbarrajon@gmail.com'];

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const emailEl = document.getElementById('userEmail');
  if (emailEl && _currentUser) emailEl.textContent = _currentUser.email;

  // Mostrar panel admin si el usuario tiene permisos
  const adminPanel = document.getElementById('adminPanel');
  const isAdmin = _currentUser && ADMIN_EMAILS.includes(_currentUser.email);
  if (adminPanel) {
    adminPanel.style.display = isAdmin ? 'block' : 'none';
  }
  if (isAdmin) {
    loadAdminSuggestionsCount();
  }

  if (typeof bootApp === 'function') bootApp();
}

// Called from HTML buttons
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  if (!email || !pass) { err.textContent = 'Rellena todos los campos'; return; }
  btn.disabled = true; btn.textContent = 'Entrando...'; err.textContent = '';
  try {
    const session = await sbSignIn(email, pass);
    saveSession(session);
    await initSync();
    showApp(); // showApp calls bootApp internally
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

async function handleSignup() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('signupBtn');
  const err = document.getElementById('loginError');
  if (!email || !pass) { err.textContent = 'Rellena todos los campos'; return; }
  if (pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
  btn.disabled = true; btn.textContent = 'Registrando...'; err.textContent = '';
  try {
    await sbSignUp(email, pass);
    // Auto sign in after signup
    const session = await sbSignIn(email, pass);
    saveSession(session);
    await initSync();
    showApp(); // showApp calls bootApp internally
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
  }
}

async function handleLogout() {
  await sbSignOut();
  clearSession();
  // Clear local data
  await dbClear('exercises');
  await dbClear('workouts');
  await dbClear('weight');
  await dbClear('photos');
  await dbClear('templates');
  localStorage.removeItem('goals');
  showLogin();
}

// ===== ADMIN =====
// La service_role key NO está en el código — el admin la introduce una vez
// y se guarda en localStorage bajo 'admin_srkey'. Nunca va al repositorio.

function getServiceRoleKey() {
  return localStorage.getItem('admin_srkey') || '';
}

async function adminExportAllUsers() {
  if (!_currentUser || !ADMIN_EMAILS.includes(_currentUser.email)) {
    showToast('Sin permisos'); return;
  }

  let srKey = getServiceRoleKey();
  if (!srKey) {
    srKey = window.prompt('Introduce la service_role key de Supabase (se guarda solo en este dispositivo):');
    if (!srKey?.trim()) return;
    localStorage.setItem('admin_srkey', srKey.trim());
    srKey = srKey.trim();
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': srKey,
    'Authorization': `Bearer ${srKey}`
  };

  showToast('Descargando datos...');

  try {
    const tables = ['exercises', 'workouts', 'weight_log', 'progress_photos', 'workout_templates'];
    const backup = { exportedAt: new Date().toISOString(), tables: {} };

    for (const table of tables) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, {
        headers: { ...headers, 'Prefer': 'return=representation' }
      });
      if (r.ok) {
        backup.tables[table] = await r.json();
      } else {
        const err = await r.text();
        console.warn(`Admin export ${table}: ${r.status} ${err}`);
        backup.tables[table] = [];
      }
    }

    const totalRows = Object.values(backup.tables).reduce((s, t) => s + t.length, 0);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gymtracker-admin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`✓ Backup descargado — ${totalRows} registros de ${tables.length} tablas`);
  } catch (e) {
    console.error('Admin export error:', e);
    showToast('⚠ Error: ' + e.message);
    // Si el error puede ser por key incorrecta, limpiar para que la pida de nuevo
    if (e.message?.includes('401') || e.message?.includes('403')) {
      localStorage.removeItem('admin_srkey');
      showToast('⚠ Key incorrecta — se ha borrado, inténtalo de nuevo');
    }
  }
}

async function adminImportAllUsers(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!_currentUser || !ADMIN_EMAILS.includes(_currentUser.email)) {
    showToast('Sin permisos');
    event.target.value = '';
    return;
  }

  let srKey = getServiceRoleKey();
  if (!srKey) {
    srKey = window.prompt('Introduce la service_role key de Supabase (se guarda solo en este dispositivo):');
    if (!srKey?.trim()) { event.target.value = ''; return; }
    localStorage.setItem('admin_srkey', srKey.trim());
    srKey = srKey.trim();
  }

  showToast('Restaurando backup en la nube...');
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const tablesData = data.tables || data;

    const headers = {
      'Content-Type': 'application/json',
      'apikey': srKey,
      'Authorization': `Bearer ${srKey}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };

    const tableList = ['exercises', 'workouts', 'weight_log', 'progress_photos', 'workout_templates'];
    let totalImported = 0;

    for (const table of tableList) {
      const rows = tablesData[table];
      if (Array.isArray(rows) && rows.length > 0) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(rows)
        });
        if (!r.ok) {
          const errText = await r.text();
          console.warn(`Admin import error in ${table}:`, errText);
        } else {
          totalImported += rows.length;
        }
      }
    }

    showToast(`✓ Backup completo restaurado: ${totalImported} registros`);
    await syncNow('pull');
  } catch (e) {
    console.error('Admin import error:', e);
    showToast('⚠ Error al importar: ' + e.message);
    if (e.message?.includes('401') || e.message?.includes('403')) {
      localStorage.removeItem('admin_srkey');
    }
  }
  event.target.value = '';
}

// ===== SUGERENCIAS / BUZÓN DE FEEDBACK =====
async function sendSuggestion() {
  const input = document.getElementById('suggestionText');
  const text = input?.value.trim();
  if (!text) {
    showToast('Escribe una sugerencia antes de enviar');
    return;
  }

  const payload = {
    user_id: _currentUser?.id || null,
    user_email: _currentUser?.email || 'anónimo',
    content: text
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/suggestions`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(err);
    }

    input.value = '';
    showToast('✓ Sugerencia enviada. ¡Muchas gracias!');
    if (_currentUser && ADMIN_EMAILS.includes(_currentUser.email)) {
      loadAdminSuggestionsCount();
    }
  } catch (e) {
    console.error('Send suggestion error:', e);
    showToast('⚠ Error al enviar sugerencia');
  }
}

async function loadAdminSuggestionsCount() {
  const countEl = document.getElementById('adminSuggestionsCount');
  if (!countEl) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/suggestions?select=id`, {
      headers: authHeaders()
    });
    if (r.ok) {
      const data = await r.json();
      countEl.textContent = `${data.length} sugerencia${data.length === 1 ? '' : 's'} recibida${data.length === 1 ? '' : 's'}`;
    } else {
      countEl.textContent = '0 sugerencias';
    }
  } catch {
    countEl.textContent = 'Ver sugerencias';
  }
}

async function adminViewSuggestions() {
  if (!_currentUser || !ADMIN_EMAILS.includes(_currentUser.email)) {
    showToast('Sin permisos'); return;
  }

  const sheet = document.getElementById('suggestionsModalSheet');
  const overlay = document.getElementById('modalOverlay');
  const listEl = document.getElementById('suggestionsList');

  if (!sheet || !listEl) return;
  listEl.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px;text-align:center">Cargando sugerencias...</div>';
  sheet.classList.add('active');
  overlay.classList.add('active');

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/suggestions?select=*&order=created_at.desc`, {
      headers: authHeaders()
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const suggestions = await r.json();

    if (!suggestions.length) {
      listEl.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px;text-align:center">No hay sugerencias registradas aún.</div>';
      return;
    }

    listEl.innerHTML = suggestions.map(item => {
      const date = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Sin fecha';

      return `
        <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;padding:14px 16px;box-shadow:var(--card-shadow);display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:700;font-size:13px;color:var(--accent)">${item.user_email || 'Usuario anónimo'}</span>
            <span style="font-size:11px;color:var(--text3)">${date}</span>
          </div>
          <div style="font-size:14px;color:var(--text);white-space:pre-wrap;line-height:1.4;margin:2px 0">${item.content}</div>
          <div style="display:flex;justify-content:flex-end;margin-top:2px">
            <button onclick="adminDeleteSuggestion(${item.id})" style="background:rgba(255,59,48,0.12);color:var(--red);border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">🗑️ Eliminar</button>
          </div>
        </div>
      `;
    }).join('');

    loadAdminSuggestionsCount();
  } catch (e) {
    console.error('Error fetching suggestions:', e);
    listEl.innerHTML = `<div style="color:#ff3b30;font-size:13px;padding:12px">Error al cargar: ${e.message}</div>`;
  }
}

function closeSuggestionsSheet() {
  const sheet = document.getElementById('suggestionsModalSheet');
  const overlay = document.getElementById('modalOverlay');
  if (sheet) sheet.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

async function adminDeleteSuggestion(id) {
  if (!confirm('¿Eliminar esta sugerencia?')) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/suggestions?id=eq.${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    showToast('✓ Sugerencia eliminada');
    adminViewSuggestions();
  } catch (e) {
    console.error('Delete suggestion error:', e);
    showToast('⚠ Error al eliminar');
  }
}

