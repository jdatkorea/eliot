-- places: 가족 편의시설 boolean 컬럼 — tags에서 컬럼으로 승격
alter table public.places
  add column if not exists stroller_friendly  boolean not null default false,
  add column if not exists has_nursing_room   boolean not null default false;
