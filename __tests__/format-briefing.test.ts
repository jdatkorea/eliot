import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  BRIEFING_CHECKLIST_HEADING,
  BRIEFING_HEADER_TITLE,
  formatBlockLine,
  formatBriefingFamilyTime,
  formatContextLine,
  getBriefingContextLines,
  sanitizeTelegramMarkdown,
} from "@/lib/engine/format-briefing";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { normalize } from "@/lib/engine/normalize";
import {
  buildGenerateBriefingOptions,
  parseWeatherFromText,
  resolveTripBriefingContext,
} from "@/lib/engine/trip-context";
import type { Place, TripRequest } from "@/lib/engine/types";
import {
  buildTripRequest,
  DEFAULT_WEBAPP_FORM,
} from "@/lib/webapp/build-trip-request";

const places = placesFixture as Place[];

const webAppTripRequest = buildTripRequest(DEFAULT_WEBAPP_FORM);

describe("parseWeatherFromText", () => {
  it("WebApp 날씨 문자열을 브리핑 weather 객체로 변환", () => {
    const weather = parseWeatherFromText(DEFAULT_WEBAPP_FORM.weather);

    expect(weather.summary).toBe("23도~31도");
    expect(weather.temp).toBe("23~31°C");
    expect(weather.rain_prob).toBe("10%");
    expect(weather.advice).toBe(DEFAULT_WEBAPP_FORM.weather);
  });
});

const BASE_TIMESTAMP = "2026-06-17T12:00:00.000Z";

describe("buildGenerateBriefingOptions", () => {
  it("TripRequest 7필드 컨텍스트를 generateBriefing 입력으로 패킹", () => {
    const options = buildGenerateBriefingOptions(
      webAppTripRequest,
      "2026년 6월 17일(수)",
      BASE_TIMESTAMP,
    );

    expect(options.date_label).toBe("2026년 6월 17일(수)");
    expect(options.weather?.summary).toBe("23도~31도");
    expect(options.trip_context).toMatchObject({
      operation_time: "출발 ~ 귀환 (총 5시간)",
      weather_text: DEFAULT_WEBAPP_FORM.weather,
      energy_level: 90,
      sunset_time: "19:56",
      constraints: DEFAULT_WEBAPP_FORM.constraints,
    });
  });
});

describe("formatBriefingFamilyTime", () => {
  it("탭·과잉 공백 없이 플랫 마크다운을 생성", () => {
    const normalized = normalize(webAppTripRequest);
    const options = buildGenerateBriefingOptions(
      webAppTripRequest,
      "2026년 6월 17일(수)",
      BASE_TIMESTAMP,
    );
    const { feedback_events: cloudFeedbackEvents, ...generateOptions } =
      options;
    const briefing = generateBriefing({
      normalized,
      places,
      feedback_events: cloudFeedbackEvents,
      config: DEFAULT_APP_CONFIG,
      ...generateOptions,
    });

    const text = sanitizeTelegramMarkdown(
      formatBriefingFamilyTime(briefing, "근거리·기본형"),
    );

    expect(text.startsWith(BRIEFING_HEADER_TITLE)).toBe(true);
    expect(text).toContain("작전 시간: 출발 ~ 귀환 (총 5시간)");
    expect(text).toContain(`날씨: ${DEFAULT_WEBAPP_FORM.weather}`);
    expect(text).toContain("에너지 활성화도: 90%");
    expect(text).toContain("일몰: 19:56");
    expect(text).toContain(`제약: ${DEFAULT_WEBAPP_FORM.constraints}`);
    expect(text).toContain(`— ${BRIEFING_CHECKLIST_HEADING} —`);
    expect(text).not.toContain("\t");
    expect(text).not.toMatch(/ {2,}/);
  });

  it("getBriefingContextLines가 웹·텔레그램 공통 컨텍스트 블록을 생성", () => {
    const normalized = normalize(webAppTripRequest);
    const options = buildGenerateBriefingOptions(
      webAppTripRequest,
      "2026년 6월 17일(수)",
      BASE_TIMESTAMP,
    );
    const { feedback_events: cloudFeedbackEvents, ...generateOptions } =
      options;
    const briefing = generateBriefing({
      normalized,
      places,
      feedback_events: cloudFeedbackEvents,
      config: DEFAULT_APP_CONFIG,
      ...generateOptions,
    });

    const lines = getBriefingContextLines(briefing);
    const textBlock = lines.map(formatContextLine).join("\n");

    expect(lines.some((line) => line.label === "제약")).toBe(true);
    expect(textBlock).toContain(DEFAULT_WEBAPP_FORM.constraints);
    expect(textBlock).not.toContain("\t");
    expect(textBlock).not.toMatch(/ {2,}/);
  });

  it("야외 블록 weather_note가 코스 라인에 반영", () => {
    const normalized = normalize(webAppTripRequest);
    const options = buildGenerateBriefingOptions(
      webAppTripRequest,
      "2026년 6월 17일(수)",
      BASE_TIMESTAMP,
    );
    const { feedback_events: cloudFeedbackEvents, ...generateOptions } =
      options;
    const briefing = generateBriefing({
      normalized,
      places,
      feedback_events: cloudFeedbackEvents,
      config: DEFAULT_APP_CONFIG,
      ...generateOptions,
    });

    const outdoorBlock = briefing.days
      .flatMap((day) => day.blocks)
      .find((block) => block.weather_note);

    expect(outdoorBlock).toBeDefined();
    expect(formatBlockLine(outdoorBlock!)).toContain(outdoorBlock!.weather_note!);
  });
});

describe("resolveTripBriefingContext", () => {
  it("고정·가변 필드를 무결 JSON 컨텍스트로 분리", () => {
    const tripRequest: TripRequest = buildTripRequest({
      weather: "맑음",
      mood_intensity: 50,
      sunset_time: "20:00",
      constraints: "직선 동선",
    });

    expect(resolveTripBriefingContext(tripRequest)).toEqual({
      operation_time: "출발 ~ 귀환 (총 5시간)",
      base_camp: expect.any(String),
      weather_text: "맑음",
      energy_level: 50,
      sunset_time: "20:00",
      constraints: "직선 동선",
    });
  });
});
