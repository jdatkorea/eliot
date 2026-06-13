-- destinations: 여행지 메타데이터 — places.destination FK 기준
create table if not exists public.destinations (
  destination_id    text primary key,
  name              text not null,
  center_lat        double precision not null,
  center_lng        double precision not null,
  default_radius_km double precision not null default 40,
  home_drive_min    integer,
  season_note       text,
  status            text not null default 'active'
    check (status in ('active', 'archived'))
);

alter table public.destinations enable row level security;

drop policy if exists "destinations_anon_select" on public.destinations;
create policy "destinations_anon_select"
  on public.destinations
  for select
  to anon
  using (true);
