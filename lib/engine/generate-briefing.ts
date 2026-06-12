import {
  fillDescTemplate,
  resolveMoodEffects,
  RAIN_PROB_THRESHOLD,
  weatherKeyFromRainProb,
} from "@/lib/config/mood-tags.config";
import type {
  Block,
  Briefing,
  GenerateBriefingInput,
  Place,
  PlaceCategory,
  TimeLabel,
} from "./types";
import { TIME_LABELS } from "./types";
import { HOME_ADDRESS } from "./normalize";

const ORIGIN_COORDS: Record<string, { lat: number; lng: number }> = {
  [HOME_ADDRESS]: { lat: 37.382, lng: 126.657 },
};

const BLOCK_CATEGORY_MAP: Record<TimeLabel, PlaceCategory[]> = {
  출발: ["view", "cafe"],
  "도착 후": ["cafe", "view"],
  오전: ["cafe", "view", "kids"],
  점심: ["meal", "cafe"],
  오후: ["activity", "view", "kids"],
  저녁: ["meal", "cafe"],
  밤: ["cafe", "view"],
};

const BASE_TEMPLATES: Record<string, TimeLabel[]> = {
  short: ["출발", "점심", "오후"],
  half_day: ["출발", "점심", "오후", "저녁"],
  full_day: ["출발", "오전", "점심", "오후", "저녁"],
  multi_day: ["도착 후", "오전", "점심", "오후", "저녁"],
};

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveOriginCoords(origin: string): { lat: number; lng: number } {
  return ORIGIN_COORDS[origin] ?? ORIGIN_COORDS[HOME_ADDRESS];
}

function deterministicIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}

function lookupBlockTemplate(duration: number, moodTags: string[]): TimeLabel[] {
  let labels: TimeLabel[];
  if (duration <= 4) {
    labels = [...BASE_TEMPLATES.short];
  } else if (duration <= 8) {
    labels = [...BASE_TEMPLATES.half_day];
  } else if (duration <= 16) {
    labels = [...BASE_TEMPLATES.full_day];
  } else {
    labels = [...BASE_TEMPLATES.multi_day];
  }

  const effects = resolveMoodEffects(moodTags);
  const reduction = Math.abs(Math.min(effects.blockCountModifier, 0));
  while (reduction > 0 && labels.length > 2) {
    labels.pop();
  }

  return labels;
}

function buildDayPlan(
  duration: number,
  moodTags: string[],
): { label: string; title: string; blocks: TimeLabel[] }[] {
  if (duration <= 16) {
    const blocks = lookupBlockTemplate(duration, moodTags);
    return [{ label: "1일차", title: "당일 코스", blocks }];
  }

  const dayCount = Math.min(3, Math.max(2, Math.ceil(duration / 24)));
  const dayBlocks = lookupBlockTemplate(8, moodTags);

  return Array.from({ length: dayCount }, (_, index) => ({
    label: `${index + 1}일차`,
    title: index === 0 ? "첫째 날" : index === dayCount - 1 ? "마지막 날" : "둘째 날",
    blocks:
      index === 0
        ? (["출발", ...dayBlocks.filter((b) => b !== "출발")] as TimeLabel[])
        : [...dayBlocks],
  }));
}

function resolveTransportAdvice(maxDistanceKm: number): string {
  if (maxDistanceKm <= 40) return "40km 이내 — 자차 이동";
  if (maxDistanceKm <= 120) return "40~120km — 자차·KTX";
  return "120km 이상 — 비행기+렌트카";
}

function conflictsWithBreakTime(timeLabel: TimeLabel, breakTime: string | null): boolean {
  if (!breakTime) return false;
  const match = breakTime.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  if (!match) return false;

  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);

  const slotRanges: Partial<Record<TimeLabel, [number, number]>> = {
    오전: [9 * 60, 12 * 60],
    점심: [11 * 60, 14 * 60],
    오후: [14 * 60, 17 * 60],
    저녁: [17 * 60, 20 * 60],
  };

  const slot = slotRanges[timeLabel];
  if (!slot) return false;

  return start < slot[1] && end > slot[0];
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

function weightedScore(
  place: Place,
  mode: "family" | "couple",
  categories: PlaceCategory[],
  indoorBias: number,
): number {
  let score = place.curtail_count;
  if (categories.includes(place.category)) score += 3;
  if (mode === "couple" && (place.category === "cafe" || place.category === "view")) {
    score *= 1.5;
  }
  if (!place.is_outdoor && indoorBias > 0) score += indoorBias;
  return score;
}

function selectPlace(
  candidates: Place[],
  seed: string,
): Place | null {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, p) => sum + Math.max(p.curtail_count, 1), 0);
  let pick = deterministicIndex(seed, totalWeight);
  for (const place of candidates) {
    const weight = Math.max(place.curtail_count, 1);
    if (pick < weight) return place;
    pick -= weight;
  }
  return candidates[0];
}

function filterPool(
  places: Place[],
  params: {
    mode: "family" | "couple";
    moodTags: string[];
    origin: string;
    timeLabel: TimeLabel;
    usedPlaceIds: Set<string>;
    excludedCategories: Set<PlaceCategory>;
  },
): Place[] {
  const effects = resolveMoodEffects(params.moodTags);
  const originCoords = resolveOriginCoords(params.origin);

  return places.filter((place) => {
    if (params.usedPlaceIds.has(place.id)) return false;
    if (params.mode === "family" && place.no_kids_zone) return false;
    if (effects.indoorOnly && place.is_outdoor) return false;
    if (conflictsWithBreakTime(params.timeLabel, place.break_time)) return false;
    if (params.excludedCategories.has(place.category)) return false;

    const distance = haversineKm(
      originCoords.lat,
      originCoords.lng,
      place.lat,
      place.lng,
    );
    return distance <= effects.radiusCapKm;
  });
}

function resolveDot(category: PlaceCategory): Block["dot"] {
  if (category === "meal") return "accent";
  if (category === "kids") return "green";
  return "default";
}

function buildChecklist(
  selectedPlaces: Place[],
  mode: "family" | "couple",
  rainProb: string,
): string[] {
  const items = new Set<string>(["여권·신분증", "보조배터리"]);

  const numericRain = parseInt(rainProb.replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(numericRain) && numericRain >= RAIN_PROB_THRESHOLD) {
    items.add("우산·우비");
  }

  if (mode === "family") {
    items.add("기저귀·물티슈");
    items.add("아이 간식");
  }

  for (const place of selectedPlaces) {
    if (place.notes) items.add(place.notes);
  }

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
  const { normalized, places, feedback_events } = input;
  const weather = input.weather ?? defaultWeather();
  const destination =
    input.destination ?? places[0]?.destination ?? "인천_근교";
  const dateLabel = input.date_label ?? "2026년 6월 12일(금)";

  const effects = resolveMoodEffects(normalized.mood_tags);
  const excludedCategories = recentExcludedCategories(feedback_events);
  const weatherKey = weatherKeyFromRainProb(weather.rain_prob);
  const rainNumeric = parseInt(weather.rain_prob.replace(/[^0-9]/g, ""), 10);

  const dayPlan = buildDayPlan(normalized.duration, normalized.mood_tags);
  const usedPlaceIds = new Set<string>();
  const selectedPlaces: Place[] = [];

  const days = dayPlan.map((day, dayIndex) => {
    const blocks: Block[] = [];

    day.blocks.forEach((timeLabel, blockIndex) => {
      const preferredCategories = BLOCK_CATEGORY_MAP[timeLabel];
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
        origin: normalized.origin,
        timeLabel,
        usedPlaceIds,
        excludedCategories,
      });

      if (candidates.length === 0) {
        candidates = filterPool(places, {
          mode: normalized.mode,
          moodTags: normalized.mood_tags,
          origin: normalized.origin,
          timeLabel,
          usedPlaceIds: new Set(),
          excludedCategories: new Set(),
        });
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
      const place = selectPlace(topCandidates, seed);
      if (!place) return;

      usedPlaceIds.add(place.id);
      selectedPlaces.push(place);

      const relaxedPrefix = effects.relaxedLabels ? "여유롭게 " : "";
      const desc = fillDescTemplate(
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

      if (place.is_outdoor) {
        if (
          Number.isFinite(rainNumeric) &&
          rainNumeric >= RAIN_PROB_THRESHOLD &&
          place.backup_place_id
        ) {
          const backup = places.find((p) => p.id === place.backup_place_id);
          block.weather_backup = {
            place_id: place.backup_place_id,
            reason: backup
              ? `우천 시 ${backup.name}(으)로 대체`
              : "우천 시 실내 대안",
          };
        } else {
          block.weather_note = "야외 장소 — 날씨 확인 후 이동";
        }
      }

      blocks.push(block);
    });

    return { label: day.label, title: day.title, blocks };
  });

  const originCoords = resolveOriginCoords(normalized.origin);
  const maxDistance = selectedPlaces.reduce((max, place) => {
    const d = haversineKm(originCoords.lat, originCoords.lng, place.lat, place.lng);
    return Math.max(max, d);
  }, 0);

  const transportAdvice = resolveTransportAdvice(maxDistance);
  const checklist = buildChecklist(selectedPlaces, normalized.mode, weather.rain_prob);
  checklist.unshift(transportAdvice);

  return {
    destination,
    date_label: dateLabel,
    weather,
    days,
    checklist,
  };
}

export function assertValidTimeLabels(briefing: Briefing): boolean {
  return briefing.days.every((day) =>
    day.blocks.every((block) => TIME_LABELS.includes(block.time_label)),
  );
}
