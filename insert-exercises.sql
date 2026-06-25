-- Inserta los ejercicios para tu usuario
-- Ejecuta esto en Supabase → SQL Editor

-- Primero borra los ejercicios actuales de tu usuario (opcional)
-- DELETE FROM exercises WHERE user_id = auth.uid();

INSERT INTO exercises (user_id, name, muscle, notes) VALUES
-- PECHO
(auth.uid(), 'Pecho máquina próxima a la prensa', 'Pecho', ''),
(auth.uid(), 'Pecho máquina de la derecha', 'Pecho', ''),
(auth.uid(), 'Aperturas máquina entrada', 'Pecho', '140lbs=63.5kg · 150lbs=68kg · 160lbs=72.5kg'),
(auth.uid(), 'Pecho máquina entrada press plano', 'Pecho', ''),

-- TRÍCEPS
(auth.uid(), 'Fondos con lastre', 'Tríceps', ''),
(auth.uid(), 'Fondos con polea máquinas expendedoras', 'Tríceps', ''),
(auth.uid(), 'Fondos con polea máquina derecha expendedoras', 'Tríceps', ''),
(auth.uid(), 'Fondos máquina fondo al lado de hombro', 'Tríceps', ''),

-- ESPALDA
(auth.uid(), 'Jalón al pecho con agarre dentro', 'Espalda', ''),
(auth.uid(), 'Dorsal en polea posición de caballero dentro', 'Espalda', ''),
(auth.uid(), 'Dorsal sentado agarre en V de Samuel', 'Espalda', ''),
(auth.uid(), 'Lumbar en máquina', 'Espalda', ''),

-- BÍCEPS
(auth.uid(), 'Curl de bíceps martillo', 'Bíceps', ''),
(auth.uid(), 'Curl Bayesti polea', 'Bíceps', ''),
(auth.uid(), 'Curl predicador máquina entrada', 'Bíceps', ''),
(auth.uid(), 'Arm curl máquina entrada', 'Bíceps', ''),

-- ANTEBRAZO
(auth.uid(), 'Curl de muñeca con mancuernas', 'Antebrazo', ''),
(auth.uid(), 'Curl inverso con barra', 'Antebrazo', ''),
(auth.uid(), 'Farmer walk', 'Antebrazo', ''),

-- PIERNAS
(auth.uid(), 'Prensa en máquina fondo sala', 'Piernas', ''),
(auth.uid(), 'Extensión de cuádriceps máquina entrada', 'Piernas', '140lbs=63.5kg'),
(auth.uid(), 'Extensión de cuádriceps fondo del pasillo', 'Piernas', ''),
(auth.uid(), 'Curl de femoral', 'Piernas', ''),
(auth.uid(), 'Curl de femoral sentado fondo pasillo', 'Piernas', ''),
(auth.uid(), 'Curl de femoral tumbado entrada', 'Piernas', ''),
(auth.uid(), 'Gemelos máquina sentado izquierda de femoral', 'Piernas', ''),

-- HOMBROS
(auth.uid(), 'Press militar en máquina', 'Hombros', ''),
(auth.uid(), 'Elevaciones laterales máquina fondo entrada', 'Hombros', ''),
(auth.uid(), 'Hombro posterior', 'Hombros', '');
