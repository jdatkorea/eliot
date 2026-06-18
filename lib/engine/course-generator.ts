import { resolveMoodEffects } from "./apply-config";
import { deterministicIndex } from "./deterministic-index";
import { parseClockTimeToMinutes, resolvePhaseClockWindows } from "./phase-schedule";
import {
  resolveCentroidDistanceKm,
  resolveRegionTier,
  type RegionTier,
} from "./region-tiers";
import type {
  AppConfig,
  FeedbackEvent,
  Place,
  PlaceCategory,
  TimeLabel,
  WeatherCondition,
  WeatherExclusionRule,
} from "./types";

/** 하루 코스 기본 운영 시간 (시간) */
export const DEFAULT_COURSE_DURATION_HOURS = 5;

/**
 * spillover 후보 1순위 탐색 반경(km) — T2.5(2026-06-18) 실측: 실제 ICN_METRO
 * 8개 destination 전부 자급 또는 5-26km 반경 내 spillover로 충족됨(부천→인천
 * 7.5km, 계양→김포 8.8km 등). CAPITAL_EXT tier 경계(최대 90km, 송도 기준)는
 * "허용 범위"일 뿐 "적정 거리"가 아니다 — 5시간·4블록 당일 코스에서 왕복
 * 주행에 시간을 다 쓰면 안 되므로, 1차 탐색은 이 반경으로 좁히고, 그래도
 * 충족 후보가 없을 때만(0-stop 방지) 반경 밖까지 넓혀 최근접 후보를 쓴다.
 */
export const MAX_SPILLOVER_DISTANCE_KM = 40;

/** @deprecated {@link DEFAULT_COURSE_DURATION_HOURS} 사용 */
export const COURSE_BLOCK_HOURS = DEFAULT_COURSE_DURATION_HOURS;

export type CourseOptions = {
  /** 하루 코스 운영 시간(시간) — 템플릿·시드 분기에 사용 */
  duration: number;
};

export const DEFAULT_COURSE_OPTIONS: CourseOptions = {
  duration: DEFAULT_COURSE_DURATION_HOURS,
};

type TimeTemplateKey = keyof AppConfig["templates"]["base"];

export function resolveTimeTemplateKey(durationHours: number): TimeTemplateKey {
  if (durationHours <= 4) return "short";
  if (durationHours <= 6) return "half_day";
  return "full_day";
}

function resolveCourseOptions(
  courseOptions?: CourseOptions,
): CourseOptions {
  const duration = courseOptions?.duration ?? DEFAULT_COURSE_OPTIONS.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    return DEFAULT_COURSE_OPTIONS;
  }
  return { duration };
}

export type TripDurationDays = 1 | 2 | 3;

export const TRIP_DURATION_OPTIONS: {
  value: TripDurationDays;
  label: string;
}[] = [
  { value: 1, label: "당일치기" },
  { value: 2, label: "1박 2일" },
  { value: 3, label: "2박 3일" },
];

const JOKER_FALLBACK_PLACE: Place = {
  id: "joker-songdo-hyundai-outlet",
  destination: "인천_근교",
  name: "송도 현대프리미엄아울렛",
  category: "activity",
  is_outdoor: false,
  no_kids_zone: false,
  tags: [],
};

export type GenerateCourseParams = {
  places: Place[];
  config: AppConfig;
  destination: string;
  mode: "family" | "couple";
  mood_tags: string[];
  origin?: string;
  /** 하루 운영 시간 등 코스 생성 옵션 */
  courseOptions?: CourseOptions;
  /** 이전 일차에서 방문한 장소 — 중복 방지 */
  excludeIds?: Set<string>;
  /** 0-based 일차 인덱스 (시드·템플릿 분기) */
  dayIndex?: number;
  feedback_events?: FeedbackEvent[];
  /** 폭염/한파/자외선 등 — config.weather_exclusion_rules와 매칭해 하드-제외 */
  weatherConditions?: WeatherCondition[];
  /** "HH:MM" — 명시 시 is_outdoor phase가 일몰 이후로 끝나지 않도록 강제 실내 대체(T4) */
  sunsetTime?: string;
};

/**
 * config.weather_exclusion_rules({when,then} production rule)을 평가한다 —
 * 점수 가중치가 아니라 IF-THEN 배제. activeConditions가 비어 있으면(날씨
 * 정보 없음·평시) 아무것도 제외하지 않는다.
 */
export function isExcludedByWeatherRules(
  place: Place,
  activeConditions: readonly WeatherCondition[],
  rules: readonly WeatherExclusionRule[],
): boolean {
  if (activeConditions.length === 0) return false;
  return rules.some(
    (rule) =>
      rule.then.exclude &&
      place.is_outdoor === rule.when.is_outdoor &&
      activeConditions.includes(rule.when.weather_condition),
  );
}

export type GenerateCourseResult = {
  course: Place[];
  pool_exhausted?: boolean;
};

export type CourseDayBlock = {
  day: number;
  course: Place[];
};

export type GenerateMultiDayCourseParams = GenerateCourseParams & {
  /** 여행 일수 (1=당일, 2=1박2일, 3=2박3일) — 루프 횟수 */
  duration: TripDurationDays;
};

export type GenerateMultiDayCourseResult = {
  blocks: CourseDayBlock[];
  pool_exhausted?: boolean;
};

function clampTripDuration(value: number): TripDurationDays {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return value as TripDurationDays;
}

export function halfDayLabels(
  config: AppConfig,
  moodTags: string[],
  courseOptions: CourseOptions = DEFAULT_COURSE_OPTIONS,
): TimeLabel[] {
  const resolved = resolveCourseOptions(courseOptions);
  const templateKey = resolveTimeTemplateKey(resolved.duration);
  const labels = [...config.templates.base[templateKey]];
  const effects = resolveMoodEffects(config, moodTags);
  const reduction = Math.abs(Math.min(effects.blockCountModifier, 0));
  while (reduction > 0 && labels.length > 2) {
    labels.pop();
  }
  return labels;
}

function recentExcludedCategories(
  feedbackEvents: FeedbackEvent[] | undefined,
): Set<PlaceCategory> {
  const excluded = new Set<PlaceCategory>();
  if (!feedbackEvents) return excluded;
  for (const event of feedbackEvents) {
    const category = event.context_tags.place_category;
    if (category) excluded.add(category);
  }
  return excluded;
}

/** "_근교" 접미사는 "해당 권역 또는 근교"를 뜻하는 변형 표기 — 동일 권역으로 정규화한다. */
const VICINITY_SUFFIX = /_근교$/;

/**
 * destination 문자열을 canonical 권역 id로 정규화한다.
 * 예: "인천_근교" → "인천", "속초_근교" → "속초". 순수 함수, IO 없음.
 */
export function canonicalizeDestination(raw: string): string {
  return raw.trim().replace(VICINITY_SUFFIX, "");
}

/**
 * tier 기반 region 게이트. variant A(extend_range 없음)는 home과 같은
 * tier만, variant B(extend_range)는 ICN_METRO∪CAPITAL_EXT로 cap한다 —
 * 더 이상 무조건 전체 우회하지 않는다(T2, 2026-06-18). home이 EXCLUDED
 * tier(예: 경주처럼 day-trip allow-list 밖)면 정확 일치만 허용하는 legacy
 * 동작을 유지한다(여행 mode는 deferred — 이 분기를 더 다듬지 않는다).
 *
 * swap-spot.ts가 이 함수를 그대로 import해 동일 게이트를 공유한다 — 과거
 * 감사가 지적한 "동일 로직 두 곳에 복붙되어 드리프트" 문제를 여기서 해소.
 */
export function passesRegionGate(
  place: Place,
  homeRegion: string,
  moodTags: string[],
): boolean {
  const homeTier = resolveRegionTier(canonicalizeDestination(homeRegion));
  const placeTier = resolveRegionTier(canonicalizeDestination(place.destination));
  const extendRange = moodTags.includes("extend_range");

  if (homeTier === "EXCLUDED") {
    if (extendRange) {
      return placeTier === "ICN_METRO" || placeTier === "CAPITAL_EXT";
    }
    return (
      canonicalizeDestination(place.destination) ===
      canonicalizeDestination(homeRegion)
    );
  }

  if (extendRange) {
    return placeTier === "ICN_METRO" || placeTier === "CAPITAL_EXT";
  }

  return placeTier === homeTier;
}

function collectCanonicalIdsInTiers(
  places: Place[],
  tiers: readonly RegionTier[],
): Set<string> {
  const ids = new Set<string>();
  for (const place of places) {
    const canon = canonicalizeDestination(place.destination);
    if (tiers.includes(resolveRegionTier(canon))) {
      ids.add(canon);
    }
  }
  return ids;
}

/**
 * label별 카테고리 카운트(독립 집계)만 보면, 같은 한 장소가 여러 label의
 * 결손을 동시에 "메우는 것"처럼 보이는 착시가 생긴다(예: view 1곳뿐인데
 * 출발·오후 둘 다 view로 충족된다고 오판) — 그러면 실제로는 spillover가
 * 필요한데도 "단독 충분"으로 잘못 판정해, 런타임에서 단일-최근접
 * spillover 단계를 건너뛰고 곧장 tier 전체 풀로 점프(2-destination 상한
 * 위반 위험)하게 된다. label 순서대로 미사용 장소를 그리디 배정해 distinct
 * 매칭이 실제로 가능한지 본다 — 최적 매칭은 아니지만 과소판정(거짓 "충분")
 * 방지에는 충분히 보수적이다.
 */
/** {@link isExcludedByWeatherRules}에 묶어 넘기는 활성 조건+규칙 쌍 */
type WeatherGate = {
  activeConditions: readonly WeatherCondition[];
  rules: readonly WeatherExclusionRule[];
};

const NO_WEATHER_GATE: WeatherGate = { activeConditions: [], rules: [] };

function destinationsSatisfyAllLabels(
  places: Place[],
  canonicalIds: ReadonlySet<string>,
  timeLabels: readonly TimeLabel[],
  config: AppConfig,
  mode: "family" | "couple",
  weatherGate: WeatherGate,
): boolean {
  const eligible = places.filter((place) => {
    if (mode === "family" && place.no_kids_zone === true) return false;
    if (isExcludedByWeatherRules(place, weatherGate.activeConditions, weatherGate.rules)) {
      return false;
    }
    return canonicalIds.has(canonicalizeDestination(place.destination));
  });

  const usedIds = new Set<string>();
  for (const label of timeLabels) {
    const allowedCategories = config.templates.block_category_map[label];
    const match = eligible.find(
      (place) => !usedIds.has(place.id) && allowedCategories.includes(place.category),
    );
    if (!match) return false;
    usedIds.add(match.id);
  }
  return true;
}

/**
 * home destination 단독으로 timeLabels를 못 채울 때, 같은(또는 확장된) tier
 * 안에서 centroid가 가장 가까우면서 home과 합쳐 전체를 충족시키는 destination
 * 1곳을 찾는다. 완전히 충족시키는 후보가 없으면 가장 가까운 후보를 그대로
 * 반환한다(나머지 결손은 generateCourse의 tier-wide 최종 안전망이 처리).
 */
function resolveNearestSufficientSpillover(
  places: Place[],
  homeCanonical: string,
  allowedTiers: readonly RegionTier[],
  timeLabels: readonly TimeLabel[],
  config: AppConfig,
  mode: "family" | "couple",
  weatherGate: WeatherGate,
): string | null {
  const candidateIds = [...collectCanonicalIdsInTiers(places, allowedTiers)].filter(
    (id) => id !== homeCanonical,
  );
  if (candidateIds.length === 0) return null;

  const sorted = candidateIds
    .map((id) => ({ id, dist: resolveCentroidDistanceKm(homeCanonical, id) }))
    .filter((entry): entry is { id: string; dist: number } => entry.dist !== null)
    .sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));

  if (sorted.length === 0) return null;

  const withinDayTripRadius = sorted.filter((c) => c.dist <= MAX_SPILLOVER_DISTANCE_KM);

  // 1차: 당일 코스 반경(40km) 안에서 충족 후보 탐색
  for (const candidate of withinDayTripRadius) {
    const combined = new Set([homeCanonical, candidate.id]);
    if (destinationsSatisfyAllLabels(places, combined, timeLabels, config, mode, weatherGate)) {
      return candidate.id;
    }
  }

  // 2차: 반경 안에 충족 후보가 없으면 전체 allowedTiers로 확장(0-stop 방지 우선)
  for (const candidate of sorted) {
    const combined = new Set([homeCanonical, candidate.id]);
    if (destinationsSatisfyAllLabels(places, combined, timeLabels, config, mode, weatherGate)) {
      return candidate.id;
    }
  }

  return withinDayTripRadius[0]?.id ?? sorted[0]!.id;
}

type ActiveDestinationPlan = {
  /** 1차 시도 — home만(또는 home이 EXCLUDED tier고 extend_range면 tier 전체) */
  primary: Set<string>;
  /** spillover 포함 2차 시도. null이면 spillover 불필요/불가 */
  withSpillover: Set<string> | null;
  /** 최종 안전망 — 허용된 tier 전체(JOKER 직전 마지막 시도) */
  tierWide: Set<string>;
};

/**
 * 이번 트립에서 어떤 destination(들)을 쓸지 한 번만 결정한다(블록마다 다시
 * 계산하지 않음) — single-region 우선, 부족할 때만 spillover 1곳 추가,
 * 최대 2 destination/여정(T2.0 승인안).
 */
function buildActiveDestinationPlan(
  places: Place[],
  homeRegion: string,
  moodTags: string[],
  timeLabels: readonly TimeLabel[],
  config: AppConfig,
  mode: "family" | "couple",
  weatherGate: WeatherGate,
): ActiveDestinationPlan {
  const homeCanonical = canonicalizeDestination(homeRegion);
  const homeTier = resolveRegionTier(homeCanonical);
  const extendRange = moodTags.includes("extend_range");

  if (homeTier === "EXCLUDED") {
    if (!extendRange) {
      const onlyHome = new Set([homeCanonical]);
      return { primary: onlyHome, withSpillover: null, tierWide: onlyHome };
    }
    const tierWide = collectCanonicalIdsInTiers(places, [
      "ICN_METRO",
      "CAPITAL_EXT",
    ]);
    return { primary: tierWide, withSpillover: null, tierWide };
  }

  const allowedTiers: RegionTier[] = extendRange
    ? ["ICN_METRO", "CAPITAL_EXT"]
    : [homeTier];
  const tierWide = collectCanonicalIdsInTiers(places, allowedTiers);
  const primary = new Set([homeCanonical]);

  if (destinationsSatisfyAllLabels(places, primary, timeLabels, config, mode, weatherGate)) {
    return { primary, withSpillover: null, tierWide };
  }

  const spilloverId = resolveNearestSufficientSpillover(
    places,
    homeCanonical,
    allowedTiers,
    timeLabels,
    config,
    mode,
    weatherGate,
  );
  const withSpillover = spilloverId
    ? new Set([homeCanonical, spilloverId])
    : null;

  return { primary, withSpillover, tierWide };
}

/** 내보낸 이유: pickPlaceForBlock 내부에서만 쓰이지만, T5(2026-06-18) stroller_friendly
 * 가산이 실제로 점수에 반영되는지 단위 테스트로 직접 확인하려면 export가 필요하다 —
 * deterministicIndex의 top-5 추첨 단계까지 거치면 가산 효과가 선택 결과에 항상
 * 드러나지 않을 수 있어(동률 후보가 여럿이면 추첨), 점수 자체를 직접 검증한다. */
export function weightedScore(
  place: Place,
  mode: "family" | "couple",
  categories: PlaceCategory[],
  indoorBias: number,
  strollerFriendlyBonus: number,
): number {
  let score = 1;
  if (categories.includes(place.category)) score += 3;
  if (mode === "couple" && (place.category === "cafe" || place.category === "view")) {
    score *= 1.5;
  }
  if (place.is_outdoor === false && indoorBias > 0) score += indoorBias;
  // T5(2026-06-18): family(=kids 컨텍스트)에서 stroller_friendly 장소 가산 — config 값
  if (mode === "family" && place.stroller_friendly === true) {
    score += strollerFriendlyBonus;
  }
  return score;
}

type PoolFilterParams = {
  mode: "family" | "couple";
  /** 이번 시도에서 허용되는 canonical destination id 집합 — home만, home+spillover, 또는 tier 전체 */
  allowedDestinations: ReadonlySet<string>;
  usedPlaceIds: Set<string>;
  excludedCategories: Set<PlaceCategory>;
  indoorOnly: boolean;
  /** true면 excludeIds(이전 일차) 필터를 무시 */
  relaxExclude?: boolean;
  weatherGate: WeatherGate;
};

function filterPool(places: Place[], params: PoolFilterParams): Place[] {
  return places.filter((place) => {
    if (!params.relaxExclude && params.usedPlaceIds.has(place.id)) return false;
    if (params.mode === "family" && place.no_kids_zone === true) return false;
    if (params.indoorOnly && place.is_outdoor === true) return false;
    if (params.excludedCategories.has(place.category)) return false;
    // 폭염 등 하드-제외 — no_kids_zone과 동일하게 relax level로도 풀리지 않는 불변 조건
    if (
      isExcludedByWeatherRules(
        place,
        params.weatherGate.activeConditions,
        params.weatherGate.rules,
      )
    ) {
      return false;
    }
    if (!params.allowedDestinations.has(canonicalizeDestination(place.destination))) {
      return false;
    }
    return true;
  });
}

/**
 * 후보 풀에 preferredCategories와 일치하는 미사용 장소가 1건이라도 있는지
 * 본다. pickPlaceForBlock의 relax level은 카테고리 불일치 장소도 점수만
 * 낮춰서 반환하므로(완전 empty가 아니면 null을 반환하지 않음), spillover
 * 확장 여부는 이 "카테고리 일치 존재"로 판단해야 한다 — null 여부로는
 * 판단할 수 없다.
 */
function destinationSetHasPreferredCategory(
  places: Place[],
  allowedDestinations: ReadonlySet<string>,
  preferredCategories: PlaceCategory[],
  mode: "family" | "couple",
  usedPlaceIds: ReadonlySet<string>,
  weatherGate: WeatherGate,
): boolean {
  return places.some((place) => {
    if (usedPlaceIds.has(place.id)) return false;
    if (mode === "family" && place.no_kids_zone === true) return false;
    if (isExcludedByWeatherRules(place, weatherGate.activeConditions, weatherGate.rules)) {
      return false;
    }
    if (!allowedDestinations.has(canonicalizeDestination(place.destination))) {
      return false;
    }
    return preferredCategories.includes(place.category);
  });
}

type RelaxLevel = 0 | 1 | 2;

function pickPlaceForBlock(
  places: Place[],
  params: Omit<PoolFilterParams, "relaxExclude"> & {
    preferredCategories: PlaceCategory[];
    indoorBias: number;
    strollerFriendlyBonus: number;
    seed: string;
    blockUsedIds: Set<string>;
  },
): { place: Place | null; relaxed: boolean } {
  const base: PoolFilterParams = {
    ...params,
    usedPlaceIds: new Set([...params.usedPlaceIds, ...params.blockUsedIds]),
  };

  const levels: { relaxExclude: boolean; excludedCategories: Set<PlaceCategory> }[] =
    [
      { relaxExclude: false, excludedCategories: params.excludedCategories },
      { relaxExclude: false, excludedCategories: new Set() },
      { relaxExclude: true, excludedCategories: new Set() },
    ];

  for (let level = 0; level < levels.length; level++) {
    const levelParams = levels[level]!;
    const candidates = filterPool(places, {
      ...base,
      relaxExclude: levelParams.relaxExclude,
      excludedCategories: levelParams.excludedCategories,
    });

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const scoreA = weightedScore(
        a,
        params.mode,
        params.preferredCategories,
        params.indoorBias,
        params.strollerFriendlyBonus,
      );
      const scoreB = weightedScore(
        b,
        params.mode,
        params.preferredCategories,
        params.indoorBias,
        params.strollerFriendlyBonus,
      );
      return scoreB - scoreA;
    });

    const top = candidates.slice(0, Math.min(5, candidates.length));
    const place = top[deterministicIndex(params.seed, top.length)] ?? null;
    if (place) {
      return { place, relaxed: (level as RelaxLevel) > 0 };
    }
  }

  return { place: null, relaxed: true };
}

/**
 * 단일 일차 5시간 분량의 장소 코스를 생성한다.
 * excludeIds로 이전 일차 방문 장소를 제외한다.
 */
export function generateCourse(params: GenerateCourseParams): GenerateCourseResult {
  const {
    places,
    config,
    destination,
    mode,
    mood_tags,
    origin = "",
    courseOptions,
    excludeIds,
    dayIndex = 0,
    feedback_events = [],
    weatherConditions = [],
    sunsetTime,
  } = params;

  const resolvedCourseOptions = resolveCourseOptions(courseOptions);
  const effects = resolveMoodEffects(config, mood_tags);
  const excludedCategories = recentExcludedCategories(feedback_events);
  const timeLabels = halfDayLabels(config, mood_tags, resolvedCourseOptions);
  const excludeSet = excludeIds ?? new Set<string>();
  const blockUsedIds = new Set<string>();
  const course: Place[] = [];
  let poolExhausted = false;
  let anyRelaxed = false;
  const weatherGate: WeatherGate = weatherConditions.length
    ? { activeConditions: weatherConditions, rules: config.weather_exclusion_rules }
    : NO_WEATHER_GATE;

  // T4(2026-06-18): is_outdoor phase가 일몰 이후로 끝나면 안 됨 — 재배치 대신
  // "그 블록을 강제 실내 전용으로" 선제 차단한다(swap-spot처럼 사후 대체가
  // 아니라 선택 시점에 막아 항상 만족시킴). 폭염/한파일엔 weatherGate가 이미
  // 모든 야외를 막으므로 이 제약은 사실상 비-폭염·비-한파일에만 작동한다.
  const sunsetMinutes = sunsetTime ? parseClockTimeToMinutes(sunsetTime) : null;
  const phaseWindows =
    sunsetMinutes !== null
      ? resolvePhaseClockWindows(
          timeLabels,
          config,
          resolvedCourseOptions.duration,
          config.default_departure_time,
        )
      : null;

  const destinationPlan = buildActiveDestinationPlan(
    places,
    destination,
    mood_tags,
    timeLabels,
    config,
    mode,
    weatherGate,
  );
  /** spillover로 한 번 전환되면 그 일차의 나머지 블록도 계속 spillover를 쓴다
   * — home↔spillover를 블록마다 왔다갔다 하지 않는다(와리가리 금지). */
  let usingSpillover = false;

  for (let blockIndex = 0; blockIndex < timeLabels.length; blockIndex++) {
    const timeLabel = timeLabels[blockIndex]!;
    const preferredCategories = config.templates.block_category_map[timeLabel];
    const seed = [
      resolvedCourseOptions.duration,
      origin,
      mood_tags.join(","),
      mode,
      dayIndex,
      blockIndex,
      timeLabel,
    ].join("|");

    const forceIndoorForSunset =
      phaseWindows !== null &&
      sunsetMinutes !== null &&
      phaseWindows[blockIndex]!.end_minutes > sunsetMinutes;

    const pickParams = {
      mode,
      usedPlaceIds: excludeSet,
      excludedCategories,
      indoorOnly: effects.indoorOnly || forceIndoorForSunset,
      preferredCategories,
      indoorBias: effects.indoorBias,
      strollerFriendlyBonus: config.stroller_friendly_bonus,
      seed,
      blockUsedIds,
      weatherGate,
    };

    const blockUsedSoFar = new Set([...excludeSet, ...blockUsedIds]);

    // 후보 scope를 좁은 것→넓은 것 순으로 시도 — preferredCategories와
    // 일치하는 미사용 장소가 있는 첫 scope를 채택한다. 이미 spillover로
    // 전환됐으면 home 단독으로는 되돌아가지 않는다(와리가리 금지).
    const scopeCandidates: ReadonlySet<string>[] = usingSpillover
      ? [destinationPlan.withSpillover ?? destinationPlan.tierWide, destinationPlan.tierWide]
      : [
          destinationPlan.primary,
          ...(destinationPlan.withSpillover ? [destinationPlan.withSpillover] : []),
          destinationPlan.tierWide,
        ];

    let allowedDestinations: ReadonlySet<string> = scopeCandidates[scopeCandidates.length - 1]!;
    for (const scope of scopeCandidates) {
      if (
        destinationSetHasPreferredCategory(
          places,
          scope,
          preferredCategories,
          mode,
          blockUsedSoFar,
          weatherGate,
        )
      ) {
        allowedDestinations = scope;
        break;
      }
    }

    if (allowedDestinations !== destinationPlan.primary) {
      usingSpillover = true;
    }

    let { place, relaxed } = pickPlaceForBlock(places, {
      ...pickParams,
      allowedDestinations,
    });

    if (relaxed) anyRelaxed = true;

    if (place) {
      course.push(place);
      blockUsedIds.add(place.id);
    } else {
      console.warn(
        "[generateCourse] pool exhausted for block — Joker fallback",
        { dayIndex, blockIndex, timeLabel, destination },
      );
      course.push(JOKER_FALLBACK_PLACE);
      poolExhausted = true;
    }
  }

  if (anyRelaxed && !poolExhausted) {
    poolExhausted = true;
  }

  return {
    course,
    ...(poolExhausted ? { pool_exhausted: true } : {}),
  };
}

/**
 * duration(일수)만큼 generateCourse를 반복 호출하여 멀티-블록 코스를 생성한다.
 * visitedIds는 루프 외부에서 누적 관리된다.
 */
export function generateMultiDayCourse(
  params: GenerateMultiDayCourseParams,
): GenerateMultiDayCourseResult {
  const dayCount = clampTripDuration(params.duration);
  const visitedIds = new Set<string>();
  const blocks: CourseDayBlock[] = [];
  let poolExhausted = false;

  for (let day = 1; day <= dayCount; day++) {
    const result = generateCourse({
      ...params,
      dayIndex: day - 1,
      excludeIds: new Set(visitedIds),
    });

    blocks.push({ day, course: result.course });

    for (const place of result.course) {
      if (place.id !== JOKER_FALLBACK_PLACE.id) {
        visitedIds.add(place.id);
      }
    }

    if (result.pool_exhausted) {
      poolExhausted = true;
    }
  }

  return {
    blocks,
    ...(poolExhausted ? { pool_exhausted: true } : {}),
  };
}

export function coursePlaceIds(blocks: CourseDayBlock[]): string[] {
  return blocks.flatMap((block) => block.course.map((place) => place.id));
}

export function assertNoCrossDayDuplicates(blocks: CourseDayBlock[]): boolean {
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const place of block.course) {
      if (seen.has(place.id)) return false;
      seen.add(place.id);
    }
  }
  return true;
}
