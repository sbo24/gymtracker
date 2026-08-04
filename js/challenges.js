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
        ⚔️ Enviar reto a ${_rivalEmail}
      </button>
    `;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red)">Error al cargar datos: ${e.message}</div>`;
  }
}

// ── SVG interactivo del cuerpo ────────────────────────
function buildBodySVG(muscles, myMap, rivalMap, metric) {
  // Regiones musculares mapeadas a paths del cuerpo humano SVG (viewBox 0 0 200 400)
  const muscleRegions = {
    'Pecho':          { x: 72, y: 105, w: 56, h: 38, label: 'Pecho' },
    'Hombros':        { x: 58, y: 82,  w: 84, h: 28, label: 'Hombros' },
    'Bíceps':         { x: 42, y: 118, w: 22, h: 40, label: 'Bíc' },
    'Tríceps':        { x: 136,y: 118, w: 22, h: 40, label: 'Trí' },
    'Antebrazo':      { x: 38, y: 162, w: 20, h: 34, label: 'Ant' },
    'Core / Abdomen': { x: 72, y: 145, w: 56, h: 48, label: 'Core' },
    'Espalda':        { x: 72, y: 95,  w: 56, h: 90, label: 'Espalda' },
    'Glúteos':        { x: 72, y: 195, w: 56, h: 34, label: 'Glúteos' },
    'Piernas':        { x: 68, y: 230, w: 64, h: 100,label: 'Piernas' },
  };

  const getColor = (m) => {
    const myVal    = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    if (myVal === 0 && rivalVal === 0) return '#3a3a3c';
    if (myVal > rivalVal) return '#0a84ff';
    if (rivalVal > myVal) return '#ff3b30';
    return '#636366';
  };

  const rects = Object.entries(muscleRegions).map(([m, r]) => {
    const color = getColor(m);
    const myVal    = myMap[m]?.[metric] || 0;
    const rivalVal = rivalMap[m]?.[metric] || 0;
    const opacity  = (myVal === 0 && rivalVal === 0) ? 0.15 : 0.75;
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6"
      fill="${color}" opacity="${opacity}" />
    <text x="${r.x + r.w/2}" y="${r.y + r.h/2 + 4}" text-anchor="middle"
      fill="white" font-size="9" font-weight="700" opacity="${opacity > 0.3 ? 1 : 0.4}">${r.label}</text>`;
  }).join('');

  return `
  <div style="display:flex;gap:16px;align-items:flex-start">
    <!-- Vista frontal -->
    <div style="flex:1;text-align:center">
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">FRONTAL</div>
      <svg viewBox="0 0 200 400" style="width:100%;max-width:140px;margin:0 auto;display:block">
        <!-- Cabeza -->
        <ellipse cx="100" cy="32" rx="22" ry="26" fill="var(--bg4)" />
        <!-- Cuello -->
        <rect x="91" y="55" width="18" height="18" rx="4" fill="var(--bg4)" />
        <!-- Torso -->
        <path d="M55 73 Q50 75 47 90 L44 185 Q44 195 55 198 L100 202 L145 198 Q156 195 156 185 L153 90 Q150 75 145 73 Z" fill="var(--bg4)" />
        <!-- Brazo izq -->
        <path d="M47 80 Q30 85 28 120 L26 170 Q26 178 35 178 L48 178 L55 120 L55 80 Z" fill="var(--bg4)" />
        <!-- Brazo der -->
        <path d="M153 80 Q170 85 172 120 L174 170 Q174 178 165 178 L152 178 L145 120 L145 80 Z" fill="var(--bg4)" />
        <!-- Pierna izq -->
        <path d="M60 198 L55 310 Q54 325 65 328 L85 328 L92 198 Z" fill="var(--bg4)" />
        <!-- Pierna der -->
        <path d="M140 198 L145 310 Q146 325 135 328 L115 328 L108 198 Z" fill="var(--bg4)" />
        <!-- Pie izq -->
        <ellipse cx="67" cy="335" rx="16" ry="8" fill="var(--bg4)" />
        <!-- Pie der -->
        <ellipse cx="133" cy="335" rx="16" ry="8" fill="var(--bg4)" />
        <!-- Superposición músculos -->
        ${rects}
      </svg>
    </div>

    <!-- Leyenda -->
    <div style="flex:1;padding-top:24px">
      <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:10px">Leyenda</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px">
          <span style="width:12px;height:12px;border-radius:3px;background:#0a84ff;display:inline-block"></span>
          <span style="color:var(--text)">Tú ganas</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px">
          <span style="width:12px;height:12px;border-radius:3px;background:#ff3b30;display:inline-block"></span>
          <span style="color:var(--text)">${_rivalEmail.split('@')[0]} gana</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px">
          <span style="width:12px;height:12px;border-radius:3px;background:#636366;display:inline-block"></span>
          <span style="color:var(--text3)">Empate</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px">
          <span style="width:12px;height:12px;border-radius:3px;background:#3a3a3c;opacity:0.5;display:inline-block"></span>
          <span style="color:var(--text3)">Sin datos</span>
        </div>
      </div>
    </div>
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
