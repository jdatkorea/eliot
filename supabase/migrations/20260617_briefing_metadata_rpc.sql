-- A3: feedback_events + app_config를 단일 RPC로 조회 (places와 합쳐 런타임 DB 2회)
create or replace function public.get_briefing_metadata()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'feedback_events',
    coalesce(
      (
        select jsonb_agg(to_jsonb(f.*) order by f.created_at)
        from public.feedback_events f
      ),
      '[]'::jsonb
    ),
    'app_config',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('key', c.key, 'value', c.value)
          order by c.key
        )
        from public.app_config c
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_briefing_metadata() to anon;
grant execute on function public.get_briefing_metadata() to authenticated;
