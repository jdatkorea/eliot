-- places: 사회적 언급 신선도 플래그 — freshness-report 기준
alter table public.places
  add column if not exists last_social_seen date;
