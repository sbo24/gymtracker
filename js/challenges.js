/* ===================================================
   challenges.js — Retos entre usuarios
   =================================================== */
'use strict';

// ── Estado ────────────────────────────────────────────
let _challengeMetric = 'volume';
let _challengePeriod = 'week';
let _rivalUserId = null;
let _rivalEmail = '';

// ── Rivales guardados (localStorage + Supabase DB) ────
const RIVALS_KEY = 'saved_rivals';

function getLocalSavedRivals() {
  try { return JSON.parse(localStorage.getItem(RIVALS_KEY) || '[]'); } catch { return []; }
}

function saveLocalRival(userId, maskedEmail) {
  const rivals = getLocalSavedRivals();
  if (!rivals.find(r => r.userId === userId)) {
    rivals.unshift({ userId, maskedEmail, addedAt: new Date().toISOString() });
    try { localStorage.setItem(RIVALS_KEY, JSON.stringify(rivals.slice(0, 30))); } catch { }
  }
}

function removeLocalRival(userId) {
  const rivals = getLocalSavedRivals().filter(r => r.userId !== userId);
  try { localStorage.setItem(RIVALS_KEY, JSON.stringify(rivals)); } catch { }
}

async function sbGetSavedRivals() {
  if (!_currentUser) return getLocalSavedRivals();
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/saved_rivals?user_id=eq.${_currentUser.id}&order=created_at.desc`,
      { headers: authHeaders() }
    );
    if (!r.ok) return getLocalSavedRivals();
    const data = await r.json();
    const list = data.map(item => ({
      userId: item.rival_id,
      maskedEmail: item.rival_email,
      addedAt: item.created_at
    }));
    try { localStorage.setItem(RIVALS_KEY, JSON.stringify(list)); } catch { }
    return list;
  } catch {
    return getLocalSavedRivals();
  }
}

async function saveRival(userId, maskedEmail) {
  if (!userId || !maskedEmail) return;
  saveLocalRival(userId, maskedEmail);
  await renderSavedRivals();

  if (!_currentUser) {
    showToast('⭐ Rival guardado');
    return;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_rivals`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: _currentUser.id,
        rival_id: userId,
        rival_email: maskedEmail
      })
    });
    if (r.ok) {
      showToast('⭐ Rival guardado en la base de datos');
    } else {
      showToast('⭐ Rival guardado');
    }
  } catch {
    showToast('⭐ Rival guardado localmente');
  }
}

async function removeRival(userId) {
  removeLocalRival(userId);
  await renderSavedRivals();

  if (!_currentUser) {
    showToast('Rival eliminado');
    return;
  }

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/saved_rivals?user_id=eq.${_currentUser.id}&rival_id=eq.${userId}`,
      { method: 'DELETE', headers: authHeaders() }
    );
    showToast('Rival eliminado de la base de datos');
  } catch {
    showToast('Rival eliminado');
  }
}

async function toggleSaveRival(userId, maskedEmail) {
  const rivals = await sbGetSavedRivals();
  const exists = rivals.some(r => r.userId === userId);
  if (exists) {
    await removeRival(userId);
  } else {
    await saveRival(userId, maskedEmail);
  }
  if (_rivalUserId === userId) {
    renderRivalComparison();
  }
  const q = document.getElementById('rivalSearchInput')?.value.trim();
  if (q && q.length >= 3) {
    searchRival();
  }
}

async function renderSavedRivals() {
  const el = document.getElementById('savedRivalsList');
  if (!el) return;
  const rivals = await sbGetSavedRivals();
  if (!rivals.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text4);padding:4px 0;width:100%">Aún no tienes rivales guardados. Busca un usuario para añadirlo.</div>';
    return;
  }
  el.innerHTML = rivals.map(r => `
    <div class="saved-rival-item ${_rivalUserId === r.userId ? 'active' : ''}" onclick="selectRival('${r.userId}','${r.maskedEmail}')">
      <div class="rival-avatar" style="width:28px;height:28px;font-size:12px">${r.maskedEmail[0].toUpperCase()}</div>
      <div class="saved-rival-email">${r.maskedEmail}</div>
      <button class="saved-rival-del" title="Eliminar rival" onclick="event.stopPropagation();removeRival('${r.userId}')">×</button>
    </div>
  `).join('');
}


// ── Helpers Supabase ──────────────────────────────────
async function sbSearchUsers(query) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/search_users_by_email`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    }
  );
  if (!r.ok) return [];
  return r.json();
}

async function sbGetMuscleStats(userId, period) {
  // Usa la función SQL que calcula en tiempo real desde los workouts del usuario
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_muscle_stats_for_user`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: userId, target_period: period })
    }
  );
  if (!r.ok) return [];
  return r.json();
}

async function sbGetUserOverview(userId, period) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_user_challenge_overview`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId, target_period: period })
      }
    );
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    }
  } catch (e) { }
  return null;
}

async function getLocalUserOverview(period) {
  try {
    const workouts = await dbGetAll('workouts');
    const periods = {
      week: getWeekMonday(new Date()),
      month: localDateStr(new Date()).slice(0, 7) + '-01',
      all: '2000-01-01'
    };
    const fromDate = periods[period] || '2000-01-01';
    const filtered = (workouts || []).filter(w => w.date >= fromDate);
    const uniqueDays = new Set(filtered.map(w => w.date));
    
    let totalVol = 0;
    let totalSets = 0;
    let maxWeight = 0;
    let lastWorkout = null;

    filtered.forEach(w => {
      if (!lastWorkout || w.date > lastWorkout) lastWorkout = w.date;
      (w.series || []).forEach(s => {
        if (s.cardio) return;
        const wKg = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps) || 0;
        if (wKg > 0 && r > 0) {
          totalVol += wKg * r;
          totalSets++;
          if (wKg > maxWeight) maxWeight = wKg;
        }
      });
    });

    return {
      workout_days: uniqueDays.size,
      total_volume: Math.round(totalVol),
      total_sets: totalSets,
      max_weight: maxWeight,
      last_workout: lastWorkout
    };
  } catch (e) {
    return null;
  }
}

function computeOverviewFromStats(statsList) {
  let totalVol = 0;
  let totalSets = 0;
  let maxWeight = 0;
  (statsList || []).forEach(s => {
    totalVol += parseFloat(s.volume) || 0;
    totalSets += parseInt(s.sets) || 0;
    maxWeight = Math.max(maxWeight, parseFloat(s.max_weight) || 0);
  });
  return {
    workout_days: totalSets > 0 ? Math.max(1, Math.ceil(totalSets / 16)) : 0,
    total_volume: Math.round(totalVol),
    total_sets: totalSets,
    max_weight: maxWeight,
    last_workout: null
  };
}

function formatTonnage(kg) {
  if (!kg || kg <= 0) return '0 kg';
  if (kg >= 1000) return (kg / 1000).toFixed(1) + ' t';
  return formatBigNum(kg) + ' kg';
}

function formatDaysAgo(dateStr) {
  if (!dateStr) return 'Sin datos recientes';
  const today = localDateStr(new Date());
  if (dateStr === today) return '🔥 Hoy';
  const diffDays = Math.round((new Date(today) - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return '⚡ Ayer';
  if (diffDays > 1 && diffDays < 30) return `Hace ${diffDays} días`;
  return dateStr;
}

function getTopMuscle(statsMap) {
  let best = null;
  let maxVol = 0;
  Object.entries(statsMap).forEach(([muscle, data]) => {
    if (muscle !== 'Cardio' && muscle !== 'Otro' && (data.volume || 0) > maxVol) {
      maxVol = data.volume;
      best = { muscle, volume: data.volume, sets: data.sets };
    }
  });
  return best;
}

async function sbUpsertMuscleStats(rows) {
  if (!rows.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/muscle_stats`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
}

async function sbCreateChallenge(toUserId, metric, period, muscle) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/challenges`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      from_user: _currentUser.id,
      to_user: toUserId,
      metric, period,
      muscle: muscle || null
    })
  });
  // Crear notificación para el rival
  await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      user_id: toUserId,
      type: 'challenge_received',
      payload: {
        from_email: _currentUser.email,
        metric, period, muscle: muscle || null
      }
    })
  });
  return r.ok;
}

async function sbGetNotifications() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${_currentUser?.id}&read=eq.false&order=created_at.desc&limit=10`,
    { headers: authHeaders() }
  );
  if (!r.ok) return [];
  return r.json();
}

async function sbMarkNotificationsRead() {
  await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${_currentUser?.id}&read=eq.false`,
    { method: 'PATCH', headers: { ...authHeaders(), 'Prefer': 'return=minimal' }, body: JSON.stringify({ read: true }) }
  );
}

// ── Publicar mis stats de músculo ─────────────────────
async function publishMuscleStats() {
  if (!_currentUser) return;
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const uid = _currentUser.id;

  const periods = {
    week: getWeekMonday(new Date()),
    month: localDateStr(new Date()).slice(0, 7) + '-01',
    all: '2000-01-01'
  };

  const rows = [];
  for (const [period, fromDate] of Object.entries(periods)) {
    const filtered = workouts.filter(w => w.date >= fromDate);
    const stats = {};
    filtered.forEach(w => {
      w.series.forEach(s => {
        if (s.cardio) return;
        const ex = exercises.find(e => e.id === s.exerciseId);
        const muscle = ex?.muscle || 'Otro';
        if (!stats[muscle]) stats[muscle] = { volume: 0, max_weight: 0, sets: 0 };
        stats[muscle].volume += seriesVol(s);
        stats[muscle].max_weight = Math.max(stats[muscle].max_weight, s.weight || 0);
        stats[muscle].sets += 1;
      });
    });
    MUSCLE_ORDER.forEach(muscle => {
      rows.push({
        user_id: uid, muscle, period,
        volume: Math.round(stats[muscle]?.volume || 0),
        max_weight: stats[muscle]?.max_weight || 0,
        sets: stats[muscle]?.sets || 0,
        updated_at: new Date().toISOString()
      });
    });
  }
  await sbUpsertMuscleStats(rows);
}

function getMonday(d) {
  return getWeekMonday(d);
}

// ── Renderizado principal ─────────────────────────────
async function renderChallenges() {
  const el = document.getElementById('viewChallenges');
  if (!el) return;

  // Publicar mis stats al abrir la sección
  publishMuscleStats().catch(() => { });

  // Notificaciones
  renderChallengeNotifications();

  // Cargamos y renderizamos rivales guardados desde Supabase DB
  renderSavedRivals();

  // Si hay rival seleccionado, mostrar comparativa
  if (_rivalUserId) {
    renderRivalComparison();
  } else {
    document.getElementById('challengeComparison').innerHTML = '';
  }
}

async function renderChallengeNotifications() {
  const el = document.getElementById('challengeNotifBadge');
  const list = document.getElementById('challengeNotifList');
  if (!el || !list) return;
  try {
    const notifs = await sbGetNotifications();
    el.textContent = notifs.length || '';
    el.style.display = notifs.length ? 'flex' : 'none';
    list.innerHTML = notifs.length
      ? notifs.map(n => `<div class="challenge-notif">
          <div class="challenge-notif-text">
            <b>${n.payload?.from_email?.split('@')[0] || 'Alguien'}</b> te ha retado
            ${n.payload?.muscle ? `en <b>${n.payload.muscle}</b>` : ''}
            · ${n.payload?.period === 'week' ? 'Esta semana' : n.payload?.period === 'month' ? 'Este mes' : 'Todo'}
          </div>
          <div class="challenge-notif-time">${timeAgo(n.created_at)}</div>
        </div>`).join('')
      : '<div style="text-align:center;color:var(--text3);padding:12px;font-size:13px">Sin notificaciones</div>';
    if (notifs.length) sbMarkNotificationsRead();
  } catch { }
}

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return `Hace ${Math.floor(diff / 86400)}d`;
}

// ── Búsqueda de usuario rival ─────────────────────────
async function searchRival() {
  const q = document.getElementById('rivalSearchInput')?.value.trim();
  if (!q || q.length < 3) { showToast('Escribe al menos 3 caracteres'); return; }
  const resultsEl = document.getElementById('rivalSearchResults');
  resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3)">Buscando...</div>';

  try {
    const [users, savedRivals] = await Promise.all([
      sbSearchUsers(q),
      sbGetSavedRivals()
    ]);
    if (!users.length) {
      resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3)">Sin resultados</div>';
      return;
    }
    const savedIds = new Set(savedRivals.map(r => r.userId));
    resultsEl.innerHTML = users.map(u => {
      const isSaved = savedIds.has(u.user_id);
      return `
      <div class="rival-result" onclick="selectRival('${u.user_id}','${u.masked_email}')">
        <div class="rival-avatar">${u.masked_email[0].toUpperCase()}</div>
        <div class="rival-email">${u.masked_email}</div>
        <button class="btn-icon-fav" title="${isSaved ? 'Eliminar de mis rivales' : 'Guardar en mis rivales'}" onclick="event.stopPropagation();toggleSaveRival('${u.user_id}','${u.masked_email}')">
          ${isSaved ? '⭐' : '☆'}
        </button>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  } catch {
    resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--red)">Error al buscar</div>';
  }
}

function selectRival(userId, maskedEmail) {
  _rivalUserId = userId;
  _rivalEmail = maskedEmail;
  document.getElementById('rivalSearchResults').innerHTML = '';
  document.getElementById('rivalSearchInput').value = maskedEmail;
  document.getElementById('challengeRivalName').textContent = maskedEmail;
  document.getElementById('challengeRivalSection').style.display = 'block';
  renderRivalComparison();
}

// ── Comparativa visual completa y estadísticas de pique ────────────────
async function renderRivalComparison() {
  if (!_rivalUserId || !_currentUser) return;
  const el = document.getElementById('challengeComparison');
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando comparativa y estadísticas...</div>';

  try {
    const [myStats, rivalStats, localOverview, rpcMyOverview, rpcRivalOverview] = await Promise.all([
      sbGetMuscleStats(_currentUser.id, _challengePeriod),
      sbGetMuscleStats(_rivalUserId, _challengePeriod),
      getLocalUserOverview(_challengePeriod),
      sbGetUserOverview(_currentUser.id, _challengePeriod),
      sbGetUserOverview(_rivalUserId, _challengePeriod)
    ]);

    // Combinar overview con mayor precisión
    const myOverview = localOverview || rpcMyOverview || computeOverviewFromStats(myStats);
    const rivalOverview = rpcRivalOverview || computeOverviewFromStats(rivalStats);

    const myMap = Object.fromEntries(myStats.map(s => [s.muscle, s]));
    const rivalMap = Object.fromEntries(rivalStats.map(s => [s.muscle, s]));
    const metric = _challengeMetric;
    const metricLabel = { volume: 'Volumen (kg)', max_weight: 'Peso máx (kg)', sets: 'Series' }[metric];

    // 1. Puntuación de grupos musculares
    let myWins = 0, rivalWins = 0, ties = 0;
    const muscles = MUSCLE_ORDER.filter(m => m !== 'Cardio' && m !== 'Otro');

    muscles.forEach(m => {
      const myVal = myMap[m]?.[metric] || 0;
      const rivalVal = rivalMap[m]?.[metric] || 0;
      if (myVal > rivalVal) myWins++;
      else if (rivalVal > myVal) rivalWins++;
      else ties++;
    });

    // 2. Duelo en 4 métricas globales de pique
    let myPiqueScore = 0, rivalPiqueScore = 0;
    
    // A) Días entrenados
    const daysWinner = (myOverview.workout_days > rivalOverview.workout_days) ? 'me' : (rivalOverview.workout_days > myOverview.workout_days ? 'rival' : 'tie');
    if (daysWinner === 'me') myPiqueScore++; else if (daysWinner === 'rival') rivalPiqueScore++;

    // B) Volumen total
    const volWinner = (myOverview.total_volume > rivalOverview.total_volume) ? 'me' : (rivalOverview.total_volume > myOverview.total_volume ? 'rival' : 'tie');
    if (volWinner === 'me') myPiqueScore++; else if (volWinner === 'rival') rivalPiqueScore++;

    // C) Series totales
    const setsWinner = (myOverview.total_sets > rivalOverview.total_sets) ? 'me' : (rivalOverview.total_sets > myOverview.total_sets ? 'rival' : 'tie');
    if (setsWinner === 'me') myPiqueScore++; else if (setsWinner === 'rival') rivalPiqueScore++;

    // D) Levantamiento máximo
    const weightWinner = (myOverview.max_weight > rivalOverview.max_weight) ? 'me' : (rivalOverview.max_weight > myOverview.max_weight ? 'rival' : 'tie');
    if (weightWinner === 'me') myPiqueScore++; else if (weightWinner === 'rival') rivalPiqueScore++;

    // 3. Músculo Rey de cada uno
    const myTop = getTopMuscle(myMap);
    const rivalTop = getTopMuscle(rivalMap);

    // 4. Banner dinámico de pique
    let bannerHtml = '';
    if (myPiqueScore > rivalPiqueScore) {
      bannerHtml = `
      <div class="pique-banner winning">
        <span style="font-size:20px">🔥</span>
        <div>
          <div style="font-weight:700;color:#fff">¡Vas ganando el pique global! (${myPiqueScore} vs ${rivalPiqueScore})</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:1px">Lideras en constancia y volumen. ¡No bajes la guardia!</div>
        </div>
      </div>`;
    } else if (rivalPiqueScore > myPiqueScore) {
      bannerHtml = `
      <div class="pique-banner losing">
        <span style="font-size:20px">⚡</span>
        <div>
          <div style="font-weight:700;color:#fff">¡Tu rival te lleva ventaja! (${rivalPiqueScore} vs ${myPiqueScore})</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:1px">Toca apretar en el próximo entreno para remontar.</div>
        </div>
      </div>`;
    } else {
      bannerHtml = `
      <div class="pique-banner tied">
        <span style="font-size:20px">⚔️</span>
        <div>
          <div style="font-weight:700;color:var(--text)">¡Duelo al rojo vivo! Máxima igualdad (${myPiqueScore} - ${rivalPiqueScore})</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Cualquier serie de más puede decantar el pique.</div>
        </div>
      </div>`;
    }

    el.innerHTML = `
      <!-- 1. Marcador global de grupos musculares -->
      <div class="challenge-scoreboard">
        <div class="challenge-player ${myWins >= rivalWins ? 'winner' : ''}">
          <div class="challenge-player-avatar">Tú</div>
          <div class="challenge-player-score">${myWins}</div>
          <div class="challenge-player-label">músculos ganados</div>
        </div>
        <div class="challenge-vs">VS</div>
        <div class="challenge-player ${rivalWins > myWins ? 'winner' : ''}">
          <div class="challenge-player-avatar">${_rivalEmail[0].toUpperCase()}</div>
          <div class="challenge-player-score">${rivalWins}</div>
          <div class="challenge-player-label">músculos ganados</div>
        </div>
      </div>
      ${ties ? `<div style="text-align:center;font-size:11px;color:var(--text3);margin:-2px 0 10px">${ties} grupo${ties > 1 ? 's' : ''} en empate</div>` : ''}

      <!-- 2. Hype Banner de Pique -->
      ${bannerHtml}

      <!-- 3. Tarjetas de Duelo Directo (Pique Grid 2x2) -->
      <div class="pique-grid">
        <!-- Días entrenados -->
        <div class="pique-card">
          <div class="pique-card-header">
            <span>🏋️ Días de Gym</span>
            ${daysWinner === 'me' ? '<span class="challenge-crown">👑 Tú</span>' : daysWinner === 'rival' ? '<span class="challenge-crown">👑 Rival</span>' : ''}
          </div>
          <div class="pique-card-body">
            <div class="pique-side">
              <span class="pique-val ${daysWinner === 'me' ? 'winner-me' : ''}">${myOverview.workout_days || 0}</span>
              <span class="pique-lbl">Tú</span>
            </div>
            <div class="pique-side right">
              <span class="pique-val ${daysWinner === 'rival' ? 'winner-rival' : ''}">${rivalOverview.workout_days || 0}</span>
              <span class="pique-lbl">${_rivalEmail.split('@')[0]}</span>
            </div>
          </div>
          <div class="pique-mini-track">
            <div style="background:#0a84ff;width:${myOverview.workout_days + rivalOverview.workout_days > 0 ? (myOverview.workout_days / (myOverview.workout_days + rivalOverview.workout_days) * 100) : 50}%"></div>
            <div style="background:#ff453a;width:${myOverview.workout_days + rivalOverview.workout_days > 0 ? (rivalOverview.workout_days / (myOverview.workout_days + rivalOverview.workout_days) * 100) : 50}%"></div>
          </div>
        </div>

        <!-- Tonelaje Total -->
        <div class="pique-card">
          <div class="pique-card-header">
            <span>⚡ Volumen Total</span>
            ${volWinner === 'me' ? '<span class="challenge-crown">👑 Tú</span>' : volWinner === 'rival' ? '<span class="challenge-crown">👑 Rival</span>' : ''}
          </div>
          <div class="pique-card-body">
            <div class="pique-side">
              <span class="pique-val ${volWinner === 'me' ? 'winner-me' : ''}">${formatTonnage(myOverview.total_volume)}</span>
              <span class="pique-lbl">Tú</span>
            </div>
            <div class="pique-side right">
              <span class="pique-val ${volWinner === 'rival' ? 'winner-rival' : ''}">${formatTonnage(rivalOverview.total_volume)}</span>
              <span class="pique-lbl">${_rivalEmail.split('@')[0]}</span>
            </div>
          </div>
          <div class="pique-mini-track">
            <div style="background:#0a84ff;width:${myOverview.total_volume + rivalOverview.total_volume > 0 ? (myOverview.total_volume / (myOverview.total_volume + rivalOverview.total_volume) * 100) : 50}%"></div>
            <div style="background:#ff453a;width:${myOverview.total_volume + rivalOverview.total_volume > 0 ? (rivalOverview.total_volume / (myOverview.total_volume + rivalOverview.total_volume) * 100) : 50}%"></div>
          </div>
        </div>

        <!-- Series Totales -->
        <div class="pique-card">
          <div class="pique-card-header">
            <span>🔁 Series Totales</span>
            ${setsWinner === 'me' ? '<span class="challenge-crown">👑 Tú</span>' : setsWinner === 'rival' ? '<span class="challenge-crown">👑 Rival</span>' : ''}
          </div>
          <div class="pique-card-body">
            <div class="pique-side">
              <span class="pique-val ${setsWinner === 'me' ? 'winner-me' : ''}">${myOverview.total_sets || 0}</span>
              <span class="pique-lbl">Tú</span>
            </div>
            <div class="pique-side right">
              <span class="pique-val ${setsWinner === 'rival' ? 'winner-rival' : ''}">${rivalOverview.total_sets || 0}</span>
              <span class="pique-lbl">${_rivalEmail.split('@')[0]}</span>
            </div>
          </div>
          <div class="pique-mini-track">
            <div style="background:#0a84ff;width:${myOverview.total_sets + rivalOverview.total_sets > 0 ? (myOverview.total_sets / (myOverview.total_sets + rivalOverview.total_sets) * 100) : 50}%"></div>
            <div style="background:#ff453a;width:${myOverview.total_sets + rivalOverview.total_sets > 0 ? (rivalOverview.total_sets / (myOverview.total_sets + rivalOverview.total_sets) * 100) : 50}%"></div>
          </div>
        </div>

        <!-- Levantamiento Máximo -->
        <div class="pique-card">
          <div class="pique-card-header">
            <span>💥 Récord Máx</span>
            ${weightWinner === 'me' ? '<span class="challenge-crown">👑 Tú</span>' : weightWinner === 'rival' ? '<span class="challenge-crown">👑 Rival</span>' : ''}
          </div>
          <div class="pique-card-body">
            <div class="pique-side">
              <span class="pique-val ${weightWinner === 'me' ? 'winner-me' : ''}">${myOverview.max_weight || 0} <span style="font-size:11px;font-weight:600">kg</span></span>
              <span class="pique-lbl">Tú</span>
            </div>
            <div class="pique-side right">
              <span class="pique-val ${weightWinner === 'rival' ? 'winner-rival' : ''}">${rivalOverview.max_weight || 0} <span style="font-size:11px;font-weight:600">kg</span></span>
              <span class="pique-lbl">${_rivalEmail.split('@')[0]}</span>
            </div>
          </div>
          <div class="pique-mini-track">
            <div style="background:#0a84ff;width:${myOverview.max_weight + rivalOverview.max_weight > 0 ? (myOverview.max_weight / (myOverview.max_weight + rivalOverview.max_weight) * 100) : 50}%"></div>
            <div style="background:#ff453a;width:${myOverview.max_weight + rivalOverview.max_weight > 0 ? (rivalOverview.max_weight / (myOverview.max_weight + rivalOverview.max_weight) * 100) : 50}%"></div>
          </div>
        </div>
      </div>

      <!-- 4. Especialidades y Última Actividad -->
      <div class="pique-card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding-bottom:6px;border-bottom:1px solid var(--border2)">
          <span style="color:var(--text3);font-weight:600">🎯 Músculo Fuerte</span>
          <span style="color:var(--text)">
            <b style="color:var(--accent)">${myTop ? myTop.muscle : '—'}</b> vs <b style="color:var(--red)">${rivalTop ? rivalTop.muscle : '—'}</b>
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding-top:6px">
          <span style="color:var(--text3);font-weight:600">🕒 Último Entrenamiento</span>
          <span style="color:var(--text2);font-weight:600">
            ${formatDaysAgo(myOverview.last_workout)} · ${formatDaysAgo(rivalOverview.last_workout)}
          </span>
        </div>
      </div>

      <!-- 5. Modelo Anatómico Dual (Frente + Espalda) -->
      <div class="challenge-body-wrap">
        ${buildBodySVG(muscles, myMap, rivalMap, metric)}
      </div>

      <!-- 6. Desglose detallado por músculo -->
      <div class="challenge-muscle-list">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 2px 2px">
          Comparativa por Grupo Muscular (${metricLabel})
        </div>
        ${muscles.map(m => {
          const myVal = myMap[m]?.[metric] || 0;
          const rivalVal = rivalMap[m]?.[metric] || 0;
          const total = Math.max(myVal + rivalVal, 1);
          const myPct = myVal + rivalVal > 0 ? Math.round(myVal / (myVal + rivalVal) * 100) : 50;
          const mc = muscleClass(m);
          const winner = myVal > rivalVal ? 'me' : rivalVal > myVal ? 'rival' : 'tie';
          return `<div class="challenge-bar-row">
            <div class="challenge-bar-label">
              <span class="muscle-dot-sm mc-${mc}"></span>${m}
              ${winner === 'me' ? '<span class="challenge-crown">👑</span>' : ''}
            </div>
            <div class="challenge-bar-track">
              <div class="challenge-bar-me"    style="width:${winner === 'tie' ? '50' : myPct}%;${winner === 'tie' ? 'background:var(--text4)' : ''}"></div>
              <div class="challenge-bar-rival" style="width:${winner === 'tie' ? '50' : 100 - myPct}%;${winner === 'tie' ? 'background:var(--text4)' : ''}"></div>
            </div>
            <div class="challenge-bar-vals">
              <span class="${winner === 'me' ? 'ch-winner' : ''}">${metric === 'volume' ? formatTonnage(myVal) : formatBigNum(myVal)}</span>
              <span style="color:var(--text4)">·</span>
              <span class="${winner === 'rival' ? 'ch-winner-rival' : ''}">${metric === 'volume' ? formatTonnage(rivalVal) : formatBigNum(rivalVal)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text4);padding:8px 0">${metricLabel} · ${_challengePeriod === 'week' ? 'Esta semana' : _challengePeriod === 'month' ? 'Este mes' : 'Todo el tiempo'}</div>

      <!-- 7. Botones de acción -->
      ${await (async () => {
        const savedRivals = await sbGetSavedRivals();
        const isSaved = savedRivals.some(r => r.userId === _rivalUserId);
        return `
        <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:12px">
          <button class="btn btn-primary" style="flex:1" onclick="sendChallenge()">
            ⚔️ Enviar Reto a ${_rivalEmail.split('@')[0]}
          </button>
          <button class="btn ${isSaved ? 'btn-secondary' : 'btn-accent'}" style="flex:1" onclick="toggleSaveRival('${_rivalUserId}','${_rivalEmail}')">
            ${isSaved ? '⭐ Rival guardado' : '❤️ Guardar rival'}
          </button>
        </div>
        `;
      })()}
    `;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red)">Error al cargar datos: ${e.message}</div>`;
  }
}

// ── SVG anatómico profesional dual (Frente + Espalda) ─────────────────────────
function buildBodySVG(muscles, myMap, rivalMap, metric) {

  const getWinner = (m) => {
    const myVal = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    if (myVal === 0 && rivalVal === 0) return 'none';
    if (myVal > rivalVal) return 'me';
    if (rivalVal > myVal) return 'rival';
    return 'tie';
  };

  const getFill = (m) => {
    const w = getWinner(m);
    if (w === 'me') return 'url(#gradMe)';
    if (w === 'rival') return 'url(#gradRival)';
    if (w === 'tie') return 'url(#gradTie)';
    return '#2c2c30'; // Base neutral atlética
  };

  const getStroke = (m) => {
    const w = getWinner(m);
    if (w === 'me') return '#5ac8fa';
    if (w === 'rival') return '#ff6961';
    if (w === 'tie') return '#8e8e93';
    return 'rgba(255,255,255,0.08)';
  };

  const getOpacity = (m) => {
    const w = getWinner(m);
    return w === 'none' ? 0.45 : 1;
  };

  const svg = `<svg viewBox="0 0 380 295" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;max-width:340px;display:block;margin:0 auto;user-select:none">
    <defs>
      <!-- Gradiente Tú (Azul eléctrico neón) -->
      <linearGradient id="gradMe" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a84ff"/>
        <stop offset="100%" stop-color="#0062cc"/>
      </linearGradient>

      <!-- Gradiente Rival (Rojo carmesí intenso) -->
      <linearGradient id="gradRival" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff453a"/>
        <stop offset="100%" stop-color="#cc241d"/>
      </linearGradient>

      <!-- Gradiente Empate -->
      <linearGradient id="gradTie" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8e8e93"/>
        <stop offset="100%" stop-color="#636366"/>
      </linearGradient>

      <!-- Sombra suave para músculos activos -->
      <filter id="muscleGlow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.4)"/>
      </filter>
    </defs>

    <!-- ==================== TÍTULOS DE VISTA ==================== -->
    <text x="100" y="16" fill="var(--text3)" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="1.2">FRENTE</text>
    <text x="280" y="16" fill="var(--text3)" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="1.2">ESPALDA</text>
    <line x1="190" y1="18" x2="190" y2="280" stroke="var(--border2)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>

    <!-- ==================== 1. VISTA FRONTAL (X center = 100) ==================== -->
    <!-- Cabeza -->
    <path d="M92 28 C92 20 108 20 108 28 C108 38 104 44 100 46 C96 44 92 38 92 28 Z" fill="#3a3a40" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>
    <!-- Cuello / Base -->
    <path d="M96 46 L104 46 L108 55 L92 55 Z" fill="#2c2c32"/>

    <!-- Hombros (Deltoides) -->
    <path d="M88 56 C74 58 64 69 62 84 C68 86 77 82 81 72 C84 66 88 60 88 56 Z"
      fill="${getFill('Hombros')}" stroke="${getStroke('Hombros')}" stroke-width="0.8" opacity="${getOpacity('Hombros')}" filter="url(#muscleGlow)"/>
    <path d="M112 56 C126 58 136 69 138 84 C132 86 123 82 119 72 C116 66 112 60 112 56 Z"
      fill="${getFill('Hombros')}" stroke="${getStroke('Hombros')}" stroke-width="0.8" opacity="${getOpacity('Hombros')}" filter="url(#muscleGlow)"/>

    <!-- Pecho -->
    <path d="M89 57 C98 58 100 60 100 86 C91 89 79 88 75 78 C73 70 79 61 89 57 Z"
      fill="${getFill('Pecho')}" stroke="${getStroke('Pecho')}" stroke-width="0.8" opacity="${getOpacity('Pecho')}" filter="url(#muscleGlow)"/>
    <path d="M111 57 C102 58 100 60 100 86 C109 89 121 88 125 78 C127 70 121 61 111 57 Z"
      fill="${getFill('Pecho')}" stroke="${getStroke('Pecho')}" stroke-width="0.8" opacity="${getOpacity('Pecho')}" filter="url(#muscleGlow)"/>

    <!-- Bíceps -->
    <path d="M62 86 C58 96 56 112 61 122 C69 122 75 114 77 100 C77 90 73 84 62 86 Z"
      fill="${getFill('Bíceps')}" stroke="${getStroke('Bíceps')}" stroke-width="0.8" opacity="${getOpacity('Bíceps')}" filter="url(#muscleGlow)"/>
    <path d="M138 86 C142 96 144 112 139 122 C131 122 125 114 123 100 C123 90 127 84 138 86 Z"
      fill="${getFill('Bíceps')}" stroke="${getStroke('Bíceps')}" stroke-width="0.8" opacity="${getOpacity('Bíceps')}" filter="url(#muscleGlow)"/>

    <!-- Antebrazos -->
    <path d="M61 124 C53 136 51 154 55 164 C61 164 69 154 71 140 C71 130 67 124 61 124 Z"
      fill="${getFill('Antebrazo')}" stroke="${getStroke('Antebrazo')}" stroke-width="0.8" opacity="${getOpacity('Antebrazo')}" filter="url(#muscleGlow)"/>
    <path d="M139 124 C147 136 149 154 145 164 C139 164 131 154 129 140 C129 130 133 124 139 124 Z"
      fill="${getFill('Antebrazo')}" stroke="${getStroke('Antebrazo')}" stroke-width="0.8" opacity="${getOpacity('Antebrazo')}" filter="url(#muscleGlow)"/>
    <!-- Manos -->
    <ellipse cx="55" cy="172" rx="4.5" ry="6.5" fill="#3a3a40"/>
    <ellipse cx="145" cy="172" rx="4.5" ry="6.5" fill="#3a3a40"/>

    <!-- Core / Abdomen + Oblicuos -->
    <path d="M88 89 C94 88 106 88 112 89 L111 136 C105 140 95 140 89 136 Z"
      fill="${getFill('Core / Abdomen')}" stroke="${getStroke('Core / Abdomen')}" stroke-width="0.8" opacity="${getOpacity('Core / Abdomen')}" filter="url(#muscleGlow)"/>
    <path d="M76 89 C83 93 87 101 87 127 C83 135 77 131 75 123 C73 109 73 97 76 89 Z"
      fill="${getFill('Core / Abdomen')}" stroke="${getStroke('Core / Abdomen')}" stroke-width="0.8" opacity="${getOpacity('Core / Abdomen')}" filter="url(#muscleGlow)"/>
    <path d="M124 89 C117 93 113 101 113 127 C117 135 123 131 125 123 C127 109 127 97 124 89 Z"
      fill="${getFill('Core / Abdomen')}" stroke="${getStroke('Core / Abdomen')}" stroke-width="0.8" opacity="${getOpacity('Core / Abdomen')}" filter="url(#muscleGlow)"/>
    <!-- Líneas de definición de abdominales -->
    <line x1="100" y1="89" x2="100" y2="136" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>
    <line x1="91" y1="104" x2="109" y2="104" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>
    <line x1="92" y1="119" x2="108" y2="119" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>

    <!-- Caderas / Pelvis -->
    <path d="M81 138 C93 143 107 143 119 138 L121 152 C111 157 89 157 79 152 Z" fill="#26262a"/>

    <!-- Cuádriceps (Piernas) -->
    <path d="M79 154 C83 156 97 158 98 180 C98 200 94 216 88 220 C80 218 72 200 72 180 C72 166 75 156 79 154 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <path d="M121 154 C117 156 103 158 102 180 C102 200 106 216 112 220 C120 218 128 200 128 180 C128 166 125 156 121 154 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <!-- Rodillas -->
    <ellipse cx="85" cy="225" rx="5" ry="3.5" fill="#3a3a40"/>
    <ellipse cx="115" cy="225" rx="5" ry="3.5" fill="#3a3a40"/>

    <!-- Gemelos / Espinillas -->
    <path d="M80 230 C87 230 92 238 90 260 C88 268 84 270 81 270 C78 268 75 254 76 240 C76 234 79 230 80 230 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <path d="M120 230 C113 230 108 238 110 260 C112 268 116 270 119 270 C122 268 125 254 124 240 C124 234 121 230 120 230 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <!-- Pies -->
    <ellipse cx="80" cy="276" rx="6.5" ry="3.5" fill="#3a3a40"/>
    <ellipse cx="120" cy="276" rx="6.5" ry="3.5" fill="#3a3a40"/>


    <!-- ==================== 2. VISTA DORSAL (X center = 280) ==================== -->
    <!-- Cabeza posterior -->
    <path d="M272 28 C272 20 288 20 288 28 C288 38 284 44 280 46 C276 44 272 38 272 28 Z" fill="#3a3a40" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>
    <!-- Cuello -->
    <path d="M276 46 L284 46 L288 55 L272 55 Z" fill="#2c2c32"/>

    <!-- Deltoides posterior (Hombros) -->
    <path d="M268 56 C254 58 244 69 242 84 C248 86 256 80 260 70 Z"
      fill="${getFill('Hombros')}" stroke="${getStroke('Hombros')}" stroke-width="0.8" opacity="${getOpacity('Hombros')}" filter="url(#muscleGlow)"/>
    <path d="M292 56 C306 58 316 69 318 84 C312 86 304 80 300 70 Z"
      fill="${getFill('Hombros')}" stroke="${getStroke('Hombros')}" stroke-width="0.8" opacity="${getOpacity('Hombros')}" filter="url(#muscleGlow)"/>

    <!-- Espalda (Trapecios + Dorsales en V + Lumbar) -->
    <!-- Trapecios -->
    <path d="M273 53 C276 47 284 47 287 53 L298 70 C288 75 272 75 262 70 Z"
      fill="${getFill('Espalda')}" stroke="${getStroke('Espalda')}" stroke-width="0.8" opacity="${getOpacity('Espalda')}" filter="url(#muscleGlow)"/>
    <!-- Dorsales (Lats V-taper) -->
    <path d="M258 70 C272 74 288 74 302 70 C305 92 297 118 287 130 C280 132 272 130 263 118 C255 92 258 78 258 70 Z"
      fill="${getFill('Espalda')}" stroke="${getStroke('Espalda')}" stroke-width="0.8" opacity="${getOpacity('Espalda')}" filter="url(#muscleGlow)"/>
    <!-- Lumbar -->
    <path d="M270 130 C277 132 283 132 290 130 L288 145 C283 147 277 147 272 145 Z"
      fill="${getFill('Espalda')}" stroke="${getStroke('Espalda')}" stroke-width="0.8" opacity="${getOpacity('Espalda')}" filter="url(#muscleGlow)"/>
    <!-- Línea espinal -->
    <line x1="280" y1="55" x2="280" y2="145" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>

    <!-- Tríceps -->
    <path d="M242 86 C238 98 236 114 242 122 C250 122 256 114 258 98 C258 88 254 84 242 86 Z"
      fill="${getFill('Tríceps')}" stroke="${getStroke('Tríceps')}" stroke-width="0.8" opacity="${getOpacity('Tríceps')}" filter="url(#muscleGlow)"/>
    <path d="M318 86 C322 98 324 114 318 122 C310 122 304 114 302 98 C302 88 306 84 318 86 Z"
      fill="${getFill('Tríceps')}" stroke="${getStroke('Tríceps')}" stroke-width="0.8" opacity="${getOpacity('Tríceps')}" filter="url(#muscleGlow)"/>

    <!-- Antebrazos posteriores -->
    <path d="M241 124 C233 136 231 154 235 164 C241 164 249 154 251 140 C251 130 247 124 241 124 Z"
      fill="${getFill('Antebrazo')}" stroke="${getStroke('Antebrazo')}" stroke-width="0.8" opacity="${getOpacity('Antebrazo')}" filter="url(#muscleGlow)"/>
    <path d="M319 124 C327 136 329 154 325 164 C319 164 311 154 309 140 C309 130 313 124 319 124 Z"
      fill="${getFill('Antebrazo')}" stroke="${getStroke('Antebrazo')}" stroke-width="0.8" opacity="${getOpacity('Antebrazo')}" filter="url(#muscleGlow)"/>
    <!-- Manos -->
    <ellipse cx="235" cy="172" rx="4.5" ry="6.5" fill="#3a3a40"/>
    <ellipse cx="325" cy="172" rx="4.5" ry="6.5" fill="#3a3a40"/>

    <!-- Glúteos -->
    <path d="M262 147 C272 145 279 146 279 169 C279 185 272 193 263 189 C257 183 257 163 262 147 Z"
      fill="${getFill('Glúteos')}" stroke="${getStroke('Glúteos')}" stroke-width="0.8" opacity="${getOpacity('Glúteos')}" filter="url(#muscleGlow)"/>
    <path d="M298 147 C288 145 281 146 281 169 C281 185 288 193 297 189 C303 183 303 163 298 147 Z"
      fill="${getFill('Glúteos')}" stroke="${getStroke('Glúteos')}" stroke-width="0.8" opacity="${getOpacity('Glúteos')}" filter="url(#muscleGlow)"/>

    <!-- Isquiotibiales / Femorales (Piernas) -->
    <path d="M260 191 C266 193 277 191 277 217 C273 221 265 221 257 217 C253 209 255 199 260 191 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <path d="M300 191 C294 193 283 191 283 217 C287 221 295 221 303 217 C307 209 305 199 300 191 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <!-- Rodilla posterior -->
    <ellipse cx="266" cy="225" rx="5" ry="3.5" fill="#3a3a40"/>
    <ellipse cx="294" cy="225" rx="5" ry="3.5" fill="#3a3a40"/>

    <!-- Gemelos posteriores (Piernas) -->
    <path d="M258 230 C268 228 275 232 273 256 C271 266 267 270 262 270 C257 268 253 256 255 240 C255 234 257 230 258 230 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <path d="M302 230 C292 228 285 232 287 256 C289 266 293 270 298 270 C303 268 307 256 305 240 C305 234 303 230 302 230 Z"
      fill="${getFill('Piernas')}" stroke="${getStroke('Piernas')}" stroke-width="0.8" opacity="${getOpacity('Piernas')}" filter="url(#muscleGlow)"/>
    <!-- Pies -->
    <ellipse cx="261" cy="276" rx="6.5" ry="3.5" fill="#3a3a40"/>
    <ellipse cx="299" cy="276" rx="6.5" ry="3.5" fill="#3a3a40"/>
  </svg>`;

  const legend = `
  <div style="display:flex;justify-content:center;gap:16px;margin-top:10px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700">
      <span style="width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg, #0a84ff, #0062cc);box-shadow:0 0 8px rgba(10,132,255,0.4);display:inline-block"></span>Tú
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700">
      <span style="width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg, #ff453a, #cc241d);box-shadow:0 0 8px rgba(255,69,58,0.4);display:inline-block"></span>${_rivalEmail.split('@')[0]}
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text3)">
      <span style="width:12px;height:12px;border-radius:3px;background:#2c2c30;border:1px solid rgba(255,255,255,0.15);display:inline-block"></span>Sin datos / Empate
    </div>
  </div>`;

  return svg + legend;
}

// ── Enviar reto ───────────────────────────────────────
async function sendChallenge() {
  if (!_rivalUserId) return;
  try {
    const ok = await sbCreateChallenge(_rivalUserId, _challengeMetric, _challengePeriod, null);
    if (ok) showToast('⚔️ Reto enviado');
    else showToast('Error al enviar el reto');
  } catch { showToast('Error al enviar el reto'); }
}

// ── Cambiar métrica/periodo ───────────────────────────
function setChallengeMetric(metric, btn) {
  _challengeMetric = metric;
  document.querySelectorAll('#challengeMetricFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  if (_rivalUserId) renderRivalComparison();
}

function setChallengePeriod(period, btn) {
  _challengePeriod = period;
  document.querySelectorAll('#challengePeriodFilter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  if (_rivalUserId) renderRivalComparison();
}
