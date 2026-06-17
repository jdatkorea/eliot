import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";
import {
  buildFeedbackUrl,
  createFeedbackLinkParams,
  parseFeedbackLinkParams,
  toContextTags,
} from "@/lib/feedback/context";
import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";

const tripRequest: TripRequest = {
  start_mode: "duration",
  duration_hours: 5,
  origin: "인천 송도",
  return_location: "김포공항",
  mood_tags: ["relaxed_pace", "food_light"],
  mode: "family",
};

describe("buildFeedbackUrl", () => {
  it("정규화된 여정 컨텍스트를 쿼리스트링으로 인코딩", () => {
    const normalized = normalize(tripRequest);
    const params = createFeedbackLinkParams(
      normalized,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    const url = buildFeedbackUrl(params, "https://eliot.example.com");

    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/feedback");
    expect(parsed.searchParams.get("trip_id")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(parsed.searchParams.get("subject_id")).toBe("subin");
    expect(parsed.searchParams.get("mode")).toBe("family");
    expect(parsed.searchParams.get("return_location")).toBe("김포공항");
    expect(parsed.searchParams.get("mood_tags")).toBe(
      "relaxed_pace,food_light",
    );
    expect(parsed.searchParams.get("route_variant")).toBeNull();
  });

  it("route_variant는 있을 때만 포함", () => {
    const normalized = normalize(tripRequest);
    const url = buildFeedbackUrl(
      {
        ...createFeedbackLinkParams(normalized, "trip-abc"),
        route_variant: "B",
      },
      "http://localhost:3000",
    );

    expect(new URL(url).searchParams.get("route_variant")).toBe("B");
  });
});

describe("parseFeedbackLinkParams", () => {
  it("쿼리스트링을 FeedbackLinkParams로 복원", () => {
    const search = new URLSearchParams({
      trip_id: "trip-1",
      subject_id: "subin",
      mode: "couple",
      return_location: "인천 송도",
      mood_tags: "baby_tired,indoor_only",
      route_variant: "A",
    });

    expect(parseFeedbackLinkParams(search)).toEqual({
      trip_id: "trip-1",
      subject_id: "subin",
      mode: "couple",
      return_location: "인천 송도",
      mood_tags: ["baby_tired", "indoor_only"],
      route_variant: "A",
    });
  });
});

describe("toContextTags", () => {
  it("PRD §3 context_tags 스키마로 변환", () => {
    expect(
      toContextTags({
        mood_tags: ["relaxed_pace"],
        mode: "family",
        return_location: "인천 송도",
        route_variant: "B",
      }),
    ).toEqual({
      mood_tags: ["relaxed_pace"],
      mode: "family",
      return_location: "인천 송도",
      route_variant: "B",
    });
  });
});

describe("buildTelegramLinkMessage", () => {
  it("A/B 브리핑 링크와 동적 피드백 인라인 링크를 포함", () => {
    const normalized = normalize(tripRequest);
    const feedbackUrl = buildFeedbackUrl(
      createFeedbackLinkParams(normalized, "trip-live"),
      "http://localhost:3000",
    );

    const { text, parse_mode } = buildTelegramLinkMessage({
      urlA: "http://localhost:3000/briefing#data=a&variant=A",
      urlB: "http://localhost:3000/briefing#data=b&variant=B",
      labelA: "근거리·기본형",
      labelB: "원거리·확장형",
      feedbackUrl,
    });

    expect(parse_mode).toBe("HTML");
    expect(text).toContain("A · 근거리·기본형 브리핑 보기");
    expect(text).toContain("B · 원거리·확장형 브리핑 보기");
    expect(text).toContain("여정 종료 후 피드백 남기기");
    expect(text).not.toContain("\t");
    expect(text).not.toContain("---");
    expect(text).toContain("trip_id=trip-live");
    expect(text).toContain("mood_tags=relaxed_pace%2Cfood_light");
    expect(text).not.toContain("test-weekend");
  });

  it("브리핑 요약이 있으면 플랫 텍스트 블록을 상단에 포함", () => {
    const { text } = buildTelegramLinkMessage({
      urlA: "http://localhost:3000/briefing#data=a&variant=A",
      urlB: "http://localhost:3000/briefing#data=b&variant=B",
      labelA: "근거리·기본형",
      labelB: "원거리·확장형",
      feedbackUrl: "http://localhost:3000/feedback?trip_id=trip-live",
      briefingSummary: "여정 명세서 · 패밀리타임\n날씨: 맑음",
    });

    expect(text).toContain("<pre>");
    expect(text).toContain("여정 명세서 · 패밀리타임");
    expect(text).not.toContain("\t");
  });
});
