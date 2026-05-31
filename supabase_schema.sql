-- Axis Agenda — Supabase schema
-- Ejecutar en Supabase SQL Editor.
-- Luego configurar Authentication > Providers > Email según tu preferencia.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  color text not null default 'accent' check (color in ('accent','blue','green','purple','red','teal','pink','amber')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text default '',
  status text not null default 'pendiente' check (status in ('backlog','pendiente','en-progreso','revision','completado')),
  priority text not null default 'media' check (priority in ('alta','media','baja')),
  due_date date,
  start_time time,
  duration_min integer,
  tag text not null default 'blue' check (tag in ('accent','blue','green','purple','red','teal','pink','amber')),
  context text default 'pc' check (context in ('pc','telefono','calle','casa','oficina','otro')),
  energy text default 'media' check (energy in ('alta','media','baja')),
  repeat_rule text not null default 'none' check (repeat_rule in ('none','daily','weekly','monthly')),
  sort_order numeric not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  notes text default '',
  event_date date not null,
  start_time time,
  end_time time,
  type text not null default 'otro' check (type in ('reunion','llamada','personal','deadline','bloque','otro')),
  location text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null,
  plan text default '',
  blockers text default '',
  wins text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, note_date)
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_events_user_date on public.events(user_id, event_date);
create index if not exists idx_daily_notes_user_date on public.daily_notes(user_id, note_date desc);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events for each row execute function public.set_updated_at();

drop trigger if exists set_daily_notes_updated_at on public.daily_notes;
create trigger set_daily_notes_updated_at before update on public.daily_notes for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.daily_notes enable row level security;

-- Policies: cada usuario solo ve y modifica sus propios datos.
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);

drop policy if exists "events_select_own" on public.events;
create policy "events_select_own" on public.events for select using (auth.uid() = user_id);
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own" on public.events for insert with check (auth.uid() = user_id);
drop policy if exists "events_update_own" on public.events;
create policy "events_update_own" on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own" on public.events for delete using (auth.uid() = user_id);

drop policy if exists "daily_notes_select_own" on public.daily_notes;
create policy "daily_notes_select_own" on public.daily_notes for select using (auth.uid() = user_id);
drop policy if exists "daily_notes_insert_own" on public.daily_notes;
create policy "daily_notes_insert_own" on public.daily_notes for insert with check (auth.uid() = user_id);
drop policy if exists "daily_notes_update_own" on public.daily_notes;
create policy "daily_notes_update_own" on public.daily_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "daily_notes_delete_own" on public.daily_notes;
create policy "daily_notes_delete_own" on public.daily_notes for delete using (auth.uid() = user_id);
