/* ===================================================
   sync.js — Supabase Auth + Cloud Sync
   =================================================== */

const SUPABASE_URL = 'https://dirwdsmsatiheffbmfwi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcndkc21zYXRpaGVmZmJtZndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODM5OTcsImV4cCI6MjA5Nzg1OTk5N30.97HNObQnuDm59vXPiK_AZ5gcycXr46sFtSkV-w3xDMU';

let _accessToken = null;
let _currentUser = null;

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
  }).catch(() => {});
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

async function sbDeleteAll(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=gte.0`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!r.ok) {
    // Try alternative filter
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?created_at=gte.2000-01-01`, {
      method: 'DELETE', headers: authHeaders()
    });
  }
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
  }).catch(() => {});
}

// ===== SYNC STATUS =====
let syncStatus = 'idle';

function setSyncStatus(s, msg) {
  syncStatus = s;
  const el = document.getElementById('syncIndicator');
  if (!el) return;
  const map = {
    syncing: '↑ Sincronizando...',
    ok:      '✓ Sincronizado',
    error:   msg || '⚠ Sin conexión',
    idle:    ''
  };
  el.textContent = map[s] || '';
  el.className = 'sync-indicator ' + s;
}

// ===== PUSH local → cloud =====
async function pushToCloud() {
  if (!_currentUser) return;
  const uid = _currentUser.id;
  const [exercises, workouts, weight, photos] = await Promise.all([
    dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight'), dbGetAll('photos')
  ]);

  // --- Exercises ---
  const exRows = exercises.map(e => ({
    user_id: uid, local_id: e.id,
    name: e.name, muscle: e.muscle || null, notes: e.notes || null
  }));

  // --- Workouts: subir foto si es base64 ---
  const woRows = await Promise.all(workouts.map(async w => {
    let photo_url = w.photo_url || null;
    // Si tiene foto en base64 (no es URL), subirla a Storage
    if (w.photo && w.photo.startsWith('data:')) {
      const ext = w.photo.split(';')[0].split('/')[1] || 'jpg';
      const filePath = `workout-photos/${uid}/workout_${w.id || Date.now()}.${ext}`;
      try {
        photo_url = await sbUploadPhoto(filePath, w.photo);
        // Actualizar local para no re-subir la próxima vez
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
    return {
      user_id: uid, local_id: p.id,
      date: p.date, notes: p.notes || null, photo_url
    };
  }));

  // Delete then re-insert
  await sbDeleteAll('exercises');
  await sbDeleteAll('workouts');
  await sbDeleteAll('weight_log');
  await sbDeleteAll('progress_photos');

  await sbInsert('exercises', exRows);
  await sbInsert('workouts', woRows);
  await sbInsert('weight_log', wtRows);
  if (phRows.filter(p => p.photo_url).length)
    await sbInsert('progress_photos', phRows.filter(p => p.photo_url));
}

// ===== PULL cloud → local =====
async function pullFromCloud() {
  if (!_currentUser) return false;
  const [exCloud, woCloud, wtCloud, phCloud] = await Promise.all([
    sbGet('exercises'), sbGet('workouts'), sbGet('weight_log'),
    sbGet('progress_photos').catch(() => [])
  ]);

  if (!exCloud.length && !woCloud.length) return false;

  await dbClear('exercises');
  await dbClear('workouts');
  await dbClear('weight');
  await dbClear('photos');

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

  return true;
}

// ===== MAIN SYNC =====
async function syncNow(direction = 'push') {
  if (!_currentUser || !navigator.onLine) { setSyncStatus('error'); return; }
  setSyncStatus('syncing');
  try {
    if (direction === 'push') await pushToCloud();
    else await pullFromCloud();
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 2500);
  } catch (err) {
    console.warn('Sync error:', err);
    setSyncStatus('error', '⚠ Error de sync');
  }
}

async function initSync() {
  if (!_currentUser || !navigator.onLine) { setSyncStatus('error'); return; }
  setSyncStatus('syncing');
  try {
    const pulled = await pullFromCloud();
    if (!pulled) await pushToCloud();
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 2500);
  } catch (err) {
    console.warn('Init sync error:', err);
    setSyncStatus('error');
  }
}

window.addEventListener('online',  () => { if (_currentUser) syncNow('push'); });
window.addEventListener('offline', () => setSyncStatus('error'));

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

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const emailEl = document.getElementById('userEmail');
  if (emailEl && _currentUser) emailEl.textContent = _currentUser.email;
  // Boot the app
  if (typeof bootApp === 'function') bootApp();
}

// Called from HTML buttons
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginError');
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
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('signupBtn');
  const err   = document.getElementById('loginError');
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
  localStorage.removeItem('goals');
  showLogin();
}
