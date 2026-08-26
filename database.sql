-- =============================================================================
-- Trazia - esquema de base de datos (Supabase / PostgreSQL)
-- =============================================================================
-- Ejecuta este archivo completo en el SQL Editor de tu proyecto de Supabase.
-- Es idempotente: puedes volver a ejecutarlo sin perder datos.
--
-- Todas las tablas guardan datos personales, por lo que todas tienen Row Level
-- Security activado y politicas que limitan cada fila a su usuario propietario.
-- El frontend nunca es la capa de seguridad: la seguridad vive aqui.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Un perfil por usuario autenticado. La clave primaria es el UUID de auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  stage text check (stage in ('eso', 'bachillerato')),
  grade_level text check (grade_level in (
    '1eso', '2eso', '3eso', '4eso', '1bach', '2bach'
  )),
  track text check (track in ('ciencias', 'humanidades', 'artes', 'otra')),
  grade_goal numeric(4, 2) check (grade_goal >= 0 and grade_goal <= 10),
  focus_minutes smallint not null default 25 check (focus_minutes between 1 and 180),
  break_minutes smallint not null default 5 check (break_minutes between 1 and 60),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil automaticamente al registrarse un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- subjects
-- -----------------------------------------------------------------------------

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default 'indigo',
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subjects_user_id_idx on public.subjects (user_id);

drop trigger if exists subjects_set_updated_at on public.subjects;
create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- schedule_items
-- -----------------------------------------------------------------------------
-- Guarda las tres cosas que ocupan el horario del estudiante:
--   class      -> clase semanal recurrente (weekday + hora inicio/fin)
--   exam       -> examen en una fecha concreta
--   assignment -> entrega en una fecha concreta, con estado pendiente/completada
-- weekday: 0 = lunes ... 6 = domingo

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  kind text not null check (kind in ('class', 'exam', 'assignment')),
  title text,
  weekday smallint check (weekday between 0 and 6),
  start_time time,
  end_time time,
  room text,
  event_date date,
  event_time time,
  status text not null default 'pending' check (status in ('pending', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schedule_items_class_shape check (
    kind <> 'class' or (
      weekday is not null and start_time is not null and end_time is not null
      and end_time > start_time
    )
  ),
  constraint schedule_items_event_shape check (
    kind = 'class' or (event_date is not null and char_length(trim(coalesce(title, ''))) > 0)
  )
);

create index if not exists schedule_items_user_kind_idx on public.schedule_items (user_id, kind);
create index if not exists schedule_items_user_date_idx on public.schedule_items (user_id, event_date);

drop trigger if exists schedule_items_set_updated_at on public.schedule_items;
create trigger schedule_items_set_updated_at
  before update on public.schedule_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- grades
-- -----------------------------------------------------------------------------

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  score numeric(4, 2) not null check (score >= 0 and score <= 10),
  weight numeric(5, 2) not null default 100 check (weight > 0 and weight <= 100),
  graded_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grades_user_subject_idx on public.grades (user_id, subject_id);

drop trigger if exists grades_set_updated_at on public.grades;
create trigger grades_set_updated_at
  before update on public.grades
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- habits + habit_completions
-- -----------------------------------------------------------------------------
-- weekdays: array de dias (0 = lunes ... 6 = domingo) en los que toca el habito.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text not null default 'lavanda',
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Al menos un dia y solo valores de 0 (lunes) a 6 (domingo). Se define aparte
-- para que el archivo se pueda volver a ejecutar sobre una base ya creada.
alter table public.habits drop constraint if exists habits_weekdays_valid;
alter table public.habits add constraint habits_weekdays_valid check (
  coalesce(array_length(weekdays, 1), 0) between 1 and 7
  and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
);

create index if not exists habits_user_id_idx on public.habits (user_id);

drop trigger if exists habits_set_updated_at on public.habits;
create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create table if not exists public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_on)
);

create index if not exists habit_completions_user_date_idx
  on public.habit_completions (user_id, completed_on);

-- -----------------------------------------------------------------------------
-- journal_entries
-- -----------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  title text,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_entries_user_date_idx
  on public.journal_entries (user_id, entry_date desc);

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- books
-- -----------------------------------------------------------------------------

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  author text,
  status text not null default 'quiero_leer'
    check (status in ('quiero_leer', 'leyendo', 'terminado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books (user_id);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- focus_sessions
-- -----------------------------------------------------------------------------

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  focus_seconds integer not null check (focus_seconds > 0 and focus_seconds <= 86400),
  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_started_idx
  on public.focus_sessions (user_id, started_at desc);

-- -----------------------------------------------------------------------------
-- countdowns
-- -----------------------------------------------------------------------------

create table if not exists public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  target_at timestamptz not null,
  has_time boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists countdowns_user_target_idx on public.countdowns (user_id, target_at);

drop trigger if exists countdowns_set_updated_at on public.countdowns;
create trigger countdowns_set_updated_at
  before update on public.countdowns
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Cada usuario solo puede leer, insertar, modificar y eliminar sus propias filas.

alter table public.profiles           enable row level security;
alter table public.subjects           enable row level security;
alter table public.schedule_items     enable row level security;
alter table public.grades             enable row level security;
alter table public.habits             enable row level security;
alter table public.habit_completions  enable row level security;
alter table public.journal_entries    enable row level security;
alter table public.books              enable row level security;
alter table public.focus_sessions     enable row level security;
alter table public.countdowns         enable row level security;

-- profiles: la columna propietaria es "id", no "user_id".
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- Resto de tablas: mismas cuatro politicas sobre "user_id".
do $$
declare
  t text;
begin
  foreach t in array array[
    'subjects', 'schedule_items', 'grades', 'habits', 'habit_completions',
    'journal_entries', 'books', 'focus_sessions', 'countdowns'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
-- Supabase concede estos permisos automaticamente a las tablas nuevas del
-- esquema public, pero los dejamos explicitos para que el esquema sea completo.
-- El rol `anon` (sesion sin iniciar) no recibe ningun permiso sobre los datos.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- =============================================================================
-- Eliminacion de cuenta
-- =============================================================================
-- Permite que la propia persona borre su cuenta desde la aplicacion. Al borrar
-- la fila de auth.users, el "on delete cascade" de cada tabla elimina todos sus
-- datos. Es security definer porque auth.users no es accesible con la anon key,
-- pero solo puede borrar al usuario que ejecuta la llamada.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay ninguna sesion activa.' using errcode = '28000';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
