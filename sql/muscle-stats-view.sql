-- ================================================================
-- Vista que calcula muscle_stats en tiempo real desde los workouts
-- No requiere que el usuario haya publicado sus stats manualmente
-- Ejecutar en Supabase → SQL Editor
-- ================================================================

-- Función que devuelve los stats de músculo de CUALQUIER usuario
-- para un periodo dado (week, month, all)
-- Solo expone datos agregados, nunca detalles de entrenamientos
CREATE OR REPLACE FUNCTION get_muscle_stats_for_user(
  target_user_id uuid,
  target_period   text   -- 'week' | 'month' | 'all'
)
RETURNS TABLE(
  muscle     text,
  volume     numeric,
  max_weight numeric,
  sets       bigint
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH period_start AS (
    SELECT CASE target_period
      WHEN 'week'  THEN date_trunc('week', now())::date
      WHEN 'month' THEN date_trunc('month', now())::date
      ELSE          '2000-01-01'::date
    END AS start_date
  ),
  series_expanded AS (
    SELECT
      w.date,
      s->>'exerciseId'         AS exercise_id_str,
      (s->>'weight')::numeric  AS weight,
      (s->>'reps')::integer    AS reps,
      (s->>'cardio')::boolean  AS is_cardio
    FROM workouts w,
         jsonb_array_elements(w.series) AS s,
         period_start p
    WHERE w.user_id = target_user_id
      AND w.date    >= p.start_date
  ),
  with_muscles AS (
    SELECT
      se.weight,
      se.reps,
      se.is_cardio,
      COALESCE(e.muscle, 'Otro') AS muscle
    FROM series_expanded se
    LEFT JOIN exercises e
      ON e.id = se.exercise_id_str::bigint
      AND e.user_id = target_user_id
    WHERE se.is_cardio IS NOT TRUE
  )
  SELECT
    muscle,
    ROUND(SUM(weight * reps))::numeric   AS volume,
    MAX(weight)                          AS max_weight,
    COUNT(*)                             AS sets
  FROM with_muscles
  GROUP BY muscle
  ORDER BY volume DESC;
$$;

-- Política: cualquier usuario autenticado puede llamar a esta función
GRANT EXECUTE ON FUNCTION get_muscle_stats_for_user TO authenticated;
