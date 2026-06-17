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

export type Briefing = {
  destination: string;
  date_label: string;
  weather: { summary: string; temp: string; rain_prob: string; advice: string };
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

export type AppConfig = {
  mood_tags: string[];
  mood_tag_effects: Record<string, Partial<MoodTagEffects>>;
  templates: AppConfigTemplates;
  rain_prob_threshold: number;
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
