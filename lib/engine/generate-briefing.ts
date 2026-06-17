import {
  fillDescTemplate,
  resolveMoodEffects,
  weatherKeyFromRainProb,
} from "./apply-config";
import {
  generateMultiDayCourse,
  halfDayLabels,
  type CourseDayBlock,
  type TripDurationDays,
} from "./course-generator";
import type {
  AppConfig,
  Block,
  Briefing,
  GenerateBriefingInput,
  PlaceCategory,
} from "./types";
import { TIME_LABELS } from "./types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

function resolveTransportAdvice(moodTags: string[]): string {
  if (moodTags.includes("extend_range")) return "원거리 — 자차·KTX·항공";
  return "근교 — 자차 이동";
}

function resolveDot(category: PlaceCategory): Block["dot"] {
  if (category === "meal") return "accent";
  if (category === "kids") return "green";
  return "default";
}

/** 모든 모드 공통 기본 준비물 */
const CHECKLIST_BASE_ITEMS = ["여권·신분증", "보조배터리"] as const;

/** family 모드 필수 준비물 */
const CHECKLIST_FAMILY_ITEMS = ["기저귀·물티슈", "아이 간식"] as const;

const CHECKLIST_RAIN_ITEM = "우산·우비";

type ChecklistRuleContext = {
  config: AppConfig;
  mode: "family" | "couple";
  rainProb: string;
};

/**
 * 유모차·동선 관련 체크리스트 (추후 places 메타데이터 등으로 데이터화 예정).
 * 현재는 사용하지 않으므로 빈 배열을 반환한다.
 */
function resolveStrollerChecklistItems(_ctx: ChecklistRuleContext): string[] {
  return [];
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
): string[] {
  const ctx: ChecklistRuleContext = { config, mode, rainProb };
  const items = new Set<string>([
    ...CHECKLIST_BASE_ITEMS,
    ...resolveFamilyChecklistItems(mode),
    ...resolveRainChecklistItems(ctx),
    ...resolveStrollerChecklistItems(ctx),
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

  return courseDays.map((dayBlock, dayIndex) => {
    const blocks: Block[] = dayBlock.course.map((place, blockIndex) => {
      const timeLabel = timeLabels[blockIndex] ?? timeLabels[timeLabels.length - 1]!;
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

  const multiDay = generateMultiDayCourse({
    duration: resolveTripDuration(normalized.trip_days),
    courseOptions: { duration: normalized.duration },
    places,
    config,
    destination: homeRegion,
    mode: normalized.mode,
    mood_tags: normalized.mood_tags,
    origin: normalized.origin,
    feedback_events,
  });

  const days = blocksFromCourseDays(multiDay.blocks, input, weatherKey, rainNumeric);

  const transportAdvice = resolveTransportAdvice(normalized.mood_tags);
  const checklist = buildChecklist(config, normalized.mode, weather.rain_prob);
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
