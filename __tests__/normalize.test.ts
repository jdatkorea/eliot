import { describe, expect, it } from "vitest";
import {
  deriveMoodTagsFromIntensity,
  normalize,
} from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";

const baseRequest: TripRequest = {
  start_mode: "duration",
  duration_hours: 5,
  mood_tags: [],
  mode: "family",
};

describe("deriveMoodTagsFromIntensity", () => {
  it("0%: 피곤·실내 위주 태그", () => {
    expect(deriveMoodTagsFromIntensity(0)).toEqual([
      "baby_tired",
      "indoor_only",
    ]);
  });

  it("50%: 보통 페이스 태그", () => {
    expect(deriveMoodTagsFromIntensity(50)).toEqual(["relaxed_pace"]);
  });

  it("100%: 활기·확장형 태그", () => {
    expect(deriveMoodTagsFromIntensity(100)).toEqual(["extend_range"]);
  });
});

describe("normalize mood quantization", () => {
  it("mood_intensity가 없으면 수동 mood_tags만 사용", () => {
    const result = normalize({
      ...baseRequest,
      mood_tags: ["food_light"],
    });

    expect(result.mood_tags).toEqual(["food_light"]);
    expect(result.mood_intensity).toBeUndefined();
  });

  it("0%: intensity 기반 태그를 도출", () => {
    const result = normalize({
      ...baseRequest,
      mood_intensity: 0,
    });

    expect(result.mood_intensity).toBe(0);
    expect(result.mood_tags).toEqual(["baby_tired", "indoor_only"]);
  });

  it("50%: intensity 기반 태그를 도출", () => {
    const result = normalize({
      ...baseRequest,
      mood_intensity: 50,
    });

    expect(result.mood_intensity).toBe(50);
    expect(result.mood_tags).toEqual(["relaxed_pace"]);
  });

  it("100%: intensity 기반 태그를 도출", () => {
    const result = normalize({
      ...baseRequest,
      mood_intensity: 100,
    });

    expect(result.mood_intensity).toBe(100);
    expect(result.mood_tags).toEqual(["extend_range"]);
  });

  it("intensity 태그와 수동 mood_tags를 병합", () => {
    const result = normalize({
      ...baseRequest,
      mood_intensity: 90,
      mood_tags: ["food_hearty"],
    });

    expect(result.mood_tags).toEqual(["extend_range", "food_hearty"]);
  });
});
