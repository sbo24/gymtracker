-- ================================================================
-- GymTracker — Tabla de rivales guardados en Supabase
-- Ejecutar en Supabase → SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS saved_rivals (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rival_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rival_email  text NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, rival_id)
);

ALTER TABLE saved_rivals ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Own saved rivals read" ON saved_rivals;
CREATE POLICY "Own saved rivals read" ON saved_rivals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own saved rivals insert" ON saved_rivals;
CREATE POLICY "Own saved rivals insert" ON saved_rivals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own saved rivals delete" ON saved_rivals;
CREATE POLICY "Own saved rivals delete" ON saved_rivals
  FOR DELETE USING (auth.uid() = user_id);
