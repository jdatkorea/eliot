-- P2 M3: Google Sheets config 탭 → Supabase app_config (Key-Value + JSONB)
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  scope       text not null default 'global',
  updated_at  timestamptz not null default now()
);

create index if not exists app_config_scope_idx on public.app_config (scope);
