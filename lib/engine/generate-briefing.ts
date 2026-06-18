import {
  fillDescTemplate,
  resolveMoodEffects,
  weatherKeyFromRainProb,
} from "./apply-config";
import {
  canonicalizeDestination,
  generateMultiDayCourse,
  halfDayLabels,
  type CourseDayBlock,
  type TripDurationDays,
} from "./course-generator";
import { resolvePhaseClockWindows } from "./phase-schedule";
import { resolveRegionTier } from "./region-tiers";
import type {
  AppConfig,
  Block,
  Briefing,
  GenerateBriefingInput,
  PlaceCategory,
} from "./types";
import { TIME_LABELS } from "./types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

/**
 * 당일치기(trip_days===1) ∩ 근거리(ICN_METRO/CAPITAL_EXT)인지 — T5(2026-06-18).
 * T2가 extend_range를 CAPITAL_EXT로 cap한 이후로는 extend_range 자체가 더
 * 이상 "원거리"를 의미하지 않는다(항상 ICN_METRO∪CAPITAL_EXT 안에 머문다) —
 * 그래서 이 판정은 mood_tags가 아니라 destination의 실제 region tier로 한다.
 * EXCLUDED tier(예: 경주 직접 지정)만 "원거리"로 본다.
 */
function isDayTripNear(homeRegion: string, tripDuration: number): boolean {
  const tier = resolveRegionTier(canonicalizeDestination(homeRegion));
  return tripDuration === 1 && tier !== "EXCLUDED";
}

function resolveTransportAdvice(isNear: boolean): string {
  return isNear ? "근교 — 자차 이동" : "원거리 — 자차·KTX·항공";
}

function resolveDot(category: PlaceCategory): Block["dot"] {
  if (category === "meal") return "accent";
  if (category === "kids") return "green";
  return "default";
}

/** 모든 모드·거리 공통 기본 준비물 — 여행(원거리·숙박) 전용 항목은 별도로 분리 */
const CHECKLIST_BASE_ITEMS = ["보조배터리"] as const;

/** 원거리(EXCLUDED tier) 또는 숙박 일정에서만 등장 — 당일·근거리는 하드 제외(T5) */
const CHECKLIST_TRAVEL_ITEMS = ["여권·신분증"] as const;

/** family 모드 필수 준비물 */
const CHECKLIST_FAMILY_ITEMS = ["기저귀·물티슈", "아이 간식"] as const;

const CHECKLIST_RAIN_ITEM = "우산·우비";

/** has_nursing_room=true 장소에 노출하는 케어 포인트(T5) */
const CARE_NOTE_NURSING_ROOM = "수유실 완비";

type ChecklistRuleContext = {
  config: AppConfig;
  mode: "family" | "couple";
  rainProb: string;
  isNear: boolean;
};

function resolveTravelChecklistItems(ctx: ChecklistRuleContext): string[] {
  if (ctx.isNear) return [];
  return [...CHECKLIST_TRAVEL_ITEMS];
}

function resolveRainChecklistItems(ctx: ChecklistRuleContext): string[] {
  const numericRain = parseInt(ctx.rainProb.replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(numericRain) && numericRain >= ctx.config.rain_prob_threshold) {
    return [CHECKLIST_RAIN_ITEM];
  }
  return [];
}

function resolveFamilyChecklistItems(mode: "family" | "couple"): string[] {
  if (mode !== "family") return [];
  return [...CHECKLIST_FAMILY_ITEMS];
}

function buildChecklist(
  config: AppConfig,
  mode: "family" | "couple",
  rainProb: string,
  isNear: boolean,
): string[] {
  const ctx: ChecklistRuleContext = { config, mode, rainProb, isNear };
  const items = new Set<string>([
    ...CHECKLIST_BASE_ITEMS,
    ...resolveTravelChecklistItems(ctx),
    ...resolveFamilyChecklistItems(mode),
    ...resolveRainChecklistItems(ctx),
  ]);
  return [...items];
}

function defaultWeather(): Briefing["weather"] {
  return {
    summary: "맑음",
    temp: "22°C",
    rain_prob: "30%",
    advice: "가벼운 겉옷을 챙기세요.",
  };
}

function dayTitleForIndex(index: number, total: number): string {
  if (total === 1) return "당일 코스";
  if (index === 0) return "첫째 날";
  if (index === total - 1) return "마지막 날";
  return "둘째 날";
}

/** 여행 일수 입력값을 generateMultiDayCourse가 받는 1~3 범위로 정규화한다. */
function resolveTripDuration(tripDays: number | undefined): TripDurationDays {
  const value = tripDays ?? 1;
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return value as TripDurationDays;
}

function blocksFromCourseDays(
  courseDays: CourseDayBlock[],
  input: GenerateBriefingInput,
  weatherKey: ReturnType<typeof weatherKeyFromRainProb>,
  rainNumeric: number,
): { label: string; title: string; blocks: Block[] }[] {
  const { normalized, config } = input;
  const moodTags = normalized.mood_tags;
  const timeLabels = halfDayLabels(config, moodTags, {
    duration: normalized.duration,
  });
  const relaxedPrefix = resolveMoodEffects(config, moodTags).relaxedLabels
    ? "여유롭게 "
    : "";
  // T4(2026-06-18): 코스 생성 시(course-generator.ts) 동일 입력으로 이미 한 번
  // 계산한 것과 같은 순수 함수를 여기서도 호출 — generateCourse 결과 타입에
  // clock window를 끼워 넣어 threading하지 않고, 같은 입력→같은 출력 보장되는
  // 순수 함수를 양쪽에서 독립 호출하는 기존 패턴(weatherKey/rainNumeric처럼)을 따른다.
  const phaseWindows = resolvePhaseClockWindows(
    timeLabels,
    config,
    normalized.duration,
    config.default_departure_time,
  );

  return courseDays.map((dayBlock, dayIndex) => {
    const blocks: Block[] = dayBlock.course.map((place, blockIndex) => {
      const timeLabel = timeLabels[blockIndex] ?? timeLabels[timeLabels.length - 1]!;
      const window = phaseWindows[blockIndex];
      const desc = fillDescTemplate(
        config,
        place.category,
        moodTags,
        weatherKey,
        place.name,
      );
      const block: Block = {
        time_label: timeLabel,
        place_id: place.id,
        title: `${relaxedPrefix}${place.name}`,
        desc,
        dot: resolveDot(place.category),
        ...(window ? { start_time: window.start_time, end_time: window.end_time } : {}),
        // T5(2026-06-18): has_nursing_room 소비 — family 모드에서만 노출(couple엔 무의미)
        ...(normalized.mode === "family" && place.has_nursing_room === true
          ? { care_note: CARE_NOTE_NURSING_ROOM }
          : {}),
      };
      if (place.is_outdoor === true) {
        if (
          Number.isFinite(rainNumeric) &&
          rainNumeric >= config.rain_prob_threshold
        ) {
          block.weather_note = "우천 시 실내 대안 검토";
        } else {
          block.weather_note = "야외 장소 — 날씨 확인 후 이동";
        }
      }
      return block;
    });

    return {
      label: `${dayBlock.day}일차`,
      title: dayTitleForIndex(dayIndex, courseDays.length),
      blocks,
    };
  });
}

export function generateBriefing(input: GenerateBriefingInput): Briefing {
  const { normalized, places, feedback_events, config } = input;
  const weather = input.weather ?? defaultWeather();
  const homeRegion = input.destination ?? FIXED_DESTINATION;
  const dateLabel = input.date_label ?? (() => {
    const f = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    const parts = f.formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}년 ${get("month")}월 ${get("day")}일(${get("weekday")})`;
  })();

  const weatherKey = weatherKeyFromRainProb(config, weather.rain_prob);
  const rainNumeric = parseInt(weather.rain_prob.replace(/[^0-9]/g, ""), 10);
  const tripDuration = resolveTripDuration(normalized.trip_days);
  const isNear = isDayTripNear(homeRegion, tripDuration);

  const multiDay = generateMultiDayCourse({
    duration: tripDuration,
    courseOptions: { duration: normalized.duration },
    places,
    config,
    destination: homeRegion,
    mode: normalized.mode,
    mood_tags: normalized.mood_tags,
    origin: normalized.origin,
    feedback_events,
    weatherConditions: weather.conditions ?? [],
    sunsetTime: input.trip_context?.sunset_time,
  });

  const days = blocksFromCourseDays(multiDay.blocks, input, weatherKey, rainNumeric);

  const transportAdvice = resolveTransportAdvice(isNear);
  const checklist = buildChecklist(config, normalized.mode, weather.rain_prob, isNear);
  checklist.unshift(transportAdvice);

  return {
    destination: homeRegion,
    date_label: dateLabel,
    weather,
    days,
    checklist,
    context_meta: input.trip_context,
    ...(multiDay.pool_exhausted ? { pool_exhausted: true } : {}),
  };
}

export function assertValidTimeLabels(briefing: Briefing): boolean {
  return briefing.days.every((day) =>
    day.blocks.every((block) => TIME_LABELS.includes(block.time_label)),
  );
}
