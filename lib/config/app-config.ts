import { z } from "zod";
import type {
  AppConfig,
  AppConfigTemplates,
  PlaceCategory,
  TimeLabel,
} from "@/lib/engine/types";
import { TIME_LABELS } from "@/lib/engine/types";
import { HOME_ADDRESS } from "@/lib/engine/normalize";

export type {
  AppConfig,
  AppConfigTemplates,
  MoodTagEffects,
  WeatherKey,
} from "@/lib/engine/types";

const timeLabelSchema = z.enum([
  "출발",
  "도착 후",
  "오전",
  "점심",
  "오후",
  "저녁",
  "밤",
]);

const placeCategorySchema = z.enum([
  "meal",
  "cafe",
  "activity",
  "view",
  "kids",
]);

const weatherKeySchema = z.enum(["clear", "rain"]);

const descTemplateKeySchema = z.enum([
  "default",
  "food_light",
  "food_hearty",
  "baby_tired",
  "relaxed_pace",
]);

const moodTagEffectsPartialSchema = z.object({
  blockCountModifier: z.number().optional(),
  radiusCapKm: z.number().optional(),
  indoorBias: z.number().optional(),
  relaxedLabels: z.boolean().optional(),
  indoorOnly: z.boolean().optional(),
  mealSubtag: z.enum(["light", "hearty"]).nullable().optional(),
});

export const AppConfigSchema = z.object({
  mood_tags: z.array(z.string()).min(1),
  mood_tag_effects: z.record(moodTagEffectsPartialSchema),
  templates: z.object({
    base: z.record(z.array(timeLabelSchema)),
    block_category_map: z.record(z.array(placeCategorySchema)),
    desc_by_category: z.record(
      z.record(z.record(weatherKeySchema, z.string())),
    ),
  }),
  origin_coords: z.record(
    z.object({ lat: z.number(), lng: z.number() }),
  ),
  rain_prob_threshold: z.number(),
  default_radius_cap_km: z.number(),
  extend_radius_cap_km: z.number(),
  baby_tired_radius_cap_km: z.number(),
  transport_thresholds: z.object({
    short_km: z.number(),
    medium_km: z.number(),
  }),
});

export const REQUIRED_CONFIG_KEYS = [
  "mood_tags",
  "mood_tag_effects",
  "templates",
  "origin_coords",
  "rain_prob_threshold",
] as const;

export type RequiredConfigKey = (typeof REQUIRED_CONFIG_KEYS)[number];

const DESC_BY_CATEGORY: AppConfigTemplates["desc_by_category"] = {
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

export const DEFAULT_APP_CONFIG: AppConfig = {
  mood_tags: [
    "baby_tired",
    "relaxed_pace",
    "extend_range",
    "indoor_only",
    "food_light",
    "food_hearty",
  ],
  mood_tag_effects: {
    baby_tired: {
      blockCountModifier: -1,
      radiusCapKm: 20,
      indoorBias: 2,
    },
    relaxed_pace: {
      blockCountModifier: -1,
      relaxedLabels: true,
    },
    extend_range: {
      radiusCapKm: 120,
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
  },
  templates: {
    base: {
      short: ["출발", "점심", "오후"],
      half_day: ["출발", "점심", "오후", "저녁"],
      full_day: ["출발", "오전", "점심", "오후", "저녁"],
      multi_day: ["도착 후", "오전", "점심", "오후", "저녁"],
    },
    block_category_map: {
      출발: ["view", "cafe"],
      "도착 후": ["cafe", "view"],
      오전: ["cafe", "view", "kids"],
      점심: ["meal", "cafe"],
      오후: ["activity", "view", "kids"],
      저녁: ["meal", "cafe"],
      밤: ["cafe", "view"],
    },
    desc_by_category: DESC_BY_CATEGORY,
  },
  origin_coords: {
    [HOME_ADDRESS]: { lat: 37.382, lng: 126.657 },
  },
  rain_prob_threshold: 50,
  default_radius_cap_km: 40,
  extend_radius_cap_km: 120,
  baby_tired_radius_cap_km: 20,
  transport_thresholds: { short_km: 40, medium_km: 120 },
};

export type AppConfigRow = {
  key: string;
  value: unknown;
  scope: string;
  updated_at: string;
};

export type ParseConfigValueResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

function looksLikeJsonLiteral(trimmed: string): boolean {
  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith('"')
  );
}

/**
 * config 시트 value 셀 파싱.
 * JSON 리터럴({, [, ")은 구문 오류 시 즉시 실패하고, 스칼라는 안전 fallback.
 */
export function parseConfigValueSafe(raw: string): ParseConfigValueResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "value가 비어 있습니다." };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (error) {
    const syntaxMessage =
      error instanceof SyntaxError
        ? error.message
        : "알 수 없는 JSON 구문 오류";

    if (looksLikeJsonLiteral(trimmed)) {
      return { ok: false, reason: `JSON 구문 오류: ${syntaxMessage}` };
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { ok: true, value: Number(trimmed) };
    }
    if (trimmed === "true") return { ok: true, value: true };
    if (trimmed === "false") return { ok: true, value: false };
    return { ok: true, value: trimmed };
  }
}

/** @deprecated parseConfigValueSafe 사용 */
export function parseConfigValue(raw: string): unknown {
  const result = parseConfigValueSafe(raw);
  return result.ok ? result.value : null;
}

export function isAppConfig(value: unknown): value is AppConfig {
  return AppConfigSchema.safeParse(value).success;
}

export function appConfigFromDbRows(
  rows: { key: string; value: unknown }[],
): AppConfig {
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return assembleAppConfigFromRows(map);
}

/**
 * DB app_config 행 → AppConfig. 필수 키 누락·Zod 실패·타입 불일치 시 DEFAULT_APP_CONFIG로 Fail-over.
 */
export function safeAppConfigFromDbRows(
  rows: { key: string; value: unknown }[],
): AppConfig {
  if (rows.length === 0) {
    return DEFAULT_APP_CONFIG;
  }

  const keySet = new Set(rows.map((row) => row.key));
  if (validateRequiredConfigKeys(keySet).length > 0) {
    return DEFAULT_APP_CONFIG;
  }

  try {
    const config = appConfigFromDbRows(rows);
    return isAppConfig(config) ? config : DEFAULT_APP_CONFIG;
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export function assembleAppConfigFromRows(
  rows: Record<string, unknown>,
): AppConfig {
  const merged = {
    ...DEFAULT_APP_CONFIG,
    ...rows,
    templates: {
      ...DEFAULT_APP_CONFIG.templates,
      ...(rows.templates as AppConfigTemplates | undefined),
    },
    origin_coords: {
      ...DEFAULT_APP_CONFIG.origin_coords,
      ...(rows.origin_coords as AppConfig["origin_coords"] | undefined),
    },
    mood_tag_effects: {
      ...DEFAULT_APP_CONFIG.mood_tag_effects,
      ...(rows.mood_tag_effects as AppConfig["mood_tag_effects"] | undefined),
    },
  };

  return AppConfigSchema.parse(merged);
}

export function validateRequiredConfigKeys(
  keySet: Set<string>,
): RequiredConfigKey[] {
  return REQUIRED_CONFIG_KEYS.filter((key) => !keySet.has(key));
}

export function assertValidTimeLabelsInConfig(config: AppConfig): boolean {
  for (const labels of Object.values(config.templates.base)) {
    for (const label of labels) {
      if (!TIME_LABELS.includes(label)) {
        return false;
      }
    }
  }
  return true;
}
