/* ===================================================
   import-data.js
   Ejecuta este script UNA VEZ desde la app para
   importar el historial de entrenamientos.
   
   Pega esto en la consola del navegador (F12 → Console)
   estando en https://sbo24.github.io/gymtracker/
   y habiendo iniciado sesión.
   =================================================== */

async function importHistorico() {
  // Primero obtener los IDs de ejercicios guardados
  const exercises = await dbGetAll('exercises');
  const byName = {};
  exercises.forEach(e => { byName[e.name.toLowerCase()] = e.id; });

  const find = (name) => {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(byName)) {
      if (k.includes(lower) || lower.includes(k.split(' ')[0])) return v;
    }
    return null;
  };

  const workouts = [
    {
      date: '2026-05-26',
      notes: 'Martes - Pecho + Tríceps',
      series: [
        // Pecho máquina próxima a la prensa
        { exerciseId: find('próxima a la prensa'), weight: 55, reps: 8 },
        { exerciseId: find('próxima a la prensa'), weight: 55, reps: 8 },
        { exerciseId: find('próxima a la prensa'), weight: 55, reps: 8 },
        // Pecho máquina de la derecha
        { exerciseId: find('de la derecha'), weight: 20, reps: 8 },
        { exerciseId: find('de la derecha'), weight: 25, reps: 8 },
        { exerciseId: find('de la derecha'), weight: 30, reps: 16 },
        // Aperturas máquina
        { exerciseId: find('aperturas'), weight: 63.5, reps: 7 },
        { exerciseId: find('aperturas'), weight: 68, reps: 4 },
        { exerciseId: find('aperturas'), weight: 68, reps: 4 },
        // Fondos con lastre
        { exerciseId: find('fondos con lastre'), weight: 15, reps: 7 },
        { exerciseId: find('fondos con lastre'), weight: 20, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 20, reps: 6 },
        // Fondos con polea expendedoras
        { exerciseId: find('expendedoras'), weight: 20.4, reps: 7 },
        { exerciseId: find('expendedoras'), weight: 22.7, reps: 8 },
        { exerciseId: find('expendedoras'), weight: 24.9, reps: 7 },
        // Fondos máquina fondo hombro
        { exerciseId: find('lado de hombro'), weight: 40, reps: 5 },
        { exerciseId: find('lado de hombro'), weight: 40, reps: 7 },
        { exerciseId: find('lado de hombro'), weight: 42.5, reps: 5 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-05-27',
      notes: 'Miércoles - Espalda + Bíceps',
      series: [
        { exerciseId: find('jalón'), weight: 65, reps: 6 },
        { exerciseId: find('jalón'), weight: 65, reps: 6 },
        { exerciseId: find('jalón'), weight: 65, reps: 6 },
        { exerciseId: find('caballero'), weight: 25, reps: 6 },
        { exerciseId: find('caballero'), weight: 25, reps: 6 },
        { exerciseId: find('caballero'), weight: 25, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('lumbar'), weight: 39, reps: 6 },
        { exerciseId: find('lumbar'), weight: 39, reps: 6 },
        { exerciseId: find('lumbar'), weight: 39, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('bayesti'), weight: 18, reps: 6 },
        { exerciseId: find('bayesti'), weight: 18, reps: 6 },
        { exerciseId: find('bayesti'), weight: 18, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-05-28',
      notes: 'Jueves - Piernas',
      series: [
        { exerciseId: find('prensa'), weight: 150, reps: 6 },
        { exerciseId: find('prensa'), weight: 180, reps: 6 },
        { exerciseId: find('prensa'), weight: 180, reps: 6 },
        { exerciseId: find('cuádriceps máquina entrada'), weight: 63.5, reps: 6 },
        { exerciseId: find('cuádriceps máquina entrada'), weight: 63.5, reps: 5 },
        { exerciseId: find('cuádriceps máquina entrada'), weight: 63.5, reps: 4 },
        { exerciseId: find('femoral'), weight: 36, reps: 6 },
        { exerciseId: find('femoral'), weight: 36, reps: 6 },
        { exerciseId: find('femoral'), weight: 36, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-06-01',
      notes: 'Lunes - Espalda + Bíceps',
      series: [
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('caballero'), weight: 32, reps: 5 },
        { exerciseId: find('caballero'), weight: 27.5, reps: 6 },
        { exerciseId: find('caballero'), weight: 27.5, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('samuel'), weight: 54, reps: 6 },
        { exerciseId: find('lumbar'), weight: 39, reps: 7 },
        { exerciseId: find('lumbar'), weight: 45, reps: 6 },
        { exerciseId: find('lumbar'), weight: 45, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('predicador'), weight: 41, reps: 6 },
        { exerciseId: find('predicador'), weight: 41, reps: 6 },
        { exerciseId: find('predicador'), weight: 41, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-06-02',
      notes: 'Martes - Pecho + Tríceps',
      series: [
        { exerciseId: find('próxima a la prensa'), weight: 55, reps: 7 },
        { exerciseId: find('próxima a la prensa'), weight: 60, reps: 6 },
        { exerciseId: find('próxima a la prensa'), weight: 57.5, reps: 6 },
        { exerciseId: find('de la derecha'), weight: 27.5, reps: 6 },
        { exerciseId: find('de la derecha'), weight: 30, reps: 5 },
        { exerciseId: find('de la derecha'), weight: 30, reps: 5 },
        { exerciseId: find('aperturas'), weight: 68, reps: 5 },
        { exerciseId: find('aperturas'), weight: 68, reps: 5 },
        { exerciseId: find('aperturas'), weight: 68, reps: 4 },
        { exerciseId: find('fondos con lastre'), weight: 15, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 15, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 15, reps: 6 },
        { exerciseId: find('expendedoras'), weight: 24.9, reps: 3 },
        { exerciseId: find('expendedoras'), weight: 24.9, reps: 6 },
        { exerciseId: find('expendedoras'), weight: 24.9, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-06-03',
      notes: 'Miércoles - Piernas + Hombros',
      series: [
        { exerciseId: find('prensa'), weight: 180, reps: 6 },
        { exerciseId: find('prensa'), weight: 180, reps: 6 },
        { exerciseId: find('prensa'), weight: 180, reps: 6 },
        { exerciseId: find('fondo del pasillo'), weight: 55, reps: 6 },
        { exerciseId: find('fondo del pasillo'), weight: 55, reps: 5 },
        { exerciseId: find('fondo del pasillo'), weight: 55, reps: 5 },
        { exerciseId: find('sentado fondo'), weight: 50, reps: 6 },
        { exerciseId: find('sentado fondo'), weight: 50, reps: 6 },
        { exerciseId: find('sentado fondo'), weight: 50, reps: 6 },
        { exerciseId: find('tumbado'), weight: 23, reps: 6 },
        { exerciseId: find('tumbado'), weight: 23, reps: 6 },
        { exerciseId: find('tumbado'), weight: 23, reps: 6 },
        { exerciseId: find('gemelos'), weight: 35, reps: 6 },
        { exerciseId: find('gemelos'), weight: 35, reps: 6 },
        { exerciseId: find('gemelos'), weight: 35, reps: 6 },
        { exerciseId: find('press militar'), weight: 25, reps: 6 },
        { exerciseId: find('press militar'), weight: 25, reps: 6 },
        { exerciseId: find('press militar'), weight: 25, reps: 6 },
        { exerciseId: find('elevaciones'), weight: 40, reps: 6 },
        { exerciseId: find('elevaciones'), weight: 40, reps: 5 },
        { exerciseId: find('elevaciones'), weight: 40, reps: 4 },
        { exerciseId: find('posterior'), weight: 43, reps: 6 },
        { exerciseId: find('posterior'), weight: 43, reps: 6 },
        { exerciseId: find('posterior'), weight: 43, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-06-06',
      notes: 'Sábado - Espalda + Bíceps',
      series: [
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('jalón'), weight: 66, reps: 6 },
        { exerciseId: find('caballero'), weight: 25, reps: 6 },
        { exerciseId: find('caballero'), weight: 27.5, reps: 6 },
        { exerciseId: find('caballero'), weight: 27.5, reps: 6 },
        { exerciseId: find('lumbar'), weight: 45, reps: 6 },
        { exerciseId: find('lumbar'), weight: 45, reps: 6 },
        { exerciseId: find('lumbar'), weight: 45, reps: 6 },
        { exerciseId: find('martillo'), weight: 16, reps: 6 },
        { exerciseId: find('martillo'), weight: 18, reps: 6 },
        { exerciseId: find('martillo'), weight: 18, reps: 6 },
        { exerciseId: find('arm curl'), weight: 25, reps: 6 },
        { exerciseId: find('arm curl'), weight: 25, reps: 6 },
        { exerciseId: find('arm curl'), weight: 25, reps: 6 },
      ].filter(s => s.exerciseId)
    },
    {
      date: '2026-06-08',
      notes: 'Lunes - Pecho + Tríceps',
      series: [
        { exerciseId: find('aperturas'), weight: 68, reps: 7 },
        { exerciseId: find('aperturas'), weight: 72.5, reps: 6 },
        { exerciseId: find('aperturas'), weight: 72.5, reps: 6 },
        { exerciseId: find('próxima a la prensa'), weight: 60, reps: 6 },
        { exerciseId: find('próxima a la prensa'), weight: 57.5, reps: 6 },
        { exerciseId: find('próxima a la prensa'), weight: 57.5, reps: 6 },
        { exerciseId: find('press plano'), weight: 57, reps: 6 },
        { exerciseId: find('press plano'), weight: 57, reps: 6 },
        { exerciseId: find('press plano'), weight: 57, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 20, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 20, reps: 6 },
        { exerciseId: find('fondos con lastre'), weight: 20, reps: 6 },
        { exerciseId: find('derecha de la polea'), weight: 41, reps: 6 },
        { exerciseId: find('derecha de la polea'), weight: 41, reps: 6 },
        { exerciseId: find('derecha de la polea'), weight: 41, reps: 6 },
        { exerciseId: find('lado de hombro'), weight: 40, reps: 5 },
        { exerciseId: find('lado de hombro'), weight: 40, reps: 5 },
        { exerciseId: find('lado de hombro'), weight: 40, reps: 5 },
      ].filter(s => s.exerciseId)
    },
  ];

  let imported = 0;
  for (const w of workouts) {
    if (w.series.length > 0) {
      await dbPut('workouts', w);
      imported++;
    }
  }
  console.log(`Importados ${imported} entrenamientos`);
  alert(`✓ Importados ${imported} entrenamientos históricos`);
  await syncNow('push');
}

// Ejecutar
importHistorico();
