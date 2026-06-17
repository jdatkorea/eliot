import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  assertNoCrossDayDuplicates,
  generateCourse,
  generateMultiDayCourse,
} from "@/lib/engine/course-generator";
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
    });

    expect(result.course.length).toBe(4);
    const ids = result.course.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
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
