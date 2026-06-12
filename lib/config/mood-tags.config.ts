import type { PlaceCategory } from "@/lib/engine/types";

export const MOOD_TAGS = [
  "baby_tired",
  "relaxed_pace",
  "extend_range",
  "indoor_only",
  "food_light",
  "food_hearty",
] as const;

export type MoodTag = (typeof MOOD_TAGS)[number];

export type MoodTagEffects = {
  blockCountModifier: number;
  radiusCapKm: number;
  indoorBias: number;
  relaxedLabels: boolean;
  indoorOnly: boolean;
  mealSubtag: "light" | "hearty" | null;
};

const DEFAULT_RADIUS_CAP_KM = 40;
const EXTEND_RADIUS_CAP_KM = 120;
const BABY_TIRED_RADIUS_CAP_KM = 20;

export const MOOD_TAG_EFFECTS: Record<MoodTag, Partial<MoodTagEffects>> = {
  baby_tired: {
    blockCountModifier: -1,
    radiusCapKm: BABY_TIRED_RADIUS_CAP_KM,
    indoorBias: 2,
  },
  relaxed_pace: {
    blockCountModifier: -1,
    relaxedLabels: true,
  },
  extend_range: {
    radiusCapKm: EXTEND_RADIUS_CAP_KM,
  },
  indoor_only: {
    indoorOnly: true,
    indoorBias: 3,
  },
  food_light: {
    mealSubtag: "light",
  },
  food_hearty: {
    mealSubtag: "hearty",
  },
};

export function resolveMoodEffects(moodTags: string[]): MoodTagEffects {
  const effects: MoodTagEffects = {
    blockCountModifier: 0,
    radiusCapKm: DEFAULT_RADIUS_CAP_KM,
    indoorBias: 0,
    relaxedLabels: false,
    indoorOnly: false,
    mealSubtag: null,
  };

  for (const tag of moodTags) {
    const partial = MOOD_TAG_EFFECTS[tag as MoodTag];
    if (!partial) continue;

    if (partial.blockCountModifier !== undefined) {
      effects.blockCountModifier += partial.blockCountModifier;
    }
    if (partial.radiusCapKm !== undefined) {
      effects.radiusCapKm = partial.radiusCapKm;
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

export type WeatherKey = "clear" | "rain";

export function weatherKeyFromRainProb(rainProb: string): WeatherKey {
  const numeric = parseInt(rainProb.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numeric) && numeric >= 50 ? "rain" : "clear";
}

type DescTemplateKey = "default" | "food_light" | "food_hearty" | "baby_tired" | "relaxed_pace";

const DESC_BY_CATEGORY: Record<
  PlaceCategory,
  Record<DescTemplateKey, Record<WeatherKey, string>>
> = {
  meal: {
    default: {
      clear: "{name}에서 가볍게 식사해요.",
      rain: "{name} 실내 좌석이 있어 비 와도 괜찮아요.",
    },
    food_light: {
      clear: "{name}에서 담백한 한 끼로 부담 없이.",
      rain: "비 오는 날엔 {name} 따뜻한 메뉴가 좋아요.",
    },
    food_hearty: {
      clear: "{name}에서 든든하게 에너지 보충.",
      rain: "우천 시에도 {name}에서 푸짐하게.",
    },
    baby_tired: {
      clear: "아이 컨디션 고려해 {name}에서 빠르게 식사.",
      rain: "실내 {name}에서 아이와 편히 쉬어가요.",
    },
    relaxed_pace: {
      clear: "{name}에서 여유롭게 식사해요.",
      rain: "{name}에서 천천히 한 끼.",
    },
  },
  cafe: {
    default: {
      clear: "{name}에서 잠깐 쉬어가요.",
      rain: "비 오면 {name}에서 따뜻한 음료 한 잔.",
    },
    food_light: {
      clear: "{name} 가벼운 디저트로 휴식.",
      rain: "{name} 실내에서 달콤한 휴식.",
    },
    food_hearty: {
      clear: "{name}에서 브런치로 든든하게.",
      rain: "{name}에서 따뜻한 브런치.",
    },
    baby_tired: {
      clear: "아이 낮잠 전 {name}에서 짧은 휴식.",
      rain: "실내 {name}에서 아이와 쉬어가요.",
    },
    relaxed_pace: {
      clear: "{name}에서 여유롭게 커피 한 잔.",
      rain: "{name}에서 천천히 쉬어가요.",
    },
  },
  activity: {
    default: {
      clear: "{name}에서 가볍게 활동해요.",
      rain: "비 예보 시 실내 대안을 확인해요.",
    },
    food_light: {
      clear: "{name}에서 가벼운 산책.",
      rain: "우천 시 {name} 대신 실내 대안.",
    },
    food_hearty: {
      clear: "{name}에서 활기차게 움직여요.",
      rain: "비 오면 실내 대안으로 전환.",
    },
    baby_tired: {
      clear: "아이 피로 고려해 {name}은 짧게.",
      rain: "아이 컨디션·날씨 모두 실내 대안 권장.",
    },
    relaxed_pace: {
      clear: "{name}에서 여유롭게 둘러봐요.",
      rain: "천천히 실내 대안을 고려해요.",
    },
  },
  view: {
    default: {
      clear: "{name} 전망을 즐겨요.",
      rain: "우천 시 {name} 전망은 아쉬울 수 있어요.",
    },
    food_light: {
      clear: "{name}에서 가볍게 산책.",
      rain: "비 오면 전망 대신 실내 대안.",
    },
    food_hearty: {
      clear: "{name}에서 넉넉한 시간을 보내요.",
      rain: "우천 시 실내 대안을 준비해요.",
    },
    baby_tired: {
      clear: "아이와 {name}은 짧게 스냅만.",
      rain: "아이 동반 시 실내 대안이 나아요.",
    },
    relaxed_pace: {
      clear: "{name}에서 여유롭게 전망 감상.",
      rain: "비 오는 날엔 실내 대안으로.",
    },
  },
  kids: {
    default: {
      clear: "{name}에서 아이와 함께 놀아요.",
      rain: "비 와도 {name} 실내 놀이 가능.",
    },
    food_light: {
      clear: "{name}에서 가볍게 체험.",
      rain: "실내 {name}에서 아이와 놀아요.",
    },
    food_hearty: {
      clear: "{name}에서 아이 에너지 발산.",
      rain: "우천 시에도 {name} 실내 이용.",
    },
    baby_tired: {
      clear: "아이 피곤하면 {name}은 짧게.",
      rain: "실내 {name}에서 편히 쉬어가요.",
    },
    relaxed_pace: {
      clear: "{name}에서 여유롭게 아이와 시간.",
      rain: "비 오는 날 {name} 실내에서.",
    },
  },
};

function resolveDescTemplateKey(moodTags: string[]): DescTemplateKey {
  if (moodTags.includes("food_light")) return "food_light";
  if (moodTags.includes("food_hearty")) return "food_hearty";
  if (moodTags.includes("baby_tired")) return "baby_tired";
  if (moodTags.includes("relaxed_pace")) return "relaxed_pace";
  return "default";
}

export function fillDescTemplate(
  category: PlaceCategory,
  moodTags: string[],
  weather: WeatherKey,
  placeName: string,
): string {
  const templateKey = resolveDescTemplateKey(moodTags);
  const template =
    DESC_BY_CATEGORY[category][templateKey][weather] ??
    DESC_BY_CATEGORY[category].default[weather];
  return template.replace("{name}", placeName);
}

export const RAIN_PROB_THRESHOLD = 50;
