/* ===================================================
   constants.js — Muscle maps, order, helpers
   =================================================== */
'use strict';

const MUSCLE_ORDER = [
  'Pecho','Espalda','Hombros','Bíceps','Tríceps','Antebrazo',
  'Piernas','Glúteos','Core / Abdomen','Cardio','Otro'
];

const MUSCLE_CLASS = {
  'Pecho': 'pecho', 'Espalda': 'espalda', 'Hombros': 'hombros',
  'Bíceps': 'biceps', 'Tríceps': 'triceps', 'Antebrazo': 'antebrazo',
  'Piernas': 'piernas', 'Glúteos': 'gluteos', 'Core / Abdomen': 'core',
  'Cardio': 'cardio', 'Otro': 'otro'
};

const MUSCLE_EMOJI = {
  'Pecho': '🫀', 'Espalda': '🔵', 'Hombros': '💜', 'Bíceps': '💪',
  'Tríceps': '💪', 'Antebrazo': '🤜', 'Piernas': '🦵', 'Glúteos': '🟠',
  'Core / Abdomen': '⚡', 'Cardio': '🏃', 'Otro': '⚙️'
};

function muscleClass(m) { return MUSCLE_CLASS[m] || 'otro'; }
function muscleEmoji(m) { return MUSCLE_EMOJI[m] || '🏋️'; }
