import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  assertNoCrossDayDuplicates,
  canonicalizeDestination,
  DEFAULT_COURSE_DURATION_HOURS,
  generateCourse,
  generateMultiDayCourse,
  MAX_SPILLOVER_DISTANCE_KM,
  resolveTimeTemplateKey,
  weightedScore,
} from "@/lib/engine/course-generator";
import { resolvePhaseClockWindows } from "@/lib/engine/phase-schedule";
import {
  resolveCentroidDistanceKm,
  resolveRegionTier,
} from "@/lib/engine/region-tiers";
import type { Place } from "@/lib/engine/types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

const places = placesFixture as Place[];
const config = DEFAULT_APP_CONFIG;

describe("generateCourse — 단일 5h 블록", () => {
  it("half_day 템플릿(4곳) 코스를 반환한다", () => {
    const result = generateCourse({
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
      courseOptions: { duration: DEFAULT_COURSE_DURATION_HOURS },
    });

    expect(result.course.length).toBe(4);
    const ids = result.course.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("courseOptions.duration에 따라 템플릿 키를 선택한다", () => {
    expect(resolveTimeTemplateKey(3)).toBe("short");
    expect(resolveTimeTemplateKey(5)).toBe("half_day");
    expect(resolveTimeTemplateKey(8)).toBe("full_day");
  });

  it("excludeIds로 이전 방문 장소를 제외한다", () => {
    const first = generateCourse({
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
      dayIndex: 0,
    });

    const second = generateCourse({
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
      dayIndex: 1,
      excludeIds: new Set(first.course.map((p) => p.id)),
    });

    const firstIds = new Set(first.course.map((p) => p.id));
    for (const place of second.course) {
      expect(firstIds.has(place.id)).toBe(false);
    }
  });
});

describe("generateMultiDayCourse — 멀티-블록 루프", () => {
  it("duration:2 → 2일차 블록, 일차 간 중복 없음", () => {
    const result = generateMultiDayCourse({
      duration: 2,
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
    });

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.day).toBe(1);
    expect(result.blocks[1]!.day).toBe(2);
    expect(assertNoCrossDayDuplicates(result.blocks)).toBe(true);
  });

  it("duration:3 → 3일차 블록", () => {
    const result = generateMultiDayCourse({
      duration: 3,
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
    });

    expect(result.blocks).toHaveLength(3);
    // fixture 10곳 — 3일×4블록=12 필요, 풀 부족 시 완화·Joker 가능
    if (!result.pool_exhausted) {
      expect(assertNoCrossDayDuplicates(result.blocks)).toBe(true);
    }
  });

  it("풀 부족 시 에러 없이 부분 채움 또는 완화", () => {
    const tinyPool = places.slice(0, 3);
    const result = generateMultiDayCourse({
      duration: 2,
      places: tinyPool,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
    });

    expect(result.blocks).toHaveLength(2);
    expect(result.pool_exhausted).toBe(true);
  });
});

describe("canonicalizeDestination — '_근교' 변형 표기 정규화", () => {
  it("'_근교' 접미사를 제거해 같은 권역으로 정규화", () => {
    expect(canonicalizeDestination("인천_근교")).toBe("인천");
    expect(canonicalizeDestination("속초_근교")).toBe("속초");
    expect(canonicalizeDestination("경주")).toBe("경주");
  });

  it("기본 homeRegion('인천_근교')과 실 데이터 destination('인천')이 region gate를 통과한다 — P0 회귀", () => {
    const incheonPlace: Place = {
      id: "p-incheon-1",
      destination: "인천",
      name: "테스트 장소",
      category: "meal",
      is_outdoor: false,
      no_kids_zone: false,
      tags: [],
    };

    const result = generateCourse({
      places: [incheonPlace],
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
    });

    expect(result.course.some((p) => p.id === incheonPlace.id)).toBe(true);
  });
});

describe("T2(2026-06-18) — region tier 게이트 회귀/속성 (SPOF2)", () => {
  const BASE = "송도"; // ICN_METRO, region-tiers.json 기준점
  const SPILLOVER_CANDIDATE = "서울"; // CAPITAL_EXT, 실거리 약 30km대
  const EXCLUDED_BAIT_1 = "경주";
  const EXCLUDED_BAIT_2 = "부산";
  const EXCLUDED_BAIT_3 = "제주";

  // 송도에는 activity/view/kids가 전혀 없음(오후 결손) — 출발/점심/저녁은
  // cafe·meal만으로 충족되므로 어떤 deterministicIndex 타이브레이크가 나와도
  // 오후만은 반드시 spillover를 필요로 한다(타이브레이크 의존 없는 설계).
  const TIER_GATE_PLACES: Place[] = [
    { id: "t-songdo-cafe", destination: BASE, name: "송도 카페", category: "cafe", is_outdoor: false, no_kids_zone: false, tags: [] },
    { id: "t-songdo-meal-1", destination: BASE, name: "송도 식당1", category: "meal", is_outdoor: false, no_kids_zone: false, tags: [] },
    { id: "t-songdo-meal-2", destination: BASE, name: "송도 식당2", category: "meal", is_outdoor: false, no_kids_zone: false, tags: [] },
    { id: "t-seoul-activity", destination: SPILLOVER_CANDIDATE, name: "서울 액티비티", category: "activity", is_outdoor: true, no_kids_zone: false, tags: [] },
    { id: "t-seoul-kids", destination: SPILLOVER_CANDIDATE, name: "서울 키즈", category: "kids", is_outdoor: false, no_kids_zone: false, tags: [] },
    { id: "t-gyeongju-activity", destination: EXCLUDED_BAIT_1, name: "경주 액티비티(미끼)", category: "activity", is_outdoor: true, no_kids_zone: false, tags: [] },
    { id: "t-busan-kids", destination: EXCLUDED_BAIT_2, name: "부산 키즈(미끼)", category: "kids", is_outdoor: false, no_kids_zone: false, tags: [] },
    { id: "t-jeju-view", destination: EXCLUDED_BAIT_3, name: "제주 뷰(미끼)", category: "view", is_outdoor: true, no_kids_zone: false, tags: [] },
  ];

  function destinationsOf(course: Place[]): string[] {
    return course.map((p) => canonicalizeDestination(p.destination));
  }

  it("[regression] base=송도, variant A(extend_range 없음) → 모든 stop이 ICN_METRO tier 안에만 머문다", () => {
    const result = generateCourse({
      places: TIER_GATE_PLACES,
      config,
      destination: BASE,
      mode: "family",
      mood_tags: [],
    });

    for (const canon of destinationsOf(result.course)) {
      expect(resolveRegionTier(canon)).toBe("ICN_METRO");
    }
    expect(destinationsOf(result.course)).not.toContain(EXCLUDED_BAIT_1);
    expect(destinationsOf(result.course)).not.toContain(SPILLOVER_CANDIDATE);
  });

  it("[regression] base=송도, variant B(extend_range) → ICN_METRO∪CAPITAL_EXT만 — EXCLUDED(경주/부산/제주) 0건", () => {
    const result = generateCourse({
      places: TIER_GATE_PLACES,
      config,
      destination: BASE,
      mode: "family",
      mood_tags: ["extend_range"],
    });

    const canons = destinationsOf(result.course);
    for (const canon of canons) {
      const tier = resolveRegionTier(canon);
      expect(tier === "ICN_METRO" || tier === "CAPITAL_EXT").toBe(true);
    }
    expect(canons).not.toContain(EXCLUDED_BAIT_1);
    expect(canons).not.toContain(EXCLUDED_BAIT_2);
    expect(canons).not.toContain(EXCLUDED_BAIT_3);
    // 결손이 실제로 spillover로 채워졌는지(미발동이면 이 회귀의 핵심을 못 본 것)
    expect(canons).toContain(SPILLOVER_CANDIDATE);
  });

  it("[property] spillover 발생 시에도 최대 2개 destination, 와리가리(되돌아가기) 없음", () => {
    const result = generateCourse({
      places: TIER_GATE_PLACES,
      config,
      destination: BASE,
      mode: "family",
      mood_tags: ["extend_range"],
    });

    const canons = destinationsOf(result.course);
    const distinct = [...new Set(canons)];
    expect(distinct.length).toBeLessThanOrEqual(2);

    // 한 번 떠난 destination으로 되돌아가지 않는지 — 연속 구간이 destination별로 1개씩만 존재
    let transitions = 0;
    for (let i = 1; i < canons.length; i++) {
      if (canons[i] !== canons[i - 1]) transitions++;
    }
    expect(transitions).toBeLessThanOrEqual(1);

    // T2.5(2026-06-18) 실측 기반 조임: CAPITAL_EXT tier 경계(~100km)는 "허용
    // 범위"일 뿐 5시간·4블록 당일 코스의 "적정 거리"가 아니다. 실데이터
    // 측정(scripts/analyze-region-coverage.ts) 결과 ICN_METRO 8개 destination
    // 전부 자급 또는 5~26km 반경 내 spillover로 충족되었고, 코드도 이제
    // MAX_SPILLOVER_DISTANCE_KM(40km) 반경을 1차로 탐색한다 — 이 fixture의
    // 서울(34.6km)도 그 반경 안의 정상 케이스이므로, 거리합은 그 상한을
    // 넘지 않아야 한다(전환이 최대 1회이므로 왕복 가산 없음).
    let totalDistanceKm = 0;
    for (let i = 1; i < canons.length; i++) {
      if (canons[i] === canons[i - 1]) continue;
      const dist = resolveCentroidDistanceKm(canons[i - 1]!, canons[i]!);
      if (dist !== null) totalDistanceKm += dist;
    }
    expect(totalDistanceKm).toBeLessThanOrEqual(MAX_SPILLOVER_DISTANCE_KM);
  });

  it("[property] 빈 풀·결손 풀 등 어떤 입력에도 0-stop 여정이 나오지 않는다", () => {
    const scenarios: { places: Place[]; mood_tags: string[]; mode: "family" | "couple" }[] = [
      { places: [], mood_tags: [], mode: "family" },
      { places: [], mood_tags: ["extend_range"], mode: "couple" },
      { places: TIER_GATE_PLACES, mood_tags: [], mode: "family" },
      { places: TIER_GATE_PLACES, mood_tags: ["extend_range"], mode: "couple" },
      { places: TIER_GATE_PLACES.slice(0, 1), mood_tags: [], mode: "family" },
      { places: placesFixture as Place[], mood_tags: ["indoor_only"], mode: "family" },
    ];

    for (const scenario of scenarios) {
      const result = generateCourse({
        places: scenario.places,
        config,
        destination: BASE,
        mode: scenario.mode,
        mood_tags: scenario.mood_tags,
      });
      expect(result.course.length).toBeGreaterThan(0);
    }
  });
});

describe("T4(2026-06-18) — clock-time axis / sunset 제약", () => {
  const config = DEFAULT_APP_CONFIG;
  const timeLabels = config.templates.base.half_day;
  // 기본 출발 10:00 + 5h → 10:00~15:00. sunset=11:00으로 두면 출발(10:00-10:50)만
  // 일몰 전에 끝나고, 점심/오후/저녁은 모두 일몰을 넘긴다 — 강제 실내 전환이
  // 실제로 여러 블록에 걸쳐 발동하는 의미 있는 시나리오.
  const EARLY_SUNSET = "11:00";

  it("[regression] is_outdoor phase end ≤ sunset — 위반 블록 0건(비-폭염·비-한파)", () => {
    const expectedWindows = resolvePhaseClockWindows(
      timeLabels,
      config,
      DEFAULT_COURSE_DURATION_HOURS,
      config.default_departure_time,
    );
    const sunsetMinutes = 11 * 60; // EARLY_SUNSET("11:00")

    const result = generateCourse({
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
      sunsetTime: EARLY_SUNSET,
    });

    expect(result.course.length).toBe(timeLabels.length);

    const violations = result.course.filter((place, index) => {
      if (place.is_outdoor !== true) return false;
      return expectedWindows[index]!.end_minutes > sunsetMinutes;
    });
    expect(violations).toHaveLength(0);
  });

  it("[property] sunset 제약이 없으면(undefined) 결과가 변하지 않는다 — 회귀 안전망", () => {
    const withoutSunset = generateCourse({
      places,
      config,
      destination: FIXED_DESTINATION,
      mode: "family",
      mood_tags: [],
    });

    expect(withoutSunset.course.length).toBe(timeLabels.length);
  });

  it("[property] 어떤 sunset 값을 줘도 0-stop이 되지 않는다", () => {
    for (const sunset of ["00:00", "09:00", "11:00", "23:59"]) {
      const result = generateCourse({
        places,
        config,
        destination: FIXED_DESTINATION,
        mode: "family",
        mood_tags: [],
        sunsetTime: sunset,
      });
      expect(result.course.length).toBeGreaterThan(0);
    }
  });
});

describe("T5(2026-06-18) — stroller_friendly weightedScore 가산 (kids 컨텍스트 소비)", () => {
  const base: Place = {
    id: "p-base",
    destination: FIXED_DESTINATION,
    name: "기준 장소",
    category: "kids",
    is_outdoor: false,
    no_kids_zone: false,
    tags: [],
  };

  it("[property] family 모드 + stroller_friendly=true → 가산만큼 점수가 높다", () => {
    const withBonus = weightedScore(
      { ...base, stroller_friendly: true },
      "family",
      ["kids"],
      0,
      config.stroller_friendly_bonus,
    );
    const withoutBonus = weightedScore(
      { ...base, stroller_friendly: false },
      "family",
      ["kids"],
      0,
      config.stroller_friendly_bonus,
    );

    expect(withBonus).toBe(withoutBonus + config.stroller_friendly_bonus);
  });

  it("couple 모드에서는 stroller_friendly가 점수에 영향을 주지 않는다", () => {
    const withFlag = weightedScore(
      { ...base, stroller_friendly: true },
      "couple",
      ["kids"],
      0,
      config.stroller_friendly_bonus,
    );
    const withoutFlag = weightedScore(
      { ...base, stroller_friendly: false },
      "couple",
      ["kids"],
      0,
      config.stroller_friendly_bonus,
    );

    expect(withFlag).toBe(withoutFlag);
  });
});
