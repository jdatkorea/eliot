-- weather_exclusion_rules 시딩 — T3(2026-06-18) 도입한 키, 0616 시딩에는 없었음
-- (당시 app_config는 4키만 존재: mood_tags/mood_tag_effects/templates/rain_prob_threshold)
-- 재실행 안전: ON CONFLICT DO UPDATE

INSERT INTO public.app_config (key, value, scope) VALUES
(
  'weather_exclusion_rules',
  '[
    {"when": {"weather_condition": "heatwave", "is_outdoor": true}, "then": {"exclude": true}},
    {"when": {"weather_condition": "coldwave", "is_outdoor": true}, "then": {"exclude": true}}
  ]'::jsonb,
  'global'
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
