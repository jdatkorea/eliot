import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { normalize, hoursBetween } from "@/lib/engine/normalize";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { deriveVariantB, variantLabel } from "@/lib/engine/variant";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";
import type { FeedbackEvent, Place, TripRequest } from "@/lib/engine/types";
import { TIME_LABELS } from "@/lib/engine/types";

const places = placesFixture as Place[];
const placeIds = new Set(places.map((p) => p.id));
const feedbackEvents: FeedbackEvent[] = [];
const appConfig = DEFAULT_APP_CONFIG;

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

const baseInput = {
  normalized: baseNormalized,
  places,
  feedback_events: feedbackEvents,
  config: appConfig,
  weather: rainyWeather,
  destination: FIXED_DESTINATION,
};

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
      ...baseInput,
      normalized: withReturn,
    });
    const briefingWithout = generateBriefing({
      ...baseInput,
      normalized: withoutReturn,
    });
    expect(briefingWith).toEqual(briefingWithout);
  });
});

describe("generateBriefing — 결정론적 순수함수", () => {
  const input = baseInput;

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
    }
  });

  it("is_outdoor=true 블록은 weather_note 보유", () => {
    const briefing = generateBriefing(input);
    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      if (place.is_outdoor) {
        expect(block.weather_note).toBeDefined();
      }
    }
  });

  it("destination 일치 장소만 선택 (7필드 게이트)", () => {
    const briefing = generateBriefing(input);
    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      expect(place.destination).toBe(FIXED_DESTINATION);
    }
  });

  it("[T4] 각 블록에 start_time/end_time이 부착되고 하루 안에서 단조 증가한다", () => {
    const briefing = generateBriefing(input);
    const clockPattern = /^\d{2}:\d{2}$/;

    for (const day of briefing.days) {
      let previousEnd: string | undefined;
      for (const block of day.blocks) {
        expect(block.start_time).toMatch(clockPattern);
        expect(block.end_time).toMatch(clockPattern);
        if (previousEnd) {
          expect(block.start_time).toBe(previousEnd);
        }
        previousEnd = block.end_time;
      }
    }
  });
});

describe("mode 필터", () => {
  it("family 모드: no_kids_zone=true 장소 제외", () => {
    const briefing = generateBriefing({
      ...baseInput,
      normalized: { ...baseNormalized, mode: "family" },
    });

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      expect(place.no_kids_zone).toBe(false);
    }
  });

  it("couple 모드: no_kids_zone 필터 미적용", () => {
    const noKidsPlace = places.find((p) => p.no_kids_zone)!;
    const coupleBriefing = generateBriefing({
      ...baseInput,
      normalized: {
        ...baseNormalized,
        mode: "couple",
        mood_tags: ["extend_range"],
      },
      places: places.filter((p) => p.id === noKidsPlace.id || p.category === "cafe"),
    });

    const familyBriefing = generateBriefing({
      ...baseInput,
      normalized: {
        ...baseNormalized,
        mode: "family",
        mood_tags: ["extend_range"],
      },
      places: places.filter((p) => p.id === noKidsPlace.id || p.category === "cafe"),
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

  it("destination/페이스 축 차이 보장", () => {
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
      ...baseInput,
      normalized: { ...baseNormalized, mood_tags: moodTagsA },
    });
    const briefingB = generateBriefing({
      ...baseInput,
      normalized: { ...baseNormalized, mood_tags: moodTagsB },
    });

    expect(moodTagsA).not.toEqual(moodTagsB);
    expect(briefingA).not.toEqual(briefingB);
  });
});

describe("buildChecklist — 규칙 기반 준비물", () => {
  it("family 모드 + 당일·근거리(baseInput 기본값): 필수 준비물 포함, 여행 키워드 0건", () => {
    const briefing = generateBriefing({
      ...baseInput,
      normalized: { ...baseNormalized, mode: "family" },
    });

    const checklistBody = briefing.checklist.slice(1);
    expect(checklistBody).toContain("기저귀·물티슈");
    expect(checklistBody).toContain("아이 간식");
    expect(checklistBody).toContain("보조배터리");
    // T5(2026-06-18): 당일·근거리는 여권/항공/KTX 등 여행 키워드 하드 제외
    expect(briefing.checklist.join(" ")).not.toContain("여권");
    expect(briefing.checklist.join(" ")).not.toContain("항공");
    expect(briefing.checklist.join(" ")).not.toContain("KTX");
    expect(briefing.checklist.join(" ")).not.toContain("유모차");
  });

  it("couple 모드 + 당일·근거리: family 전용 준비물 제외, 여행 키워드도 제외", () => {
    const briefing = generateBriefing({
      ...baseInput,
      normalized: { ...baseNormalized, mode: "couple" },
    });

    const checklistBody = briefing.checklist.slice(1);
    expect(checklistBody).not.toContain("기저귀·물티슈");
    expect(checklistBody).not.toContain("아이 간식");
    expect(checklistBody).toContain("보조배터리");
    expect(briefing.checklist.join(" ")).not.toContain("여권");
  });

  it("[regression] 당일·근거리 checklist에 여권·항공 부재 — T5 핵심 회귀", () => {
    const briefing = generateBriefing({
      ...baseInput,
      destination: FIXED_DESTINATION,
      normalized: { ...baseNormalized, mode: "family", trip_days: 1 },
    });

    const fullText = briefing.checklist.join(" ");
    expect(fullText).not.toContain("여권");
    expect(fullText).not.toContain("항공");
    expect(fullText).not.toContain("KTX");
  });

  it("원거리(EXCLUDED tier destination) 또는 숙박 일정은 여권·항공 키워드를 유지한다", () => {
    const farBriefing = generateBriefing({
      ...baseInput,
      destination: "경주",
      normalized: { ...baseNormalized, mode: "family", trip_days: 1 },
    });
    expect(farBriefing.checklist.join(" ")).toContain("여권·신분증");
    expect(farBriefing.checklist[0]).toBe("원거리 — 자차·KTX·항공");

    const multiDayBriefing = generateBriefing({
      ...baseInput,
      destination: FIXED_DESTINATION,
      normalized: { ...baseNormalized, mode: "family", trip_days: 2 },
    });
    expect(multiDayBriefing.checklist.join(" ")).toContain("여권·신분증");
    expect(multiDayBriefing.checklist[0]).toBe("원거리 — 자차·KTX·항공");
  });

  it("강수 확률 임계값 이상: 우산·우비 포함", () => {
    const briefing = generateBriefing({
      ...baseInput,
      normalized: { ...baseNormalized, mode: "family" },
      weather: rainyWeather,
    });

    expect(briefing.checklist).toContain("우산·우비");
  });
});

describe("[T5] has_nursing_room — Care Point 노출", () => {
  const nursingPlace: Place = {
    id: "p-nursing",
    destination: FIXED_DESTINATION,
    name: "수유실 보유 키즈카페",
    category: "kids",
    is_outdoor: false,
    no_kids_zone: false,
    tags: [],
    has_nursing_room: true,
  };
  const placesWithNursing = [...places, nursingPlace];

  it("[property] family 모드 → has_nursing_room=true 장소의 블록에 care_note 노출", () => {
    const briefing = generateBriefing({
      ...baseInput,
      places: placesWithNursing,
      normalized: { ...baseNormalized, mode: "family" },
    });

    const nursingBlock = allBlocks(briefing).find(
      (block) => block.place_id === nursingPlace.id,
    );
    // 풀에 같은 카테고리 경쟁자가 많아 매 블록에서 뽑히지 않을 수 있으므로,
    // 뽑혔을 때만(존재할 때만) care_note 정확성을 검증한다 — 선택 자체는
    // course-generator의 deterministic 추첨 영역(T5 책임 밖).
    if (nursingBlock) {
      expect(nursingBlock.care_note).toBe("수유실 완비");
    }

    for (const block of allBlocks(briefing)) {
      const place = placesWithNursing.find((p) => p.id === block.place_id);
      if (place?.has_nursing_room === true) {
        expect(block.care_note).toBe("수유실 완비");
      } else {
        expect(block.care_note).toBeUndefined();
      }
    }
  });

  it("couple 모드에서는 has_nursing_room이어도 care_note를 노출하지 않는다", () => {
    const briefing = generateBriefing({
      ...baseInput,
      places: placesWithNursing,
      normalized: { ...baseNormalized, mode: "couple" },
    });

    for (const block of allBlocks(briefing)) {
      expect(block.care_note).toBeUndefined();
    }
  });
});
