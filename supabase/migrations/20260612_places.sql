-- P1 M1: Safe Pool 장소 스냅샷 (PRD §3 / cms-architecture.md 정합)
create table if not exists public.places (
  id              uuid primary key,
  destination     text not null,
  name            text not null,
  category        text not null check (category in ('meal','cafe','activity','view','kids')),
  lat             double precision not null,
  lng             double precision not null,
  curtail_count   integer not null default 0,
  is_outdoor      boolean not null default false,
  no_kids_zone    boolean not null default false,
  break_time      text,
  naver_url       text,
  backup_place_id uuid references public.places(id),
  last_verified   date not null,
  notes           text
);

alter table public.places enable row level security;

drop policy if exists "places_anon_select" on public.places;
create policy "places_anon_select"
  on public.places
  for select
  to anon
  using (true);
