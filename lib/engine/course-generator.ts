import { resolveMoodEffects } from "./apply-config";
import type {
  AppConfig,
  FeedbackEvent,
  Place,
  PlaceCategory,
  TimeLabel,
} from "./types";

/** 하루 코스 기준 운영 시간 (5시간) */
export const COURSE_BLOCK_HOURS = 5;

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
  /** 이전 일차에서 방문한 장소 — 중복 방지 */
  excludeIds?: Set<string>;
  /** 0-based 일차 인덱스 (시드·템플릿 분기) */
  dayIndex?: number;
  feedback_events?: FeedbackEvent[];
};

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

function deterministicIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}

export function halfDayLabels(config: AppConfig, moodTags: string[]): TimeLabel[] {
  const labels = [...config.templates.base.half_day];
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

function passesRegionGate(
  place: Place,
  homeRegion: string,
  moodTags: string[],
): boolean {
  if (moodTags.includes("extend_range")) return true;
  if (place.destination === homeRegion) return true;
  return (
    place.destination.includes(homeRegion) || homeRegion.includes(place.destination)
  );
}

function weightedScore(
  place: Place,
  mode: "family" | "couple",
  categories: PlaceCategory[],
  indoorBias: number,
): number {
  let score = 1;
  if (categories.includes(place.category)) score += 3;
  if (mode === "couple" && (place.category === "cafe" || place.category === "view")) {
    score *= 1.5;
  }
  if (place.is_outdoor === false && indoorBias > 0) score += indoorBias;
  return score;
}

type PoolFilterParams = {
  mode: "family" | "couple";
  moodTags: string[];
  homeRegion: string;
  usedPlaceIds: Set<string>;
  excludedCategories: Set<PlaceCategory>;
  indoorOnly: boolean;
  /** true면 excludeIds(이전 일차) 필터를 무시 */
  relaxExclude?: boolean;
};

function filterPool(places: Place[], params: PoolFilterParams): Place[] {
  return places.filter((place) => {
    if (!params.relaxExclude && params.usedPlaceIds.has(place.id)) return false;
    if (params.mode === "family" && place.no_kids_zone === true) return false;
    if (params.indoorOnly && place.is_outdoor === true) return false;
    if (params.excludedCategories.has(place.category)) return false;
    if (!passesRegionGate(place, params.homeRegion, params.moodTags)) return false;
    return true;
  });
}

type RelaxLevel = 0 | 1 | 2;

function pickPlaceForBlock(
  places: Place[],
  params: Omit<PoolFilterParams, "relaxExclude"> & {
    preferredCategories: PlaceCategory[];
    indoorBias: number;
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
      );
      const scoreB = weightedScore(
        b,
        params.mode,
        params.preferredCategories,
        params.indoorBias,
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
    excludeIds,
    dayIndex = 0,
    feedback_events = [],
  } = params;

  const effects = resolveMoodEffects(config, mood_tags);
  const excludedCategories = recentExcludedCategories(feedback_events);
  const timeLabels = halfDayLabels(config, mood_tags);
  const excludeSet = excludeIds ?? new Set<string>();
  const blockUsedIds = new Set<string>();
  const course: Place[] = [];
  let poolExhausted = false;
  let anyRelaxed = false;

  for (let blockIndex = 0; blockIndex < timeLabels.length; blockIndex++) {
    const timeLabel = timeLabels[blockIndex]!;
    const preferredCategories = config.templates.block_category_map[timeLabel];
    const seed = [
      COURSE_BLOCK_HOURS,
      origin,
      mood_tags.join(","),
      mode,
      dayIndex,
      blockIndex,
      timeLabel,
    ].join("|");

    const { place, relaxed } = pickPlaceForBlock(places, {
      mode,
      moodTags: mood_tags,
      homeRegion: destination,
      usedPlaceIds: excludeSet,
      excludedCategories,
      indoorOnly: effects.indoorOnly,
      preferredCategories,
      indoorBias: effects.indoorBias,
      seed,
      blockUsedIds,
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
