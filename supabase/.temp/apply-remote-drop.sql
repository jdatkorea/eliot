-- places 7-field 정규화: 레거시 컬럼 강제 DROP (idempotent)
alter table public.places drop column if exists lat;
alter table public.places drop column if exists lng;
alter table public.places drop column if exists naver_url;
alter table public.places drop column if exists backup_place_id;
alter table public.places drop column if exists break_time;
alter table public.places drop column if exists last_verified;
alter table public.places drop column if exists notes;
alter table public.places drop column if exists curtail_count;

-- 신규 컬럼 idempotent 보강
alter table public.places
  add column if not exists tags text[] not null default '{}';

alter table public.places
  add column if not exists stroller_friendly boolean not null default false,
  add column if not exists has_nursing_room boolean not null default false;