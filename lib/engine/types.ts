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

export type Briefing = {
  destination: string;
  date_label: string;
  weather: { summary: string; temp: string; rain_prob: string; advice: string };
  days: { label: string; title: string; blocks: Block[] }[];
  checklist: string[];
};

export type PlaceCategory = "meal" | "cafe" | "activity" | "view" | "kids";

export type MoodTagEffects = {
  blockCountModifier: number;
  radiusCapKm: number;
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
  origin_coords: Record<string, { lat: number; lng: number }>;
  rain_prob_threshold: number;
  default_radius_cap_km: number;
  extend_radius_cap_km: number;
  baby_tired_radius_cap_km: number;
  transport_thresholds: { short_km: number; medium_km: number };
};

export type Place = {
  id: string;
  destination: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  curtail_count: number;
  is_outdoor: boolean;
  no_kids_zone: boolean;
  break_time: string | null;
  naver_url: string;
  backup_place_id: string | null;
  last_verified: string;
  notes: string | null;
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
  origin?: string;
  return_location?: string;
  mood_tags: string[];
  mood_intensity?: number;
  mode: "family" | "couple";
};

export type NormalizedTrip = {
  duration: number;
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
};
