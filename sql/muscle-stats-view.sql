-- ================================================================
-- Función para calcular muscle stats de cualquier usuario en tiempo real
-- Ejecutar en Supabase → SQL Editor
-- ================================================================

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
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  period_start date;
BEGIN
  -- Calcular fecha de inicio del periodo
  CASE target_period
    WHEN 'week'  THEN period_start := date_trunc('week', now())::date;
    WHEN 'month' THEN period_start := date_trunc('month', now())::date;
    ELSE              period_start := '2000-01-01'::date;
  END CASE;

  RETURN QUERY
  WITH raw_series AS (
    -- Expandir el JSONB de series de cada workout
    SELECT
      s->>'exerciseId'         AS ex_id_str,
      (s->>'weight')::numeric  AS w,
      (s->>'reps')::integer    AS r,
      COALESCE((s->>'cardio')::boolean, false) AS is_cardio
    FROM workouts wk,
         jsonb_array_elements(wk.series) s
    WHERE wk.user_id = target_user_id
      AND wk.date    >= period_start
      AND jsonb_typeof(wk.series) = 'array'
  ),
  with_muscle AS (
    SELECT
      rs.w,
      rs.r,
      COALESCE(e.muscle, 'Otro') AS muscle_name
    FROM raw_series rs
    LEFT JOIN exercises e
      ON e.id       = rs.ex_id_str::bigint
      AND e.user_id = target_user_id
    WHERE rs.is_cardio = false
      AND rs.r > 0
  )
  SELECT
    muscle_name                          AS muscle,
    ROUND(SUM(w * r))::numeric          AS volume,
    MAX(w)                              AS max_weight,
    COUNT(*)                            AS sets
  FROM with_muscle
  GROUP BY muscle_name
  ORDER BY volume DESC;
END;
$$;

-- Permitir que usuarios autenticados llamen a la función
GRANT EXECUTE ON FUNCTION get_muscle_stats_for_user(uuid, text) TO authenticated;

-- ── Test rápido (reemplaza el UUID con el tuyo desde auth.users) ──
-- SELECT * FROM get_muscle_stats_for_user('tu-user-id-aqui', 'all');
