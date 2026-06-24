-- ================================================================
-- GymTracker Pro — Supabase setup con autenticación por usuario
-- Ejecuta esto en Supabase → SQL Editor → Run
-- ================================================================

-- Eliminar tablas anteriores si existen
drop table if exists exercises cascade;
drop table if exists workouts cascade;
drop table if exists weight_log cascade;

-- Ejercicios (por usuario)
create table exercises (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  local_id   integer,
  name       text not null,
  muscle     text,
  notes      text,
  created_at timestamptz default now()
);

-- Entrenamientos (por usuario)
create table workouts (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  local_id   integer,
  date       date not null,
  notes      text,
  series     jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Peso corporal (por usuario)
create table weight_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  local_id   integer,
  date       date not null,
  weight     numeric not null,
  fat        numeric,
  notes      text,
  created_at timestamptz default now()
);

-- ================================================================
-- Row Level Security: cada usuario solo ve sus propios datos
-- ================================================================
alter table exercises  enable row level security;
alter table workouts   enable row level security;
alter table weight_log enable row level security;

-- Policies: solo el dueño puede leer/escribir
create policy "Own exercises" on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Own workouts" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Own weight_log" on weight_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
