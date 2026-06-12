import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { normalize, hoursBetween } from "@/lib/engine/normalize";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { deriveVariantB, variantLabel } from "@/lib/engine/variant";
import type { FeedbackEvent, Place, TripRequest } from "@/lib/engine/types";
import { TIME_LABELS } from "@/lib/engine/types";

const places = placesFixture as Place[];
const placeIds = new Set(places.map((p) => p.id));

const baseNormalized = normalize({
  start_mode: "duration",
  duration_hours: 5,
  mood_tags: [],
  mode: "family",
});

const rainyWeather = {
  summary: "흐림",
  temp: "20°C",
  rain_prob: "70%",
  advice: "우산을 챙기세요.",
};

const feedbackEvents: FeedbackEvent[] = [];

function allBlocks(briefing: ReturnType<typeof generateBriefing>) {
  return briefing.days.flatMap((day) => day.blocks);
}

describe("normalize", () => {
  it("fixed 모드: 출발·도착 시각으로 duration 산출", () => {
    const req: TripRequest = {
      start_mode: "fixed",
      departure_time: "09:00",
      return_time: "14:00",
      mood_tags: [],
      mode: "family",
    };
    expect(normalize(req).duration).toBe(5);
    expect(hoursBetween("09:00", "14:00")).toBe(5);
  });

  it("duration 모드: duration_hours 그대로 사용", () => {
    const req: TripRequest = {
      start_mode: "duration",
      duration_hours: 6,
      mood_tags: ["relaxed_pace"],
      mode: "couple",
    };
    const result = normalize(req);
    expect(result.duration).toBe(6);
    expect(result.origin).toBeTruthy();
    expect(result.return_location).toBe(result.origin);
  });

  it("return_location은 Engine에 영향 없음 (로그 전용 필드)", () => {
    const withReturn = normalize({
      start_mode: "duration",
      duration_hours: 5,
      origin: "인천 송도",
      return_location: "김포공항",
      mood_tags: [],
      mode: "family",
    });
    const withoutReturn = normalize({
      start_mode: "duration",
      duration_hours: 5,
      origin: "인천 송도",
      mood_tags: [],
      mode: "family",
    });
    const briefingWith = generateBriefing({
      normalized: withReturn,
      places,
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });
    const briefingWithout = generateBriefing({
      normalized: withoutReturn,
      places,
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });
    expect(briefingWith).toEqual(briefingWithout);
  });
});

describe("generateBriefing — 결정론적 순수함수", () => {
  const input = {
    normalized: baseNormalized,
    places,
    feedback_events: feedbackEvents,
    weather: rainyWeather,
  };

  it("동일 입력 → 동일 출력", () => {
    const a = generateBriefing(input);
    const b = generateBriefing(input);
    expect(a).toEqual(b);
  });

  it("모든 time_label이 enum 중 하나 (clock time 없음)", () => {
    const briefing = generateBriefing(input);
    const clockPattern = /\d{1,2}:\d{2}/;

    for (const block of allBlocks(briefing)) {
      expect(TIME_LABELS).toContain(block.time_label);
      expect(clockPattern.test(block.time_label)).toBe(false);
    }
  });

  it("모든 place_id가 fixtures pool 안에 존재", () => {
    const briefing = generateBriefing(input);
    for (const block of allBlocks(briefing)) {
      expect(placeIds.has(block.place_id)).toBe(true);
      if (block.weather_backup) {
        expect(placeIds.has(block.weather_backup.place_id)).toBe(true);
      }
    }
  });

  it("is_outdoor=true 블록은 weather_backup 또는 weather_note 보유", () => {
    const briefing = generateBriefing(input);
    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      if (place.is_outdoor) {
        expect(
          block.weather_backup !== undefined || block.weather_note !== undefined,
        ).toBe(true);
      }
    }
  });
});

describe("mode 필터", () => {
  it("family 모드: no_kids_zone=true 장소 제외", () => {
    const briefing = generateBriefing({
      normalized: { ...baseNormalized, mode: "family" },
      places,
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      expect(place.no_kids_zone).toBe(false);
    }
  });

  it("couple 모드: no_kids_zone 필터 미적용", () => {
    const noKidsPlace = places.find((p) => p.no_kids_zone)!;
    const coupleBriefing = generateBriefing({
      normalized: {
        ...baseNormalized,
        mode: "couple",
        mood_tags: ["extend_range"],
      },
      places: places.filter((p) => p.id === noKidsPlace.id || p.curtail_count >= 2),
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });

    const familyBriefing = generateBriefing({
      normalized: {
        ...baseNormalized,
        mode: "family",
        mood_tags: ["extend_range"],
      },
      places: places.filter((p) => p.id === noKidsPlace.id || p.curtail_count >= 2),
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });

    const coupleIds = allBlocks(coupleBriefing).map((b) => b.place_id);
    const familyIds = allBlocks(familyBriefing).map((b) => b.place_id);

    if (coupleIds.includes(noKidsPlace.id)) {
      expect(familyIds.includes(noKidsPlace.id)).toBe(false);
    }
  });
});

describe("deriveVariantB / variantLabel", () => {
  it("deriveVariantB(A) !== A", () => {
    const cases = [
      [],
      ["extend_range"],
      ["relaxed_pace"],
      ["baby_tired", "food_light"],
      ["extend_range", "relaxed_pace"],
    ];
    for (const tags of cases) {
      const b = deriveVariantB(tags);
      expect(b).not.toEqual(tags);
    }
  });

  it("거리/페이스 축 차이 보장", () => {
    expect(deriveVariantB(["extend_range"])).not.toContain("extend_range");
    expect(deriveVariantB(["relaxed_pace"])).toContain("extend_range");
    expect(deriveVariantB(["relaxed_pace"])).not.toContain("relaxed_pace");
    expect(deriveVariantB([])).toContain("extend_range");
  });

  it("variantLabel 구분", () => {
    expect(variantLabel(["extend_range"])).toBe("원거리·확장형");
    expect(variantLabel([])).toBe("근거리·기본형");
  });

  it("A/B 브리핑이 다른 mood_tags로 생성됨", () => {
    const moodTagsA = ["relaxed_pace"];
    const moodTagsB = deriveVariantB(moodTagsA);

    const briefingA = generateBriefing({
      normalized: { ...baseNormalized, mood_tags: moodTagsA },
      places,
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });
    const briefingB = generateBriefing({
      normalized: { ...baseNormalized, mood_tags: moodTagsB },
      places,
      feedback_events: feedbackEvents,
      weather: rainyWeather,
    });

    expect(moodTagsA).not.toEqual(moodTagsB);
    expect(briefingA).not.toEqual(briefingB);
  });
});
