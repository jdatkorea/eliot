-- P2 M3: Google Sheets config 탭 → Supabase app_config (Key-Value + JSONB)
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  scope       text not null default 'global',
  updated_at  timestamptz not null default now()
);

create index if not exists app_config_scope_idx on public.app_config (scope);

alter table public.app_config enable row level security;

drop policy if exists "app_config_anon_select" on public.app_config;
create policy "app_config_anon_select"
  on public.app_config
  for select
  to anon
  using (true);
