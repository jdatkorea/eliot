INSERT INTO app_config (key, value, scope) 
VALUES (
  'templates', 
  '{"base": {"full_day": ["출발", "오전", "점심", "오후", "저녁"], "half_day": ["출발", "점심", "오후", "저녁"], "multi_day": ["도착 후", "오전", "점심", "오후", "저녁"], "short": ["출발", "점심"]}, "block_category_map": {"도착 후": ["cafe", "view"], "밤": ["cafe", "view"], "오전": ["cafe", "view", "kids"], "오후": ["activity", "view", "kids"], "저녁": ["meal", "cafe"], "점심": ["meal", "cafe"], "출발": ["view", "cafe"]}}', 
  'global'
) 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
