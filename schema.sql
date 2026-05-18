create table if not exists sources (
  name text primary key,
  color text not null,
  reach integer not null default 0,
  engagement integer not null default 0,
  conversions integer not null default 0,
  trend real not null default 0,
  connected integer not null default 1,
  imported integer not null default 0,
  position integer not null default 0,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists rules (
  id text primary key,
  title text not null,
  detail text not null,
  created_at text not null default current_timestamp
);

create table if not exists settings (
  id text primary key default 'default',
  company_name text not null,
  default_kpi text not null,
  auto_refresh integer not null default 1,
  updated_at text not null default current_timestamp,
  check (id = 'default')
);

create table if not exists schedule (
  id text primary key default 'default',
  frequency text not null,
  day text not null,
  recipients text not null,
  updated_at text not null default current_timestamp,
  check (id = 'default')
);

create table if not exists reports (
  id text primary key,
  title text not null,
  audience text not null,
  sections text not null default '[]',
  summary text not null default '{}',
  recommendation text not null,
  created_at text not null default current_timestamp
);

create table if not exists google_connections (
  id text primary key default 'default',
  property_id text,
  access_token text,
  refresh_token text,
  expires_at text,
  connected_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  check (id = 'default')
);

create table if not exists metric_snapshots (
  id text primary key,
  source text not null,
  snapshot_date text not null,
  reach integer not null default 0,
  engagement integer not null default 0,
  conversions integer not null default 0,
  raw_json text not null default '{}',
  created_at text not null default current_timestamp
);

create index if not exists reports_created_at_idx on reports (created_at desc);
create index if not exists sources_imported_idx on sources (imported);
create index if not exists sources_position_idx on sources (position);
create index if not exists metric_snapshots_source_date_idx on metric_snapshots (source, snapshot_date desc);
