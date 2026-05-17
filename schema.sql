create table if not exists public.sources (
  name text primary key,
  color text not null,
  reach integer not null default 0,
  engagement integer not null default 0,
  conversions integer not null default 0,
  trend numeric not null default 0,
  connected boolean not null default true,
  imported boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rules (
  id text primary key,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default 'default',
  company_name text not null,
  default_kpi text not null,
  auto_refresh boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 'default')
);

create table if not exists public.schedule (
  id text primary key default 'default',
  frequency text not null,
  day text not null,
  recipients text not null,
  updated_at timestamptz not null default now(),
  constraint schedule_singleton check (id = 'default')
);

create table if not exists public.reports (
  id text primary key,
  title text not null,
  audience text not null,
  sections text[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  recommendation text not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists sources_imported_idx on public.sources (imported);
create index if not exists sources_position_idx on public.sources (position);
