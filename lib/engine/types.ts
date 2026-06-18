export type TimeLabel =
  | "출발"
  | "도착 후"
  | "오전"
  | "점심"
  | "오후"
  | "저녁"
  | "밤";

export const TIME_LABELS: readonly TimeLabel[] = [
  "출발",
  "도착 후",
  "오전",
  "점심",
  "오후",
  "저녁",
  "밤",
] as const;

export type Block = {
  time_label: TimeLabel;
  place_id: string;
  title: string;
  desc: string;
  dot: "default" | "accent" | "green";
  weather_note?: string;
  weather_backup?: { place_id: string; reason: string };
  /** T4(2026-06-18): phase별 시계 시각 — config.phase_durations 비율 배분 */
  start_time?: string;
  end_time?: string;
  /** T5(2026-06-18): has_nursing_room=true 장소(family 모드)에 노출하는 케어 포인트 */
  care_note?: string;
};

export type TripLocation = {
  lat: number;
  lng: number;
};

export type PriorTripFeedback = {
  mood_intensity?: number;
  mood_tags?: string[];
  mode?: "family" | "couple";
  weather?: string;
  place_category?: PlaceCategory;
  excluded_categories?: PlaceCategory[];
  pool_exhausted?: boolean;
  satisfaction?: number;
  failure_reason?: FailureReason;
  saved_at?: string;
};

export type BriefingContextMeta = {
  operation_time: string;
  base_camp: string;
  weather_text: string;
  energy_level?: number;
  sunset_time?: string;
  constraints?: string;
  duration_hours?: number;
  trip_days?: number;
  destination?: string;
  location?: TripLocation;
  prior_trip_feedback?: PriorTripFeedback;
};

/**
 * 폭염/한파/자외선 — rain_prob과는 독립적인 별도 축. 과거 parseWeatherFromText가
 * heatwave를 rain_prob 하향(10%)으로 흉내 내던 버그를 T3(2026-06-18)에서
 * 제거하고, 이 명시적 조건 배열로 대체했다.
 */
export type WeatherCondition = "heatwave" | "coldwave" | "uv_high";

export type WeatherInfo = {
  summary: string;
  temp: string;
  rain_prob: string;
  advice: string;
  conditions?: WeatherCondition[];
};

export type Briefing = {
  destination: string;
  date_label: string;
  weather: WeatherInfo;
  days: { label: string; title: string; blocks: Block[] }[];
  checklist: string[];
  context_meta?: BriefingContextMeta;
  /** DB 필터 매칭 0건으로 Joker fallback이 발동된 경우 */
  pool_exhausted?: boolean;
};

export type PlaceCategory = "meal" | "cafe" | "activity" | "view" | "kids";

export type MoodTagEffects = {
  blockCountModifier: number;
  indoorBias: number;
  relaxedLabels: boolean;
  indoorOnly: boolean;
  mealSubtag: "light" | "hearty" | null;
};

export type WeatherKey = "clear" | "rain";

type DescTemplateKey =
  | "default"
  | "food_light"
  | "food_hearty"
  | "baby_tired"
  | "relaxed_pace";

export type AppConfigTemplates = {
  base: Record<string, TimeLabel[]>;
  block_category_map: Record<TimeLabel, PlaceCategory[]>;
  desc_by_category: Record<
    PlaceCategory,
    Record<DescTemplateKey, Record<WeatherKey, string>>
  >;
};

/**
 * 날씨 조건 → 장소 하드-제외 production rule(config DSL, {when, then} 형태).
 * 점수 가중치가 아니라 IF-THEN 배제 — "안내문만 붙이고 그대로 포함"은
 * 이 규칙의 대체가 될 수 없다(T3, 2026-06-18).
 */
export type WeatherExclusionRule = {
  when: { weather_condition: WeatherCondition; is_outdoor: boolean };
  then: { exclude: true };
};

export type AppConfig = {
  mood_tags: string[];
  mood_tag_effects: Record<string, Partial<MoodTagEffects>>;
  templates: AppConfigTemplates;
  rain_prob_threshold: number;
  weather_exclusion_rules: WeatherExclusionRule[];
  /**
   * phase(TimeLabel)별 상대 가중치 — 절대 분(分)이 아니라 비율이다. 실제
   * 배분 시 전체 작전시간(duration_hours×60)에 가중치 비율로 곱해 합이
   * 정확히 window와 일치하도록 만든다(T4, 2026-06-18). 누락된 label은 1로
   * 처리한다.
   */
  phase_durations: Partial<Record<TimeLabel, number>>;
  /** 명시적 departure_time이 없을 때(현재 실제 WebApp 플로우는 항상 이 경우) 사용하는 기본 출발 시각("HH:MM") */
  default_departure_time: string;
  /** family 모드에서 stroller_friendly=true 장소에 더하는 weightedScore 가산점(T5, 2026-06-18) */
  stroller_friendly_bonus: number;
};

export type Place = {
  id: string;
  destination: string;
  name: string;
  category: PlaceCategory;
  is_outdoor: boolean;
  no_kids_zone: boolean;
  tags: string[];
  stroller_friendly?: boolean;
  has_nursing_room?: boolean;
};

export type FailureReason =
  | "timing"
  | "food"
  | "kids"
  | "mood"
  | "weather"
  | "other"
  | "none";

export type FeedbackContextTags = {
  mood_tags?: string[];
  mood_intensity?: number;
  mode?: "family" | "couple";
  return_location?: string;
  route_variant?: "A" | "B";
  weather?: string;
  time_slot?: string;
  place_category?: PlaceCategory;
};

export type FeedbackEvent = {
  id: string;
  subject_id: string;
  trip_id: string;
  context_tags: FeedbackContextTags;
  satisfaction: number;
  failure_reason: FailureReason;
  note: string | null;
  created_at: string;
};

export type TripRequest = {
  start_mode: "fixed" | "duration";
  departure_time?: string;
  return_time?: string;
  duration_hours?: number;
  /** 여행 일수: 1=당일치기, 2=1박2일, 3=2박3일 */
  trip_days?: number;
  origin?: string;
  return_location?: string;
  destination?: string;
  location?: TripLocation;
  trip_date?: string;
  prior_trip_feedback?: PriorTripFeedback;
  mood_tags: string[];
  mood_intensity?: number;
  mode: "family" | "couple";
  weather?: string;
  sunset_time?: string;
  constraints?: string;
};

export type NormalizedTrip = {
  duration: number;
  /** 멀티-블록 루프 횟수 (일수). 미지정 시 1 */
  trip_days?: number;
  origin: string;
  mood_tags: string[];
  mood_intensity?: number;
  mode: "family" | "couple";
  return_location: string;
};

export type GenerateBriefingInput = {
  normalized: NormalizedTrip;
  places: Place[];
  feedback_events: FeedbackEvent[];
  config: AppConfig;
  destination?: string;
  date_label?: string;
  weather?: Briefing["weather"];
  trip_context?: BriefingContextMeta;
};
