import { z } from "zod";
import type {
  AppConfig,
  AppConfigTemplates,
  PlaceCategory,
  TimeLabel,
} from "@/lib/engine/types";
import { TIME_LABELS } from "@/lib/engine/types";

export type {
  AppConfig,
  AppConfigTemplates,
  MoodTagEffects,
  WeatherCondition,
  WeatherExclusionRule,
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
  indoorBias: z.number().optional(),
  relaxedLabels: z.boolean().optional(),
  indoorOnly: z.boolean().optional(),
  mealSubtag: z.enum(["light", "hearty"]).nullable().optional(),
});

const weatherConditionSchema = z.enum(["heatwave", "coldwave", "uv_high"]);

const weatherExclusionRuleSchema = z.object({
  when: z.object({
    weather_condition: weatherConditionSchema,
    is_outdoor: z.boolean(),
  }),
  then: z.object({
    exclude: z.literal(true),
  }),
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
  rain_prob_threshold: z.number(),
  weather_exclusion_rules: z.array(weatherExclusionRuleSchema),
  phase_durations: z.record(z.number().positive()),
  default_departure_time: z.string().regex(/^\d{1,2}:\d{2}$/),
  stroller_friendly_bonus: z.number(),
});

/**
 * weather_exclusion_rules(T3)·phase_durations·default_departure_time(T4)·
 * stroller_friendly_bonus(T5)는 의도적으로 REQUIRED에서 제외한다.
 * weather_exclusion_rules는 이제 live DB에 시딩되어 있지만(2026-06-18),
 * 향후 다른 환경/리셋된 DB가 이 키들을 아직 갖고 있지 않을 가능성은 항상
 * 존재한다 — REQUIRED로 만들면 그 키 하나 없다는 이유로
 * safeAppConfigFromDbRows 전체가 DEFAULT_APP_CONFIG로 폴백해 DB의 다른
 * 커스터마이즈(mood_tags 등)까지 묻혀버린다. assembleAppConfigFromRows의
 * 스프레드 기본값 병합으로 충분하다.
 */
export const REQUIRED_CONFIG_KEYS = [
  "mood_tags",
  "mood_tag_effects",
  "templates",
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
      indoorBias: 2,
    },
    relaxed_pace: {
      blockCountModifier: -1,
      relaxedLabels: true,
    },
    extend_range: {},
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
  rain_prob_threshold: 50,
  /**
   * heatwave/coldwave 모두 outdoor 하드-제외 — 가족 day-trip 제품(아기 동반
   * 전제: stroller_friendly·has_nursing_room 필드가 이미 존재)에서 한파 야외
   * 노출은 폭염과 동등하거나 그 이상의 안전 리스크(저체온증)다(2026-06-18
   * 결정, 겨울 여정 대비). 자외선(uv_high)은 의류·자외선차단제로 완화 가능한
   * 낮은 급성 위험이라 하드-제외 대상에서 제외 — conditions 배열에는 여전히
   * 노출되어 추후 필요 시 추가하기 쉽다.
   */
  weather_exclusion_rules: [
    {
      when: { weather_condition: "heatwave", is_outdoor: true },
      then: { exclude: true },
    },
    {
      when: { weather_condition: "coldwave", is_outdoor: true },
      then: { exclude: true },
    },
  ],
  /**
   * 절대 분이 아니라 상대 가중치(T4, 2026-06-18) — resolvePhaseClockWindows가
   * 전체 작전시간에 비례 배분한다. 오후를 가장 길게 잡은 건 보통 메인
   * 활동(activity/view/kids)이 거기 배치되기 때문 — 출발/밤은 짧게.
   */
  phase_durations: {
    출발: 1,
    "도착 후": 1,
    오전: 1.5,
    점심: 1.5,
    오후: 2,
    저녁: 1.5,
    밤: 1,
  },
  /**
   * 실제 WebApp 플로우는 항상 start_mode:"duration"이라 명시적 departure_time이
   * 없다(TripRequest.departure_time은 "fixed" 모드 전용, 현재 미사용 경로) —
   * clock-time 배분에 필요한 앵커를 config 기본값으로 제공한다.
   */
  default_departure_time: "10:00",
  /**
   * weightedScore 가산점(T5, 2026-06-18) — indoorBias 기본값(2~3)과 비슷한
   * 스케일. family 모드에서만 적용(couple엔 무의미한 필드).
   */
  stroller_friendly_bonus: 2,
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
    mood_tag_effects: {
      ...DEFAULT_APP_CONFIG.mood_tag_effects,
      ...(rows.mood_tag_effects as AppConfig["mood_tag_effects"] | undefined),
    },
  };

  return AppConfigSchema.parse(merged) as AppConfig;
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
