-- P1: Safe Pool 장소 스냅샷 — 7-field Sheet 스키마 (A~G)
-- id, destination, name, category, is_outdoor, no_kids_zone, tags
create table if not exists public.places (
  id                uuid primary key,
  destination       text not null,
  name              text not null,
  category          text not null check (category in ('meal','cafe','activity','view','kids')),
  is_outdoor        boolean not null default false,
  no_kids_zone      boolean not null default false,
  tags              text[] not null default '{}',
  stroller_friendly boolean not null default false,
  has_nursing_room  boolean not null default false
);

-- 구형 16-field 컬럼 제거 (기존 DB 업그레이드)
alter table public.places drop column if exists lat;
alter table public.places drop column if exists lng;
alter table public.places drop column if exists break_time;
alter table public.places drop column if exists naver_url;
alter table public.places drop column if exists backup_place_id;
alter table public.places drop column if exists last_verified;
alter table public.places drop column if exists notes;

-- 신규 컬럼 idempotent 보강 (구형 테이블에서 DROP 후 누락 방지)
alter table public.places
  add column if not exists tags text[] not null default '{}';

alter table public.places
  add column if not exists stroller_friendly boolean not null default false,
  add column if not exists has_nursing_room boolean not null default false;

alter table public.places enable row level security;

drop policy if exists "places_anon_select" on public.places;
create policy "places_anon_select"
  on public.places
  for select
  to anon
  using (true);
