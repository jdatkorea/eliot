-- app_config 필수 시딩 — DEFAULT_APP_CONFIG 기준, origin_coords에 경주 추가
-- 재실행 안전: ON CONFLICT DO UPDATE

INSERT INTO public.app_config (key, value, scope) VALUES
(
  'mood_tags',
  '["baby_tired","relaxed_pace","extend_range","indoor_only","food_light","food_hearty"]'::jsonb,
  'global'
),
(
  'mood_tag_effects',
  '{
    "baby_tired":    {"blockCountModifier":-1,"radiusCapKm":20,"indoorBias":2},
    "relaxed_pace":  {"blockCountModifier":-1,"relaxedLabels":true},
    "extend_range":  {"radiusCapKm":120},
    "indoor_only":   {"indoorOnly":true,"indoorBias":3},
    "food_light":    {"mealSubtag":"light"},
    "food_hearty":   {"mealSubtag":"hearty"}
  }'::jsonb,
  'global'
),
(
  'templates',
  '{
    "base": {
      "short":     ["출발","점심","오후"],
      "half_day":  ["출발","점심","오후","저녁"],
      "full_day":  ["출발","오전","점심","오후","저녁"],
      "multi_day": ["도착 후","오전","점심","오후","저녁"]
    },
    "block_category_map": {
      "출발":   ["view","cafe"],
      "도착 후": ["cafe","view"],
      "오전":   ["cafe","view","kids"],
      "점심":   ["meal","cafe"],
      "오후":   ["activity","view","kids"],
      "저녁":   ["meal","cafe"],
      "밤":     ["cafe","view"]
    }
  }'::jsonb,
  'global'
),
(
  'origin_coords',
  '{
    "인천 송도": {"lat":37.382,"lng":126.657},
    "경주 시내": {"lat":35.8325,"lng":129.267}
  }'::jsonb,
  'global'
),
(
  'rain_prob_threshold',
  '50'::jsonb,
  'global'
),
(
  'default_radius_cap_km',
  '40'::jsonb,
  'global'
),
(
  'extend_radius_cap_km',
  '120'::jsonb,
  'global'
),
(
  'baby_tired_radius_cap_km',
  '20'::jsonb,
  'global'
),
(
  'transport_thresholds',
  '{"short_km":40,"medium_km":120}'::jsonb,
  'global'
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
