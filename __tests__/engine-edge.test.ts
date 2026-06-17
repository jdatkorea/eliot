import { describe, expect, it, vi } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  resolveMoodEffects,
  weatherKeyFromRainProb,
} from "@/lib/engine/apply-config";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { normalize } from "@/lib/engine/normalize";
import { deriveVariantB } from "@/lib/engine/variant";
import type { FeedbackEvent, Place } from "@/lib/engine/types";
import { TIME_LABELS } from "@/lib/engine/types";

const places = placesFixture as Place[];
const placeIds = new Set(places.map((p) => p.id));
const appConfig = DEFAULT_APP_CONFIG;
const feedbackEvents: FeedbackEvent[] = [];

const HOME_REGION = "인천_근교";
const REMOTE_REGION = "경주";

function allBlocks(briefing: ReturnType<typeof generateBriefing>) {
  return briefing.days.flatMap((day) => day.blocks);
}

function briefingInput(
  overrides: Omit<Partial<Parameters<typeof generateBriefing>[0]>, "normalized"> & {
    normalized?: Partial<ReturnType<typeof normalize>>;
  } = {},
) {
  const normalized = normalize({
    start_mode: "duration",
    duration_hours: 5,
    mood_tags: [],
    mode: "family",
    ...overrides.normalized,
  });
  return {
    normalized: { ...normalized, ...overrides.normalized },
    places: overrides.places ?? places,
    feedback_events: overrides.feedback_events ?? feedbackEvents,
    config: overrides.config ?? appConfig,
    weather: overrides.weather,
    destination: overrides.destination ?? HOME_REGION,
    date_label: overrides.date_label,
  };
}

describe("generateBriefing — Joker fallback observability", () => {
  it("빈 places 풀 시 pool_exhausted=true 및 console.warn에 제약 조건 기록", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const briefing = generateBriefing(
      briefingInput({
        places: [],
        normalized: { mood_tags: ["indoor_only"], mode: "family" },
      }),
    );

    expect(briefing.pool_exhausted).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    const poolWarn = warnSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === "string" &&
        msg.includes("[generateCourse] pool exhausted for block"),
    );
    expect(poolWarn).toBeDefined();

    const meta = poolWarn?.[1] as {
      dayIndex: number;
      blockIndex: number;
      timeLabel: string;
      destination: string;
    };
    expect(meta.dayIndex).toBe(0);
    expect(typeof meta.blockIndex).toBe("number");
    expect(typeof meta.timeLabel).toBe("string");

    warnSpy.mockRestore();
  });
});

describe("generateBriefing — outdoor weather_note", () => {
  it("우천(≥ threshold) + is_outdoor → 우천 대안 안내 weather_note", () => {
    const briefing = generateBriefing(
      briefingInput({
        weather: {
          summary: "흐림",
          temp: "20°C",
          rain_prob: "60%",
          advice: "우산을 챙기세요.",
        },
      }),
    );

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      if (place.is_outdoor) {
        expect(block.weather_note).toBe("우천 시 실내 대안 검토");
        expect(block.weather_backup).toBeUndefined();
      }
    }
  });

  it("맑음(< threshold) 야외 블록은 weather_note만 부착", () => {
    const briefing = generateBriefing(
      briefingInput({
        weather: {
          summary: "맑음",
          temp: "22°C",
          rain_prob: "30%",
          advice: "가벼운 겉옷을 챙기세요.",
        },
      }),
    );

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      if (place.is_outdoor) {
        expect(block.weather_backup).toBeUndefined();
        expect(block.weather_note).toBe("야외 장소 — 날씨 확인 후 이동");
      }
    }
  });
});

describe("generateBriefing — mode=family no_kids_zone", () => {
  it("family 모드에서 no_kids_zone 장소가 한 건도 선택되지 않음", () => {
    const briefing = generateBriefing(
      briefingInput({
        normalized: { mode: "family", mood_tags: ["extend_range"] },
      }),
    );

    const noKidsIds = new Set(
      places.filter((p) => p.no_kids_zone).map((p) => p.id),
    );
    for (const block of allBlocks(briefing)) {
      expect(noKidsIds.has(block.place_id)).toBe(false);
    }
  });
});

describe("generateBriefing — destination region gate", () => {
  it("기본: home_region과 destination 일치 장소만 선택", () => {
    const briefing = generateBriefing(
      briefingInput({
        destination: HOME_REGION,
        normalized: { mood_tags: [] },
      }),
    );

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      expect(place.destination).toBe(HOME_REGION);
    }
  });

  it("extend_range: home_region 필터 해제 — 타 지역 장소 포함 가능", () => {
    const briefing = generateBriefing(
      briefingInput({
        destination: HOME_REGION,
        normalized: { mood_tags: ["extend_range"] },
      }),
    );

    const selectedDestinations = new Set(
      allBlocks(briefing).map((block) => {
        const place = places.find((p) => p.id === block.place_id)!;
        return place.destination;
      }),
    );
    expect(selectedDestinations.has(REMOTE_REGION)).toBe(true);
  });
});

describe("generateBriefing — mood_tag effects", () => {
  it("indoor_only: is_outdoor=false 장소만 선택", () => {
    const briefing = generateBriefing(
      briefingInput({
        normalized: { mood_tags: ["indoor_only"] },
      }),
    );

    const effects = resolveMoodEffects(appConfig, ["indoor_only"]);
    expect(effects.indoorOnly).toBe(true);

    for (const block of allBlocks(briefing)) {
      const place = places.find((p) => p.id === block.place_id)!;
      expect(place.is_outdoor).toBe(false);
    }
  });
});

describe("generateBriefing — pool 고갈 rotation", () => {
  it("usedPlaceIds 고갈 시 빈 used·excluded로 재필터하여 블록 생성 지속", () => {
    const tinyPool = places.filter(
      (p) => !p.no_kids_zone && !p.is_outdoor && p.destination === HOME_REGION,
    ).slice(0, 2);

    expect(tinyPool.length).toBe(2);

    const briefing = generateBriefing(
      briefingInput({
        places: tinyPool,
        normalized: { duration: 5, mood_tags: [], mode: "family" },
      }),
    );

    const blocks = allBlocks(briefing);
    expect(blocks.length).toBe(4);
    const uniqueIds = new Set(blocks.map((b) => b.place_id));
    expect(uniqueIds.size).toBeLessThan(blocks.length);
    for (const block of blocks) {
      expect(tinyPool.some((p) => p.id === block.place_id)).toBe(true);
    }
  });
});

describe("generateBriefing — trip_days→일자 플랜 경계값", () => {
  it("5h → half_day 템플릿 (출발·점심·오후·저녁 4블록)", () => {
    const briefing = generateBriefing(
      briefingInput({
        normalized: { duration: 5, mood_tags: [] },
      }),
    );

    expect(briefing.days).toHaveLength(1);
    expect(briefing.days[0]!.label).toBe("1일차");
    const labels = allBlocks(briefing).map((b) => b.time_label);
    expect(labels).toEqual(["출발", "점심", "오후", "저녁"]);
  });

  it("2박3일(trip_days:3) → 3일차 플랜", () => {
    const briefing = generateBriefing(
      briefingInput({
        normalized: { trip_days: 3, mood_tags: [] },
      }),
    );

    expect(briefing.days).toHaveLength(3);
    expect(briefing.days.map((d) => d.label)).toEqual([
      "1일차",
      "2일차",
      "3일차",
    ]);
    expect(briefing.days[0]!.title).toBe("첫째 날");
    expect(briefing.days[2]!.title).toBe("마지막 날");

    const day1Labels = briefing.days[0]!.blocks.map((b) => b.time_label);
    expect(day1Labels[0]).toBe("출발");
    expect(day1Labels).not.toContain("도착 후");
  });
});

describe("generateBriefing — 불변식", () => {
  it("time_label은 enum만 사용 (clock time 없음)", () => {
    const briefing = generateBriefing(briefingInput());
    const clockPattern = /\d{1,2}:\d{2}/;
    for (const block of allBlocks(briefing)) {
      expect(TIME_LABELS).toContain(block.time_label);
      expect(clockPattern.test(block.time_label)).toBe(false);
    }
  });

  it("모든 place_id가 pool 안에 존재", () => {
    const briefing = generateBriefing(briefingInput());
    for (const block of allBlocks(briefing)) {
      expect(placeIds.has(block.place_id)).toBe(true);
    }
  });
});

describe("deriveVariantB — extend_range 양방향 토글", () => {
  it("extend_range 보유 시 제거", () => {
    expect(deriveVariantB(["extend_range"])).toEqual([]);
    expect(deriveVariantB(["extend_range", "food_light"])).toEqual([
      "food_light",
    ]);
  });

  it("extend_range 미보유 시 추가 (relaxed_pace·기타 태그 유지)", () => {
    expect(deriveVariantB(["relaxed_pace"])).toEqual(["extend_range"]);
    expect(deriveVariantB(["baby_tired", "food_light"])).toEqual([
      "baby_tired",
      "food_light",
      "extend_range",
    ]);
  });

  it("빈 mood_tags → extend_range만 추가", () => {
    expect(deriveVariantB([])).toEqual(["extend_range"]);
  });
});

describe("normalize — duration·return_location", () => {
  it("fixed·duration 모드 동일 시각 범위 → 동일 duration 산출", () => {
    const fixed = normalize({
      start_mode: "fixed",
      departure_time: "09:00",
      return_time: "14:00",
      mood_tags: [],
      mode: "family",
    });
    const duration = normalize({
      start_mode: "duration",
      duration_hours: 5,
      mood_tags: [],
      mode: "family",
    });

    expect(fixed.duration).toBe(5);
    expect(duration.duration).toBe(5);
    expect(fixed.duration).toBe(duration.duration);
  });

  it("return_location 미지정 시 origin으로 fallback", () => {
    const result = normalize({
      start_mode: "duration",
      duration_hours: 5,
      origin: "인천 송도",
      mood_tags: [],
      mode: "family",
    });
    expect(result.return_location).toBe("인천 송도");
    expect(result.return_location).toBe(result.origin);
  });

  it("return_location 지정 시 해당 값 사용", () => {
    const result = normalize({
      start_mode: "duration",
      duration_hours: 5,
      origin: "인천 송도",
      return_location: "김포공항",
      mood_tags: [],
      mode: "family",
    });
    expect(result.return_location).toBe("김포공항");
    expect(result.origin).toBe("인천 송도");
  });
});

describe("apply-config — resolveMoodEffects", () => {
  it("태그 없음 → 기본 효과", () => {
    const effects = resolveMoodEffects(appConfig, []);
    expect(effects.blockCountModifier).toBe(0);
    expect(effects.indoorOnly).toBe(false);
    expect(effects.relaxedLabels).toBe(false);
    expect(effects.indoorBias).toBe(0);
  });

  it("복수 태그 효과 누적", () => {
    const effects = resolveMoodEffects(appConfig, [
      "baby_tired",
      "relaxed_pace",
      "indoor_only",
    ]);
    expect(effects.blockCountModifier).toBe(-2);
    expect(effects.indoorBias).toBe(5);
    expect(effects.relaxedLabels).toBe(true);
    expect(effects.indoorOnly).toBe(true);
  });

  it("extend_range → 거리 효과 없음 (destination 게이트 전용)", () => {
    const effects = resolveMoodEffects(appConfig, ["extend_range"]);
    expect(effects.blockCountModifier).toBe(0);
    expect(effects.indoorOnly).toBe(false);
  });
});

describe("apply-config — weatherKeyFromRainProb 임계값 경계", () => {
  const threshold = appConfig.rain_prob_threshold;

  it(`rain_prob = threshold-1 (${threshold - 1}%) → clear`, () => {
    expect(weatherKeyFromRainProb(appConfig, `${threshold - 1}%`)).toBe(
      "clear",
    );
  });

  it(`rain_prob = threshold (${threshold}%) → rain`, () => {
    expect(weatherKeyFromRainProb(appConfig, `${threshold}%`)).toBe("rain");
  });

  it(`rain_prob = threshold+1 (${threshold + 1}%) → rain`, () => {
    expect(weatherKeyFromRainProb(appConfig, `${threshold + 1}%`)).toBe(
      "rain",
    );
  });
});
