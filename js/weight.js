/* ===================================================
   weight.js — Body weight log
   =================================================== */
'use strict';

async function renderWeight() {
  document.getElementById('weightDate').value = new Date().toISOString().split('T')[0];
  const weights = await dbGetAll('weight');
  weights.sort((a, b) => b.date.localeCompare(a.date));

  const chartData = [...weights].reverse().slice(-20).map(w => ({ label: w.date.slice(5), value: w.weight }));
  drawLineChart('chartWeight', chartData, '#34c759');

  const list = document.getElementById('weightList');
  if (!weights.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a1 1 0 0 1 1 1v1h5l1 4H5l1-4h5V4a1 1 0 0 1 1-1z"/><path d="M5 9l2 12h10L19 9"/><path d="M8 13h8"/></svg></div><div class="empty-state-text">Sin registros</div><div class="empty-state-sub">Añade tu peso arriba</div></div>`;
    return;
  }
  list.innerHTML = weights.map(w => `
    <div class="weight-entry">
      <div>
        <div class="weight-entry-value">${w.weight} <span style="font-size:14px;font-weight:500;color:var(--text3)">kg</span></div>
        <div class="weight-entry-date">${formatDate(w.date)}</div>
        ${w.fat   ? `<div class="weight-entry-fat">${w.fat}% grasa</div>` : ''}
        ${w.notes ? `<div class="weight-entry-fat">${w.notes}</div>` : ''}
      </div>
      <button class="weight-entry-del" onclick="deleteWeight(${w.id})">×</button>
    </div>`).join('');
}

async function saveWeight() {
  const date   = document.getElementById('weightDate').value;
  const weight = parseFloat(document.getElementById('weightValue').value);
  if (!date || isNaN(weight) || weight <= 0) { showToast('Introduce peso válido'); return; }
  await dbPut('weight', {
    date, weight,
    fat:   parseFloat(document.getElementById('weightFat').value) || null,
    notes: document.getElementById('weightNotes').value.trim()
  });
  document.getElementById('weightValue').value = '';
  document.getElementById('weightFat').value   = '';
  document.getElementById('weightNotes').value = '';
  showToast('✓ Peso registrado');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  renderWeight();
}

async function deleteWeight(id) {
  await dbDelete('weight', id);
  showToast('Registro eliminado');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  renderWeight();
}
