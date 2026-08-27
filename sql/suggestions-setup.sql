-- ================================================================
-- Tabla de sugerencias / feedback
-- Ejecuta esto en Supabase → SQL Editor → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS suggestions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Permite a usuarios autenticados enviar sugerencias
CREATE POLICY "Authenticated users can insert suggestions" ON suggestions
  FOR INSERT WITH CHECK (true);

-- Permite leer sugerencias a usuarios autenticados
CREATE POLICY "Authenticated users can select suggestions" ON suggestions
  FOR SELECT USING (true);

-- Permite eliminar sugerencias
CREATE POLICY "Authenticated users can delete suggestions" ON suggestions
  FOR DELETE USING (true);
