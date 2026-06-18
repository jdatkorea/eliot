-- T1: briefing 전달 방식을 URL-hash(#data=)에서 id-row 방식으로 전환.
-- 근거(실측, 2026-06-18): buildBriefingUrl()이 urlA·urlB 각각에 동일한
-- dual(A+B) payload를 중복 압축해 넣어, Telegram sendMessage 4096자
-- 한도를 당일 케이스(4,326자)조차 초과시킴(최악 케이스 8,207자).
-- id는 앱 코드(lib/supabase/briefing-store.ts)가 생성하는 짧은 base62
-- 문자열. payload는 A+B를 1행에 1회만 저장 — 중복 제거.
create table if not exists public.briefings (
  id          text primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days')
);

create index if not exists briefings_expires_at_idx
  on public.briefings (expires_at);

alter table public.briefings enable row level security;

drop policy if exists "briefings_anon_select" on public.briefings;
create policy "briefings_anon_select"
  on public.briefings
  for select
  to anon
  using (true);

drop policy if exists "briefings_anon_insert" on public.briefings;
create policy "briefings_anon_insert"
  on public.briefings
  for insert
  to anon
  with check (true);
