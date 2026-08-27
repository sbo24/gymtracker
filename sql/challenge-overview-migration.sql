-- ================================================================
-- Función para obtener resumen global de retos por usuario
-- Ejecuta en Supabase → SQL Editor → Run
-- ================================================================

CREATE OR REPLACE FUNCTION get_user_challenge_overview(
  target_user_id uuid,
  target_period   text
)
RETURNS TABLE(
  workout_days bigint,
  total_volume numeric,
  total_sets   bigint,
  max_weight   numeric,
  last_workout text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  period_start date;
BEGIN
  CASE target_period
    WHEN 'week'  THEN period_start := date_trunc('week', now())::date;
    WHEN 'month' THEN period_start := date_trunc('month', now())::date;
    ELSE              period_start := '2000-01-01'::date;
  END CASE;

  RETURN QUERY
  WITH raw_series AS (
    SELECT
      wk.date,
      (s->>'weight')::numeric AS w,
      (s->>'reps')::integer   AS r,
      COALESCE((s->>'cardio')::boolean, false) AS is_cardio
    FROM workouts wk,
         jsonb_array_elements(wk.series) s
    WHERE wk.user_id = target_user_id
      AND wk.date    >= period_start
      AND jsonb_typeof(wk.series) = 'array'
  )
  SELECT
    COUNT(DISTINCT rs.date)::bigint AS workout_days,
    COALESCE(ROUND(SUM(CASE WHEN rs.is_cardio = false AND rs.w > 0 AND rs.r > 0 THEN rs.w * rs.r ELSE 0 END)), 0)::numeric AS total_volume,
    COUNT(CASE WHEN rs.is_cardio = false AND rs.w > 0 AND rs.r > 0 THEN 1 END)::bigint AS total_sets,
    COALESCE(MAX(CASE WHEN rs.is_cardio = false THEN rs.w ELSE 0 END), 0)::numeric AS max_weight,
    MAX(rs.date)::text AS last_workout
  FROM raw_series rs;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_challenge_overview(uuid, text) TO authenticated;
