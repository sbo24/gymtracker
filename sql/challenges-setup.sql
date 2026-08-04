-- ================================================================
-- GymTracker — Sistema de retos entre usuarios
-- Ejecuta en Supabase → SQL Editor
-- ================================================================

-- ── Perfiles públicos (nombre visible para retos) ──────────────
CREATE TABLE IF NOT EXISTS public_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public_profiles ENABLE ROW LEVEL SECURITY;
-- Cualquiera puede leer perfiles públicos
CREATE POLICY "Profiles readable by all"  ON public_profiles FOR SELECT USING (true);
-- Solo el propio usuario puede actualizar su perfil
CREATE POLICY "Own profile writable"      ON public_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Estadísticas musculares públicas (agregados, sin detalle) ──
CREATE TABLE IF NOT EXISTS muscle_stats (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  muscle      text NOT NULL,
  period      text NOT NULL,  -- 'week', 'month', 'all'
  volume      numeric DEFAULT 0,
  max_weight  numeric DEFAULT 0,
  sets        integer DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, muscle, period)
);
ALTER TABLE muscle_stats ENABLE ROW LEVEL SECURITY;
-- Cualquiera puede leer (solo agregados, no hay datos sensibles)
CREATE POLICY "Muscle stats readable by all" ON muscle_stats FOR SELECT USING (true);
-- Solo el propio usuario puede escribir sus stats
CREATE POLICY "Own muscle stats writable"    ON muscle_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Retos enviados ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
  id          bigserial PRIMARY KEY,
  from_user   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  to_user     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  metric      text NOT NULL,   -- 'volume', 'max_weight', 'sets'
  period      text NOT NULL,   -- 'week', 'month', 'all'
  muscle      text,            -- null = todos los músculos
  status      text DEFAULT 'active',  -- 'active', 'ended'
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Challenge participants can read" ON challenges
  FOR SELECT USING (auth.uid() = from_user OR auth.uid() = to_user);
CREATE POLICY "Authenticated can create challenges" ON challenges
  FOR INSERT WITH CHECK (auth.uid() = from_user);

-- ── Notificaciones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,   -- 'challenge_received'
  payload     jsonb DEFAULT '{}',
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Función para buscar usuarios por email parcial ──────────────
-- Solo devuelve user_id y email enmascarado (seguro)
CREATE OR REPLACE FUNCTION search_users_by_email(query text)
RETURNS TABLE(user_id uuid, masked_email text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    u.id,
    regexp_replace(u.email, '(.).+(@.+)', '\1***\2') AS masked_email
  FROM auth.users u
  WHERE u.email ILIKE '%' || query || '%'
    AND u.id != auth.uid()
  LIMIT 10;
$$;

-- ── Insertar perfil público al registrarse (trigger) ───────────
CREATE OR REPLACE FUNCTION create_public_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public_profiles (user_id, display_name)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_public_profile();

-- Crear perfil para usuarios existentes
INSERT INTO public_profiles (user_id, display_name)
SELECT id, split_part(email, '@', 1) FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
