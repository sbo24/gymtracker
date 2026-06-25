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
  photo_url  text,
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

-- ================================================================
-- Fotos de progreso (por usuario)
-- ================================================================
drop table if exists progress_photos cascade;
create table progress_photos (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  local_id   integer,
  date       date not null,
  photo_url  text not null,
  notes      text,
  created_at timestamptz default now()
);

alter table progress_photos enable row level security;

create policy "Own progress_photos" on progress_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================================================================
-- Storage: política para el bucket workout-photos
-- Ejecutar después de crear el bucket manualmente en Storage
-- ================================================================
insert into storage.buckets (id, name, public)
  values ('workout-photos', 'workout-photos', false)
  on conflict (id) do nothing;

create policy "Users upload own photos" on storage.objects
  for insert with check (
    bucket_id = 'workout-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users read own photos" on storage.objects
  for select using (
    bucket_id = 'workout-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own photos" on storage.objects
  for delete using (
    bucket_id = 'workout-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ================================================================
-- Migración si ya tienes la tabla workouts sin photo_url
-- ================================================================
alter table workouts add column if not exists photo_url text;
