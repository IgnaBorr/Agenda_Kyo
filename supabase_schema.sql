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

create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  color text not null default 'blue' check (color in ('accent','blue','green','purple','red','teal','pink','amber')),
  icon text not null default 'fa-circle',
  archived boolean not null default false,
  sort_order numeric not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_types_key_format check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint event_types_user_key_unique unique (user_id, key)
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
  type text not null default 'otro',
  location text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- V5.5: permitir tipos de calendario personalizados.
alter table public.events drop constraint if exists events_type_check;

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
create index if not exists idx_event_types_user on public.event_types(user_id, archived, sort_order);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_events_user_date on public.events(user_id, event_date);
create index if not exists idx_daily_notes_user_date on public.daily_notes(user_id, note_date desc);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

drop trigger if exists set_event_types_updated_at on public.event_types;
create trigger set_event_types_updated_at before update on public.event_types for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events for each row execute function public.set_updated_at();

drop trigger if exists set_daily_notes_updated_at on public.daily_notes;
create trigger set_daily_notes_updated_at before update on public.daily_notes for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.event_types enable row level security;
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

drop policy if exists "event_types_select_own" on public.event_types;
create policy "event_types_select_own" on public.event_types for select using (auth.uid() = user_id);
drop policy if exists "event_types_insert_own" on public.event_types;
create policy "event_types_insert_own" on public.event_types for insert with check (auth.uid() = user_id);
drop policy if exists "event_types_update_own" on public.event_types;
create policy "event_types_update_own" on public.event_types for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "event_types_delete_own" on public.event_types;
create policy "event_types_delete_own" on public.event_types for delete using (auth.uid() = user_id);

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

-- V2: tablero visual libre con tarjetas y conexiones
create table if not exists public.board_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text default '',
  category text default 'idea',
  color text default 'blue',
  x numeric default 120,
  y numeric default 120,
  width numeric default 240,
  height numeric default 150,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.board_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.board_cards(id) on delete cascade,
  target_id uuid not null references public.board_cards(id) on delete cascade,
  label text default '',
  color text not null default 'accent' check (color in ('accent','blue','green','purple','red','teal','pink','amber')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint board_links_no_self check (source_id <> target_id),
  constraint board_links_unique unique (user_id, source_id, target_id)
);

create index if not exists idx_board_cards_user on public.board_cards(user_id);
create index if not exists idx_board_links_user on public.board_links(user_id);

alter table public.board_cards enable row level security;
alter table public.board_links enable row level security;

drop policy if exists "board_cards_select_own" on public.board_cards;
drop policy if exists "board_cards_insert_own" on public.board_cards;
drop policy if exists "board_cards_update_own" on public.board_cards;
drop policy if exists "board_cards_delete_own" on public.board_cards;
create policy "board_cards_select_own" on public.board_cards for select using (auth.uid() = user_id);
create policy "board_cards_insert_own" on public.board_cards for insert with check (auth.uid() = user_id);
create policy "board_cards_update_own" on public.board_cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "board_cards_delete_own" on public.board_cards for delete using (auth.uid() = user_id);

drop policy if exists "board_links_select_own" on public.board_links;
drop policy if exists "board_links_insert_own" on public.board_links;
drop policy if exists "board_links_update_own" on public.board_links;
drop policy if exists "board_links_delete_own" on public.board_links;
create policy "board_links_select_own" on public.board_links for select using (auth.uid() = user_id);
create policy "board_links_insert_own" on public.board_links for insert with check (auth.uid() = user_id);
create policy "board_links_update_own" on public.board_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "board_links_delete_own" on public.board_links for delete using (auth.uid() = user_id);

drop trigger if exists trg_board_cards_updated_at on public.board_cards;
create trigger trg_board_cards_updated_at before update on public.board_cards for each row execute procedure public.set_updated_at();

drop trigger if exists trg_board_links_updated_at on public.board_links;
create trigger trg_board_links_updated_at before update on public.board_links for each row execute procedure public.set_updated_at();
