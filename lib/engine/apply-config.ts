import type {
  AppConfig,
  MoodTagEffects,
  PlaceCategory,
  WeatherKey,
} from "./types";

type DescTemplateKey =
  | "default"
  | "food_light"
  | "food_hearty"
  | "baby_tired"
  | "relaxed_pace";

export function resolveMoodEffects(
  config: AppConfig,
  moodTags: string[],
): MoodTagEffects {
  const effects: MoodTagEffects = {
    blockCountModifier: 0,
    indoorBias: 0,
    relaxedLabels: false,
    indoorOnly: false,
    mealSubtag: null,
  };

  for (const tag of moodTags) {
    const partial = config.mood_tag_effects[tag];
    if (!partial) continue;

    if (partial.blockCountModifier !== undefined) {
      effects.blockCountModifier += partial.blockCountModifier;
    }
    if (partial.indoorBias !== undefined) {
      effects.indoorBias += partial.indoorBias;
    }
    if (partial.relaxedLabels) {
      effects.relaxedLabels = true;
    }
    if (partial.indoorOnly) {
      effects.indoorOnly = true;
    }
    if (partial.mealSubtag) {
      effects.mealSubtag = partial.mealSubtag;
    }
  }

  return effects;
}

export function weatherKeyFromRainProb(
  config: AppConfig,
  rainProb: string,
): WeatherKey {
  const numeric = parseInt(rainProb.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numeric) && numeric >= config.rain_prob_threshold
    ? "rain"
    : "clear";
}

function resolveDescTemplateKey(moodTags: string[]): DescTemplateKey {
  if (moodTags.includes("food_light")) return "food_light";
  if (moodTags.includes("food_hearty")) return "food_hearty";
  if (moodTags.includes("baby_tired")) return "baby_tired";
  if (moodTags.includes("relaxed_pace")) return "relaxed_pace";
  return "default";
}

export function fillDescTemplate(
  config: AppConfig,
  category: PlaceCategory,
  moodTags: string[],
  weather: WeatherKey,
  placeName: string,
): string {
  const templateKey = resolveDescTemplateKey(moodTags);
  const categoryTemplates = config.templates.desc_by_category[category];
  const template =
    categoryTemplates[templateKey][weather] ??
    categoryTemplates.default[weather];
  return template.replace("{name}", placeName);
}
