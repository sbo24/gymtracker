-- ================================================================
-- Crear tabla workout_templates si no existe (migración)
-- Ejecuta esto en Supabase → SQL Editor → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS workout_templates (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id   INTEGER,
  name       TEXT NOT NULL,
  weekday    TEXT,
  notes      TEXT,
  series     JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Política: solo el dueño puede leer/escribir sus plantillas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workout_templates' AND policyname = 'Own workout_templates'
  ) THEN
    CREATE POLICY "Own workout_templates" ON workout_templates
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Constraint para upsert por local_id
ALTER TABLE workout_templates
  ADD CONSTRAINT IF NOT EXISTS workout_templates_user_local UNIQUE (user_id, local_id);
