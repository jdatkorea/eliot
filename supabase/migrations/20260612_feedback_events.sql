-- P1 M1: generic feedback event schema (PRD §3 / Mind PT·CRM 이식 대비)
create table if not exists public.feedback_events (
  id              uuid primary key default gen_random_uuid(),
  subject_id      text not null,
  trip_id         uuid not null,
  context_tags    jsonb not null default '{}',
  satisfaction    smallint not null check (satisfaction between 1 and 5),
  failure_reason  text not null check (
    failure_reason in ('timing','food','kids','mood','weather','other','none')
  ),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists feedback_events_subject_id_idx
  on public.feedback_events (subject_id);

create index if not exists feedback_events_trip_id_idx
  on public.feedback_events (trip_id);

alter table public.feedback_events enable row level security;

drop policy if exists "feedback_events_anon_select" on public.feedback_events;
create policy "feedback_events_anon_select"
  on public.feedback_events
  for select
  to anon
  using (true);

drop policy if exists "feedback_events_anon_insert" on public.feedback_events;
create policy "feedback_events_anon_insert"
  on public.feedback_events
  for insert
  to anon
  with check (true);
