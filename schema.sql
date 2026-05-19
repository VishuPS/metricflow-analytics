create table if not exists connectors (
  id text primary key,
  name text not null,
  color text not null,
  kind text not null,
  connected integer not null default 0,
  status text not null default 'needs_setup',
  auth_url text,
  token_url text,
  scopes_json text not null default '[]',
  last_sync_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists connector_connections (
  connector_id text primary key references connectors(id) on delete cascade,
  mode text not null default 'oauth',
  access_token text,
  refresh_token text,
  expires_at text,
  property_id text,
  raw_json text not null default '{}',
  connected_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists posts (
  id text primary key,
  connector_id text not null references connectors(id) on delete cascade,
  external_id text not null,
  canonical_url text,
  title text not null,
  caption text,
  author text,
  media_type text not null,
  campaign text,
  content_pillar text,
  tags_json text not null default '[]',
  published_at text,
  ingested_at text not null default current_timestamp,
  raw_json text not null default '{}',
  unique (connector_id, external_id)
);

create table if not exists post_metric_snapshots (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  connector_id text not null references connectors(id) on delete cascade,
  external_post_id text not null,
  period text not null default 'daily',
  date text not null,
  reach integer not null default 0,
  impressions integer not null default 0,
  engagements integer not null default 0,
  reactions integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  clicks integer not null default 0,
  video_views integer not null default 0,
  watch_seconds integer not null default 0,
  conversions integer not null default 0,
  revenue real not null default 0,
  raw_json text not null default '{}',
  captured_at text not null default current_timestamp,
  created_at text not null default current_timestamp,
  unique (post_id, period, date)
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
  top_post text,
  created_at text not null default current_timestamp
);

create index if not exists connectors_status_idx on connectors (status, connected);
create index if not exists posts_connector_published_idx on posts (connector_id, published_at desc);
create index if not exists posts_content_pillar_idx on posts (content_pillar, media_type);
create index if not exists post_metric_snapshots_post_date_idx on post_metric_snapshots (post_id, period, date desc);
create index if not exists post_metric_snapshots_connector_date_idx on post_metric_snapshots (connector_id, period, date desc);
create index if not exists reports_created_at_idx on reports (created_at desc);
