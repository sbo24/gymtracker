/* ===================================================
   sync.js — Supabase cloud sync for GymTracker
   Estrategia: IndexedDB es la fuente de verdad local.
   Al abrir la app y al guardar datos, sincroniza con Supabase.
   =================================================== */

const SUPABASE_URL = 'https://dirwdsmsatiheffbmfwi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3EqEzzr9bNCRE5HSA1MlJg_OEoirW-K';

const SB_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer': 'return=representation'
};

let syncStatus = 'idle'; // idle | syncing | error | ok

function setSyncStatus(s) {
  syncStatus = s;
  const el = document.getElementById('syncIndicator');
  if (!el) return;
  const map = { syncing: '☁️ Sincronizando...', ok: '✓ Sincronizado', error: '⚠️ Sin conexión', idle: '' };
  el.textContent = map[s] || '';
  el.className = 'sync-indicator ' + s;
}

// ===== REST helpers =====
async function sbGet(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, {
    headers: SB_HEADERS
  });
  if (!r.ok) throw new Error(`sbGet ${table}: ${r.status}`);
  return r.json();
}

async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(`sbUpsert ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: SB_HEADERS
  });
  if (!r.ok) throw new Error(`sbDelete ${table}: ${r.status}`);
}

// ===== PUSH local → cloud =====
// Sends all local IndexedDB data to Supabase (full replace strategy)
async function pushToCloud() {
  const [exercises, workouts, weight] = await Promise.all([
    dbGetAll('exercises'), dbGetAll('workouts'), dbGetAll('weight')
  ]);

  // Map local objects to Supabase schema
  const exRows = exercises.map(e => ({
    local_id: e.id, name: e.name, muscle: e.muscle || null, notes: e.notes || null
  }));

  const woRows = workouts.map(w => ({
    local_id: w.id, date: w.date, notes: w.notes || null, series: w.series
  }));

  const wtRows = weight.map(w => ({
    local_id: w.id, date: w.date, weight: w.weight, fat: w.fat || null, notes: w.notes || null
  }));

  // Delete all remote, then insert fresh (simple & reliable for personal app)
  await fetch(`${SUPABASE_URL}/rest/v1/exercises?local_id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
  await fetch(`${SUPABASE_URL}/rest/v1/workouts?local_id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
  await fetch(`${SUPABASE_URL}/rest/v1/weight_log?local_id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });

  if (exRows.length) await sbUpsert('exercises', exRows);
  if (woRows.length) await sbUpsert('workouts', woRows);
  if (wtRows.length) await sbUpsert('weight_log', wtRows);
}

// ===== PULL cloud → local =====
async function pullFromCloud() {
  const [exCloud, woCloud, wtCloud] = await Promise.all([
    sbGet('exercises'), sbGet('workouts'), sbGet('weight_log')
  ]);

  if (!exCloud.length && !woCloud.length) return false; // cloud is empty, keep local

  // Replace local IndexedDB with cloud data
  await dbClear('exercises');
  await dbClear('workouts');
  await dbClear('weight');

  for (const e of exCloud) {
    await dbPut('exercises', {
      id: e.local_id || e.id,
      name: e.name, muscle: e.muscle, notes: e.notes
    });
  }

  for (const w of woCloud) {
    await dbPut('workouts', {
      id: w.local_id || w.id,
      date: w.date, notes: w.notes, series: w.series || []
    });
  }

  for (const w of wtCloud) {
    await dbPut('weight', {
      id: w.local_id || w.id,
      date: w.date, weight: parseFloat(w.weight),
      fat: w.fat ? parseFloat(w.fat) : null,
      notes: w.notes
    });
  }

  return true;
}

// ===== MAIN SYNC =====
// Call after any save/delete operation
async function syncNow(direction = 'push') {
  if (!navigator.onLine) { setSyncStatus('error'); return; }
  setSyncStatus('syncing');
  try {
    if (direction === 'push') await pushToCloud();
    else await pullFromCloud();
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 3000);
  } catch (err) {
    console.warn('Sync error:', err);
    setSyncStatus('error');
  }
}

// ===== INIT SYNC =====
// On app start: pull from cloud if cloud has data, else push local
async function initSync() {
  if (!navigator.onLine) { setSyncStatus('error'); return; }
  setSyncStatus('syncing');
  try {
    const pulled = await pullFromCloud();
    if (!pulled) {
      // Cloud empty — push local data up
      await pushToCloud();
    }
    setSyncStatus('ok');
    setTimeout(() => setSyncStatus('idle'), 3000);
  } catch (err) {
    console.warn('Init sync error:', err);
    setSyncStatus('error');
  }
}

window.addEventListener('online', () => syncNow('push'));
window.addEventListener('offline', () => setSyncStatus('error'));
