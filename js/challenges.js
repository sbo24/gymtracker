/* ===================================================
   challenges.js — Retos entre usuarios
   =================================================== */
'use strict';

// ── Estado ────────────────────────────────────────────
let _challengeMetric = 'volume';  // 'volume' | 'max_weight' | 'sets'
let _challengePeriod = 'week';    // 'week' | 'month' | 'all'
let _rivalUserId     = null;
let _rivalEmail      = '';

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
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/muscle_stats?user_id=eq.${userId}&period=eq.${period}&select=muscle,volume,max_weight,sets`,
    { headers: authHeaders() }
  );
  if (!r.ok) return [];
  return r.json();
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
    week:  getMonday(new Date()).toISOString().split('T')[0],
    month: new Date().toISOString().slice(0, 7) + '-01',
    all:   '2000-01-01'
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
        stats[muscle].volume     += seriesVol(s);
        stats[muscle].max_weight  = Math.max(stats[muscle].max_weight, s.weight || 0);
        stats[muscle].sets       += 1;
      });
    });
    MUSCLE_ORDER.forEach(muscle => {
      rows.push({
        user_id: uid, muscle, period,
        volume:     Math.round(stats[muscle]?.volume || 0),
        max_weight: stats[muscle]?.max_weight || 0,
        sets:       stats[muscle]?.sets || 0,
        updated_at: new Date().toISOString()
      });
    });
  }
  await sbUpsertMuscleStats(rows);
}

function getMonday(d) {
  const day = new Date(d);
  const diff = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - diff);
  day.setHours(0, 0, 0, 0);
  return day;
}

// ── Renderizado principal ─────────────────────────────
async function renderChallenges() {
  const el = document.getElementById('viewChallenges');
  if (!el) return;

  // Publicar mis stats al abrir la sección
  publishMuscleStats().catch(() => {});

  // Notificaciones
  renderChallengeNotifications();

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
  } catch {}
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
    const users = await sbSearchUsers(q);
    if (!users.length) {
      resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3)">Sin resultados</div>';
      return;
    }
    resultsEl.innerHTML = users.map(u => `
      <div class="rival-result" onclick="selectRival('${u.user_id}','${u.masked_email}')">
        <div class="rival-avatar">${u.masked_email[0].toUpperCase()}</div>
        <div class="rival-email">${u.masked_email}</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('');
  } catch {
    resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--red)">Error al buscar</div>';
  }
}

function selectRival(userId, maskedEmail) {
  _rivalUserId = userId;
  _rivalEmail  = maskedEmail;
  document.getElementById('rivalSearchResults').innerHTML = '';
  document.getElementById('rivalSearchInput').value = maskedEmail;
  document.getElementById('challengeRivalName').textContent = maskedEmail;
  document.getElementById('challengeRivalSection').style.display = 'block';
  renderRivalComparison();
}

// ── Comparativa visual ────────────────────────────────
async function renderRivalComparison() {
  if (!_rivalUserId || !_currentUser) return;
  const el = document.getElementById('challengeComparison');
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';

  try {
    const [myStats, rivalStats] = await Promise.all([
      sbGetMuscleStats(_currentUser.id, _challengePeriod),
      sbGetMuscleStats(_rivalUserId, _challengePeriod)
    ]);

    const myMap     = Object.fromEntries(myStats.map(s => [s.muscle, s]));
    const rivalMap  = Object.fromEntries(rivalStats.map(s => [s.muscle, s]));
    const metric    = _challengeMetric;
    const metricLabel = { volume: 'Volumen (kg)', max_weight: 'Peso máx (kg)', sets: 'Series' }[metric];

    // Calcular puntuación global
    let myWins = 0, rivalWins = 0, ties = 0;
    const muscles = MUSCLE_ORDER.filter(m => m !== 'Cardio' && m !== 'Otro');

    muscles.forEach(m => {
      const myVal    = myMap[m]?.[metric] || 0;
      const rivalVal = rivalMap[m]?.[metric] || 0;
      if (myVal > rivalVal) myWins++;
      else if (rivalVal > myVal) rivalWins++;
      else ties++;
    });

    const myPct    = Math.round(myWins / muscles.length * 100);
    const rivalPct = Math.round(rivalWins / muscles.length * 100);

    el.innerHTML = `
      <!-- Marcador global -->
      <div class="challenge-scoreboard">
        <div class="challenge-player ${myWins >= rivalWins ? 'winner' : ''}">
          <div class="challenge-player-avatar">Tú</div>
          <div class="challenge-player-score">${myWins}</div>
          <div class="challenge-player-label">grupos ganados</div>
        </div>
        <div class="challenge-vs">vs</div>
        <div class="challenge-player ${rivalWins > myWins ? 'winner' : ''}">
          <div class="challenge-player-avatar">${_rivalEmail[0].toUpperCase()}</div>
          <div class="challenge-player-score">${rivalWins}</div>
          <div class="challenge-player-label">grupos ganados</div>
        </div>
      </div>
      ${ties ? `<div style="text-align:center;font-size:12px;color:var(--text3);margin:-4px 0 8px">${ties} empate${ties>1?'s':''}</div>` : ''}

      <!-- Diagrama SVG del cuerpo -->
      <div class="challenge-body-wrap">
        ${buildBodySVG(muscles, myMap, rivalMap, metric)}
      </div>

      <!-- Barras por músculo -->
      <div class="challenge-muscle-list">
        ${muscles.map(m => {
          const myVal    = myMap[m]?.[metric] || 0;
          const rivalVal = rivalMap[m]?.[metric] || 0;
          const total    = Math.max(myVal + rivalVal, 1);
          const myPct    = Math.round(myVal / total * 100);
          const mc       = muscleClass(m);
          const winner   = myVal > rivalVal ? 'me' : rivalVal > myVal ? 'rival' : 'tie';
          return `<div class="challenge-bar-row">
            <div class="challenge-bar-label">
              <span class="muscle-dot-sm mc-${mc}"></span>${m}
              ${winner === 'me' ? '<span class="challenge-crown">👑</span>' : ''}
            </div>
            <div class="challenge-bar-track">
              <div class="challenge-bar-me"    style="width:${myPct}%"></div>
              <div class="challenge-bar-rival" style="width:${100-myPct}%"></div>
            </div>
            <div class="challenge-bar-vals">
              <span class="${winner === 'me' ? 'ch-winner' : ''}">${formatBigNum(myVal)}</span>
              <span style="color:var(--text4)">·</span>
              <span class="${winner === 'rival' ? 'ch-winner-rival' : ''}">${formatBigNum(rivalVal)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text4);padding:8px 0">${metricLabel} · ${_challengePeriod === 'week' ? 'Esta semana' : _challengePeriod === 'month' ? 'Este mes' : 'Todo el tiempo'}</div>

      <!-- Botón retar -->
      <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="sendChallenge()">
        ⚔️ Enviar reto a ${_rivalEmail}
      </button>
    `;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red)">Error al cargar datos: ${e.message}</div>`;
  }
}

// ── SVG interactivo del cuerpo ────────────────────────
function buildBodySVG(muscles, myMap, rivalMap, metric) {
  // Mapa de músculos a posiciones aproximadas en el SVG del cuerpo (vista frontal)
  const muscleRegions = {
    'Pecho':         { cx: 50,  cy: 30, r: 14 },
    'Hombros':       { cx: 50,  cy: 22, r: 10 },
    'Bíceps':        { cx: 50,  cy: 35, r: 7  },
    'Tríceps':       { cx: 50,  cy: 38, r: 7  },
    'Antebrazo':     { cx: 50,  cy: 44, r: 5  },
    'Espalda':       { cx: 50,  cy: 32, r: 14 },
    'Core / Abdomen':{ cx: 50,  cy: 50, r: 10 },
    'Piernas':       { cx: 50,  cy: 67, r: 14 },
    'Glúteos':       { cx: 50,  cy: 58, r: 10 },
  };

  const circles = muscles.map(m => {
    const region = muscleRegions[m];
    if (!region) return '';
    const myVal    = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    const color = myVal > rivalVal ? '#0a84ff' : rivalVal > myVal ? '#ff3b30' : '#8e8e93';
    const label = m.split('/')[0].trim().slice(0, 4);
    return `<g>
      <circle cx="${region.cx}%" cy="${region.cy}%" r="${region.r}" fill="${color}" opacity="0.7" />
      <text x="${region.cx}%" y="${region.cy}%" text-anchor="middle" dominant-baseline="middle"
        fill="white" font-size="8" font-weight="700">${label}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 100 100" style="width:100%;max-width:200px;margin:0 auto;display:block">
    <!-- Silueta simple del cuerpo -->
    <ellipse cx="50" cy="12" rx="8" ry="9" fill="var(--bg3)" />
    <rect x="32" y="21" width="36" height="38" rx="8" fill="var(--bg3)" />
    <rect x="18" y="22" width="12" height="28" rx="5" fill="var(--bg3)" />
    <rect x="70" y="22" width="12" height="28" rx="5" fill="var(--bg3)" />
    <rect x="34" y="59" width="14" height="32" rx="6" fill="var(--bg3)" />
    <rect x="52" y="59" width="14" height="32" rx="6" fill="var(--bg3)" />
    ${circles}
  </svg>
  <div style="display:flex;justify-content:center;gap:16px;margin-top:6px;font-size:11px">
    <span><span style="color:#0a84ff">●</span> Tú</span>
    <span><span style="color:#ff3b30">●</span> ${_rivalEmail.split('@')[0]}</span>
    <span><span style="color:#8e8e93">●</span> Empate</span>
  </div>`;
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
