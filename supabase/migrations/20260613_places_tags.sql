-- places: 장소 태그(텍스트 배열) — Sheets `tags` 컬럼 동기화 지원
alter table public.places
  add column if not exists tags text[] not null default '{}';
