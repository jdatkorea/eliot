import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";

export const MOOD_TAGS = DEFAULT_APP_CONFIG.mood_tags as unknown as readonly [
  "baby_tired",
  "relaxed_pace",
  "extend_range",
  "indoor_only",
  "food_light",
  "food_hearty",
];

export type MoodTag = (typeof MOOD_TAGS)[number];
