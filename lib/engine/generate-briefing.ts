import {
  fillDescTemplate,
  resolveMoodEffects,
  weatherKeyFromRainProb,
} from "./apply-config";
import type {
  AppConfig,
  Block,
  Briefing,
  GenerateBriefingInput,
  Place,
  PlaceCategory,
  TimeLabel,
} from "./types";
import { TIME_LABELS } from "./types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

/** DB 필터 매칭 0건 시 파이프라인 방어용 Joker 스팟 */
const JOKER_FALLBACK_PLACE: Place = {
  id: "joker-songdo-hyundai-outlet",
  destination: "인천_근교",
  name: "송도 현대프리미엄아울렛",
  category: "activity",
  is_outdoor: false,
  no_kids_zone: false,
  tags: [],
};

function deterministicIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}

function lookupBlockTemplate(
  config: AppConfig,
  duration: number,
  moodTags: string[],
): TimeLabel[] {
  const { base } = config.templates;
  let labels: TimeLabel[];
  if (duration <= 4) {
    labels = [...base.short];
  } else if (duration <= 8) {
    labels = [...base.half_day];
  } else if (duration <= 16) {
    labels = [...base.full_day];
  } else {
    labels = [...base.multi_day];
  }

  const effects = resolveMoodEffects(config, moodTags);
  const reduction = Math.abs(Math.min(effects.blockCountModifier, 0));
  while (reduction > 0 && labels.length > 2) {
    labels.pop();
  }

  return labels;
}

function buildDayPlan(
  config: AppConfig,
  duration: number,
  moodTags: string[],
): { label: string; title: string; blocks: TimeLabel[] }[] {
  if (duration <= 16) {
    const blocks = lookupBlockTemplate(config, duration, moodTags);
    return [{ label: "1일차", title: "당일 코스", blocks }];
  }

  const dayCount = Math.min(3, Math.max(2, Math.ceil(duration / 24)));
  const dayBlocks = lookupBlockTemplate(config, 8, moodTags);

  return Array.from({ length: dayCount }, (_, index) => ({
    label: `${index + 1}일차`,
    title: index === 0 ? "첫째 날" : index === dayCount - 1 ? "마지막 날" : "둘째 날",
    blocks:
      index === 0
        ? (["출발", ...dayBlocks.filter((b) => b !== "출발")] as TimeLabel[])
        : [...dayBlocks],
  }));
}

function resolveTransportAdvice(moodTags: string[]): string {
  if (moodTags.includes("extend_range")) return "원거리 — 자차·KTX·항공";
  return "근교 — 자차 이동";
}

function recentExcludedCategories(
  feedbackEvents: GenerateBriefingInput["feedback_events"],
): Set<PlaceCategory> {
  const excluded = new Set<PlaceCategory>();
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
  return place.destination === homeRegion;
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

function selectPlace(
  candidates: Place[],
  seed: string,
): Place | null {
  if (candidates.length === 0) return null;
  return candidates[deterministicIndex(seed, candidates.length)] ?? null;
}

type PoolFilterParams = {
  mode: "family" | "couple";
  moodTags: string[];
  homeRegion: string;
  usedPlaceIds: Set<string>;
  excludedCategories: Set<PlaceCategory>;
  indoorOnly: boolean;
};

function describePoolConstraints(params: PoolFilterParams): Record<string, unknown> {
  return {
    mode: params.mode,
    mood_tags: params.moodTags,
    home_region: params.homeRegion,
    extend_range: params.moodTags.includes("extend_range"),
    indoor_only: params.indoorOnly,
    used_place_count: params.usedPlaceIds.size,
    excluded_categories: [...params.excludedCategories],
  };
}

function filterPool(
  places: Place[],
  params: PoolFilterParams,
): Place[] {
  return places.filter((place) => {
    if (params.usedPlaceIds.has(place.id)) return false;
    if (params.mode === "family" && place.no_kids_zone === true) return false;
    if (params.indoorOnly && place.is_outdoor === true) return false;
    if (params.excludedCategories.has(place.category)) return false;
    if (!passesRegionGate(place, params.homeRegion, params.moodTags)) return false;
    return true;
  });
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

  const effects = resolveMoodEffects(config, normalized.mood_tags);
  const excludedCategories = recentExcludedCategories(feedback_events);
  const weatherKey = weatherKeyFromRainProb(config, weather.rain_prob);
  const rainNumeric = parseInt(weather.rain_prob.replace(/[^0-9]/g, ""), 10);

  const dayPlan = buildDayPlan(config, normalized.duration, normalized.mood_tags);
  const usedPlaceIds = new Set<string>();
  let poolExhausted = false;

  const days = dayPlan.map((day, dayIndex) => {
    const blocks: Block[] = [];

    day.blocks.forEach((timeLabel, blockIndex) => {
      const preferredCategories = config.templates.block_category_map[timeLabel];
      const seed = [
        normalized.duration,
        normalized.origin,
        normalized.mood_tags.join(","),
        normalized.mode,
        dayIndex,
        blockIndex,
        timeLabel,
      ].join("|");

      let candidates = filterPool(places, {
        mode: normalized.mode,
        moodTags: normalized.mood_tags,
        homeRegion,
        usedPlaceIds,
        excludedCategories,
        indoorOnly: effects.indoorOnly,
      });

      if (candidates.length === 0) {
        candidates = filterPool(places, {
          mode: normalized.mode,
          moodTags: normalized.mood_tags,
          homeRegion,
          usedPlaceIds: new Set(),
          excludedCategories: new Set(),
          indoorOnly: effects.indoorOnly,
        });
      }

      if (candidates.length === 0) {
        const relaxedParams: PoolFilterParams = {
          mode: normalized.mode,
          moodTags: normalized.mood_tags,
          homeRegion,
          usedPlaceIds: new Set(),
          excludedCategories: new Set(),
          indoorOnly: effects.indoorOnly,
        };
        console.warn(
          "[generate-briefing] pool exhausted — applying Joker fallback",
          {
            constraints: describePoolConstraints(relaxedParams),
            places_total: places.length,
            block: { dayIndex, blockIndex, timeLabel },
          },
        );
        candidates = [JOKER_FALLBACK_PLACE];
        poolExhausted = true;
      }

      candidates.sort((a, b) => {
        const scoreA = weightedScore(
          a,
          normalized.mode,
          preferredCategories,
          effects.indoorBias,
        );
        const scoreB = weightedScore(
          b,
          normalized.mode,
          preferredCategories,
          effects.indoorBias,
        );
        return scoreB - scoreA;
      });

      const topCandidates = candidates.slice(0, Math.min(5, candidates.length));
      const place = selectPlace(topCandidates, seed) ?? JOKER_FALLBACK_PLACE;

      usedPlaceIds.add(place.id);

      const relaxedPrefix = effects.relaxedLabels ? "여유롭게 " : "";
      const desc = fillDescTemplate(
        config,
        place.category,
        normalized.mood_tags,
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

      blocks.push(block);
    });

    return { label: day.label, title: day.title, blocks };
  });

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
    ...(poolExhausted ? { pool_exhausted: true } : {}),
  };
}

export function assertValidTimeLabels(briefing: Briefing): boolean {
  return briefing.days.every((day) =>
    day.blocks.every((block) => TIME_LABELS.includes(block.time_label)),
  );
}
