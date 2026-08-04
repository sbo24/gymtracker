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
          const myPct    = myVal + rivalVal > 0 ? Math.round(myVal / (myVal + rivalVal) * 100) : 50;
          const mc       = muscleClass(m);
          const winner   = myVal > rivalVal ? 'me' : rivalVal > myVal ? 'rival' : 'tie';
          return `<div class="challenge-bar-row">
            <div class="challenge-bar-label">
              <span class="muscle-dot-sm mc-${mc}"></span>${m}
              ${winner === 'me' ? '<span class="challenge-crown">👑</span>' : ''}
            </div>
            <div class="challenge-bar-track">
              <div class="challenge-bar-me"    style="width:${winner === 'tie' ? '50' : myPct}%;${winner === 'tie' ? 'background:var(--text4)' : ''}"></div>
              <div class="challenge-bar-rival" style="width:${winner === 'tie' ? '50' : 100-myPct}%;${winner === 'tie' ? 'background:var(--text4)' : ''}"></div>
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
        ⚔️ Añadir como rival a ${_rivalEmail}
      </button>
    `;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red)">Error al cargar datos: ${e.message}</div>`;
  }
}

// ── SVG anatómico del cuerpo ─────────────────────────
function buildBodySVG(muscles, myMap, rivalMap, metric) {

  const getColor = (m) => {
    const myVal    = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    if (myVal === 0 && rivalVal === 0) return null; // sin datos → color base
    if (myVal > rivalVal) return '#0a84ff';
    if (rivalVal > myVal) return '#ff3b30';
    return '#636366';
  };

  const muscleColor = (m) => getColor(m) || 'rgba(140,140,160,0.25)';
  const muscleOpacity = (m) => {
    const myVal    = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    return (myVal === 0 && rivalVal === 0) ? 0.2 : 0.85;
  };

  // SVG anatómico detallado — viewBox 0 0 300 560
  const svg = `<svg viewBox="0 0 300 560" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;max-width:200px;display:block;margin:0 auto;pointer-events:none;touch-action:pan-y">
    <defs>
      <filter id="bodyGlow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- ── BASE: silueta neutra ─────────────────────── -->
    <!-- Cabeza -->
    <ellipse cx="150" cy="38" rx="32" ry="36" fill="#b0b0c0" opacity="0.5"/>
    <!-- Cuello -->
    <rect x="136" y="70" width="28" height="22" rx="8" fill="#b0b0c0" opacity="0.4"/>
    <!-- Manos -->
    <ellipse cx="32"  cy="290" rx="18" ry="22" fill="#b0b0c0" opacity="0.4"/>
    <ellipse cx="268" cy="290" rx="18" ry="22" fill="#b0b0c0" opacity="0.4"/>
    <!-- Rodillas -->
    <ellipse cx="112" cy="400" rx="20" ry="14" fill="#b0b0c0" opacity="0.3"/>
    <ellipse cx="188" cy="400" rx="20" ry="14" fill="#b0b0c0" opacity="0.3"/>
    <!-- Pies -->
    <ellipse cx="106" cy="545" rx="22" ry="12" fill="#b0b0c0" opacity="0.4"/>
    <ellipse cx="194" cy="545" rx="22" ry="12" fill="#b0b0c0" opacity="0.4"/>

    <!-- ── HOMBROS ─────────────────────────────────── -->
    <ellipse cx="72"  cy="105" rx="26" ry="22" fill="${muscleColor('Hombros')}" opacity="${muscleOpacity('Hombros')}"/>
    <ellipse cx="228" cy="105" rx="26" ry="22" fill="${muscleColor('Hombros')}" opacity="${muscleOpacity('Hombros')}"/>

    <!-- ── PECHO ──────────────────────────────────── -->
    <path d="M100 92 Q150 88 200 92 L198 142 Q170 155 150 157 Q130 155 102 142 Z"
      fill="${muscleColor('Pecho')}" opacity="${muscleOpacity('Pecho')}"/>

    <!-- ── BÍCEPS ─────────────────────────────────── -->
    <path d="M54 120 Q38 128 32 160 L38 200 Q52 205 62 195 L70 155 Q72 130 64 118 Z"
      fill="${muscleColor('Bíceps')}" opacity="${muscleOpacity('Bíceps')}"/>
    <path d="M246 120 Q262 128 268 160 L262 200 Q248 205 238 195 L230 155 Q228 130 236 118 Z"
      fill="${muscleColor('Bíceps')}" opacity="${muscleOpacity('Bíceps')}"/>

    <!-- ── TRÍCEPS (laterales) ─────────────────────── -->
    <path d="M50 122 Q34 115 28 148 L34 185 Q44 192 52 185 L58 148 Q58 128 52 120 Z"
      fill="${muscleColor('Tríceps')}" opacity="${muscleOpacity('Tríceps') * 0.7}"/>
    <path d="M250 122 Q266 115 272 148 L266 185 Q256 192 248 185 L242 148 Q242 128 248 120 Z"
      fill="${muscleColor('Tríceps')}" opacity="${muscleOpacity('Tríceps') * 0.7}"/>

    <!-- ── ANTEBRAZO ──────────────────────────────── -->
    <path d="M38 202 Q24 215 26 255 L38 268 Q50 268 56 254 L58 208 Z"
      fill="${muscleColor('Antebrazo')}" opacity="${muscleOpacity('Antebrazo')}"/>
    <path d="M262 202 Q276 215 274 255 L262 268 Q250 268 244 254 L242 208 Z"
      fill="${muscleColor('Antebrazo')}" opacity="${muscleOpacity('Antebrazo')}"/>

    <!-- ── CORE / ABDOMEN ─────────────────────────── -->
    <path d="M104 155 Q130 160 150 162 Q170 160 196 155 L194 248 Q172 260 150 262 Q128 260 106 248 Z"
      fill="${muscleColor('Core / Abdomen')}" opacity="${muscleOpacity('Core / Abdomen')}"/>

    <!-- ── GLÚTEOS ────────────────────────────────── -->
    <path d="M106 250 Q128 264 150 266 Q172 264 194 250 L196 295 Q175 310 150 312 Q125 310 104 295 Z"
      fill="${muscleColor('Glúteos')}" opacity="${muscleOpacity('Glúteos')}"/>

    <!-- ── PIERNAS (cuádriceps) ───────────────────── -->
    <!-- Muslo izq -->
    <path d="M104 295 Q125 312 134 320 L128 395 Q118 408 106 404 L92 320 Q96 305 104 295 Z"
      fill="${muscleColor('Piernas')}" opacity="${muscleOpacity('Piernas')}"/>
    <!-- Muslo der -->
    <path d="M196 295 Q175 312 166 320 L172 395 Q182 408 194 404 L208 320 Q204 305 196 295 Z"
      fill="${muscleColor('Piernas')}" opacity="${muscleOpacity('Piernas')}"/>
    <!-- Gemelo izq -->
    <path d="M94 415 Q100 412 118 415 L120 470 Q118 485 106 488 Q94 485 90 470 Z"
      fill="${muscleColor('Piernas')}" opacity="${muscleOpacity('Piernas') * 0.8}"/>
    <!-- Gemelo der -->
    <path d="M206 415 Q200 412 182 415 L180 470 Q182 485 194 488 Q206 485 210 470 Z"
      fill="${muscleColor('Piernas')}" opacity="${muscleOpacity('Piernas') * 0.8}"/>

    <!-- ── ESPALDA (deltoides posterior, visible) ─── -->
    <path d="M100 92 Q80 95 72 105 L84 155 Q95 158 104 155 Z"
      fill="${muscleColor('Espalda')}" opacity="${muscleOpacity('Espalda') * 0.4}"/>
    <path d="M200 92 Q220 95 228 105 L216 155 Q205 158 196 155 Z"
      fill="${muscleColor('Espalda')}" opacity="${muscleOpacity('Espalda') * 0.4}"/>

    <!-- Líneas de definición muscular (detalle) -->
    <line x1="150" y1="92" x2="150" y2="157" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <line x1="150" y1="162" x2="150" y2="248" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <ellipse cx="150" cy="112" rx="18" ry="8" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <ellipse cx="150" cy="130" rx="18" ry="8" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <ellipse cx="150" cy="148" rx="16" ry="7" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <ellipse cx="150" cy="165" rx="16" ry="7" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <ellipse cx="150" cy="182" rx="14" ry="7" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <ellipse cx="150" cy="199" rx="14" ry="7" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  </svg>`;

  const legend = `
  <div style="display:flex;justify-content:center;gap:12px;margin-top:8px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600">
      <span style="width:10px;height:10px;border-radius:2px;background:#0a84ff;display:inline-block"></span>Tú
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600">
      <span style="width:10px;height:10px;border-radius:2px;background:#ff3b30;display:inline-block"></span>${_rivalEmail.split('@')[0]}
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3)">
      <span style="width:10px;height:10px;border-radius:2px;background:#636366;display:inline-block"></span>Empate
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
