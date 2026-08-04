-- ================================================================
-- Función corregida para muscle stats — exerciseId es integer en JSON
-- Ejecutar en Supabase → SQL Editor
-- ================================================================

CREATE OR REPLACE FUNCTION get_muscle_stats_for_user(
  target_user_id uuid,
  target_period   text
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
  CASE target_period
    WHEN 'week'  THEN period_start := date_trunc('week', now())::date;
    WHEN 'month' THEN period_start := date_trunc('month', now())::date;
    ELSE              period_start := '2000-01-01'::date;
  END CASE;

  RETURN QUERY
  WITH raw_series AS (
    SELECT
      -- exerciseId es integer en el JSON, usar ->  (no ->>) y castear a bigint
      (s->'exerciseId')::bigint         AS ex_id,
      (s->>'weight')::numeric           AS w,
      (s->>'reps')::integer             AS r,
      COALESCE((s->>'cardio')::boolean, false) AS is_cardio
    FROM workouts wk,
         jsonb_array_elements(wk.series) s
    WHERE wk.user_id = target_user_id
      AND wk.date    >= period_start
      AND jsonb_typeof(wk.series) = 'array'
      AND (s->'exerciseId') IS NOT NULL
  ),
  with_muscle AS (
    SELECT
      rs.w,
      rs.r,
      COALESCE(e.muscle, 'Otro') AS muscle_name
    FROM raw_series rs
    -- JOIN por local_id que es el id de IndexedDB guardado en la columna local_id
    LEFT JOIN exercises e
      ON e.local_id = rs.ex_id
      AND e.user_id = target_user_id
    WHERE rs.is_cardio = false
      AND rs.r > 0
      AND rs.w > 0
  )
  SELECT
    muscle_name,
    ROUND(SUM(w * r))::numeric AS volume,
    MAX(w)                     AS max_weight,
    COUNT(*)                   AS sets
  FROM with_muscle
  GROUP BY muscle_name
  ORDER BY volume DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_muscle_stats_for_user(uuid, text) TO authenticated;

-- ── Verificación rápida (sustituye el UUID por el tuyo) ──────────
-- SELECT * FROM get_muscle_stats_for_user(auth.uid(), 'all');
