/* ===================================================
   photos.js — Progress photos
   =================================================== */
'use strict';

let currentPhotoId = null;

async function renderPhotos() {
  const photos = await dbGetAll('photos');
  photos.sort((a, b) => b.date.localeCompare(a.date));
  const grid = document.getElementById('photoGrid');

  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon-wrap"><svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
      <div class="empty-state-text">Sin fotos</div>
      <div class="empty-state-sub">Añade tu primera foto de progreso</div>
    </div>`;
    return;
  }

  // Group by month
  const groups = {};
  photos.forEach(p => {
    const month = p.date.slice(0, 7);
    if (!groups[month]) groups[month] = [];
    groups[month].push(p);
  });

  grid.innerHTML = Object.entries(groups).map(([month, ps]) => {
    const label = new Date(month + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const imgs  = ps.map(p => {
      const src = p.data || p.photo_url || '';
      return `<div class="photo-thumb" onclick="openPhotoViewer(${p.id})">
        <img src="${src}" alt="${p.date}" loading="lazy" />
        <div class="photo-thumb-date">${p.date.slice(8)}</div>
      </div>`;
    }).join('');
    return `<div class="photo-month-label">${label}</div><div class="photo-row">${imgs}</div>`;
  }).join('');
}

async function addPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const today = new Date().toISOString().split('T')[0];
    await dbPut('photos', { date: today, data: e.target.result, note: '' });
    showToast('✓ Foto añadida');
    renderPhotos();
    if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
    if (typeof syncNow === 'function') syncNow('push');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function openPhotoViewer(id) {
  const all   = await dbGetAll('photos');
  const photo = all.find(p => p.id === id);
  if (!photo) return;
  currentPhotoId = id;
  const src = photo.data || photo.photo_url || '';
  document.getElementById('photoViewerImg').src            = src;
  document.getElementById('photoViewerDate').textContent   = formatDate(photo.date);
  document.getElementById('photoViewerNote').textContent   = photo.note || '';
  document.getElementById('photoViewer').style.display     = 'flex';
  document.getElementById('app').style.overflow            = 'hidden';
}

function closePhotoViewer() {
  document.getElementById('photoViewer').style.display = 'none';
  document.getElementById('app').style.overflow        = '';
  currentPhotoId = null;
}

async function deleteCurrentPhoto() {
  if (!currentPhotoId) return;
  await dbDelete('photos', currentPhotoId);
  closePhotoViewer();
  showToast('Foto eliminada');
  if (typeof notePendingSync === 'function') notePendingSync('Cambio local pendiente');
  syncNow('push');
  renderPhotos();
}
