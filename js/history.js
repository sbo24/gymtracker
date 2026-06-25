/* ===================================================
   history.js — History view
   =================================================== */
'use strict';

let historyFilter = 'all';

function setHistoryFilter(f, btn) {
  historyFilter = f;
  document.querySelectorAll('#historyFilters .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

async function renderHistory() {
  const [workouts, exercises] = await Promise.all([dbGetAll('workouts'), dbGetAll('exercises')]);
  const q   = (document.getElementById('historySearch')?.value || '').toLowerCase().trim();
  const now = new Date();

  let filtered = workouts.filter(w => {
    if (historyFilter === 'week')  return (now - new Date(w.date + 'T00:00:00')) / 86400000 <= 7;
    if (historyFilter === 'month') return w.date.slice(0, 7) === now.toISOString().slice(0, 7);
    return true;
  });

  if (q) {
    filtered = filtered.filter(w =>
      w.date.includes(q) ||
      (w.notes || '').toLowerCase().includes(q) ||
      w.series.some(s => {
        const ex = exercises.find(e => e.id === s.exerciseId);
        return ex && ex.name.toLowerCase().includes(q);
      })
    );
  }

  filtered.sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('historyList');

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4" stroke-linecap="round"/></svg></div><div class="empty-state-text">Sin resultados</div></div>`;
    return;
  }

  list.innerHTML = filtered.map(w => {
    const grouped = {};
    w.series.forEach(s => {
      const ex   = exercises.find(e => e.id === s.exerciseId);
      const name = ex ? ex.name : '?';
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    });
    const vol    = w.series.reduce((s, r) => s + r.weight * r.reps, 0);
    const detail = Object.entries(grouped).map(([name, sets]) =>
      `<div style="margin-top:6px">
        <span style="font-weight:600;font-size:14px;color:var(--text)">${name}</span>
        <span style="font-size:12px;color:var(--text3);margin-left:8px">${sets.map((s, i) => `S${i + 1}: ${s.weight}×${s.reps}`).join('  ')}</span>
      </div>`
    ).join('');

    return `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:0;cursor:pointer" onclick="openWorkoutEdit(${w.id})">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:15px;letter-spacing:-0.3px">${formatDate(w.date)}</span>
        <span style="font-size:12px;color:var(--text3);font-weight:500">${Math.round(vol).toLocaleString()} kg vol.</span>
      </div>
      ${detail}
      ${w.notes ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;font-style:italic">"${w.notes}"</div>` : ''}
    </div>`;
  }).join('');
}
