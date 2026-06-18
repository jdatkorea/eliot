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
    // T3(2026-06-18) 회귀 방지: 폭염/자외선 텍스트라도 rain_prob을 인위적으로
    // 낮추지 않는다(과거 버그: heatLike → "10%" 강제 — 위험을 위장했었음).
    // DEFAULT_WEBAPP_FORM.weather엔 강수 키워드가 없으므로 기본값 30%.
    expect(weather.rain_prob).toBe("30%");
    expect(weather.conditions).toEqual(
      expect.arrayContaining(["heatwave", "uv_high"]),
    );
    expect(weather.advice).toBe(DEFAULT_WEBAPP_FORM.weather);
  });

  it("[unit] 폭염 텍스트라도 rain_prob이 threshold 아래로 강제되지 않는다 — T3 회귀", () => {
    const weather = parseWeatherFromText("폭염, 35도");

    expect(weather.rain_prob).toBe("30%");
    expect(weather.conditions).toEqual(["heatwave"]);
  });

  it("강수 키워드는 폭염 여부와 무관하게 독립적으로 rain_prob을 올린다", () => {
    const weather = parseWeatherFromText("폭염 속 소나기, 33도");

    expect(weather.rain_prob).toBe("70%");
    expect(weather.conditions).toEqual(["heatwave"]);
  });

  it("한파·자외선도 각각 독립 조건으로 분리된다", () => {
    expect(parseWeatherFromText("한파, -10도").conditions).toEqual(["coldwave"]);
    expect(parseWeatherFromText("자외선 매우 높음").conditions).toEqual(["uv_high"]);
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

  it("야외 블록 weather_note가 코스 라인에 반영 (비-폭염 날씨)", () => {
    // 폭염이 아닌 날씨로 별도 구성 — DEFAULT_WEBAPP_FORM.weather는 폭염을
    // 포함해 T3 하드-제외 대상이라 야외 블록이 등장하지 않는다(아래 별도 검증).
    const rainyTripRequest: TripRequest = {
      ...webAppTripRequest,
      weather: "23도~25도, 비 예보",
    };
    const normalized = normalize(rainyTripRequest);
    const options = buildGenerateBriefingOptions(
      rainyTripRequest,
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

  it("[regression] 폭염(DEFAULT_WEBAPP_FORM 기본 날씨) → is_outdoor=true 블록 0개 — T3 하드-제외", () => {
    const normalized = normalize(webAppTripRequest);
    const options = buildGenerateBriefingOptions(
      webAppTripRequest,
      "2026년 6월 17일(수)",
      BASE_TIMESTAMP,
    );
    const { feedback_events: cloudFeedbackEvents, ...generateOptions } =
      options;
    expect(options.weather?.conditions).toContain("heatwave");

    const briefing = generateBriefing({
      normalized,
      places,
      feedback_events: cloudFeedbackEvents,
      config: DEFAULT_APP_CONFIG,
      ...generateOptions,
    });

    const allBlocks = briefing.days.flatMap((day) => day.blocks);
    const outdoorBlocks = allBlocks.filter((block) => {
      const place = places.find((p) => p.id === block.place_id);
      return place?.is_outdoor === true;
    });

    expect(outdoorBlocks).toHaveLength(0);
    // 단순 안내문으로 대체된 게 아니라 실제로 배제되었는지 — 블록 자체가 줄지 않음(Joker/실내 대체)
    expect(allBlocks.length).toBeGreaterThan(0);
  });

  it("[regression] 한파 → is_outdoor=true 블록 0개 — 2026-06-18 겨울 여정 대비 확장", () => {
    const coldTripRequest: TripRequest = {
      ...webAppTripRequest,
      weather: "한파, -12도, 체감 -18도",
    };
    const normalized = normalize(coldTripRequest);
    const options = buildGenerateBriefingOptions(
      coldTripRequest,
      "2026년 1월 5일(월)",
      BASE_TIMESTAMP,
    );
    const { feedback_events: cloudFeedbackEvents, ...generateOptions } =
      options;
    expect(options.weather?.conditions).toContain("coldwave");

    const briefing = generateBriefing({
      normalized,
      places,
      feedback_events: cloudFeedbackEvents,
      config: DEFAULT_APP_CONFIG,
      ...generateOptions,
    });

    const allBlocks = briefing.days.flatMap((day) => day.blocks);
    const outdoorBlocks = allBlocks.filter((block) => {
      const place = places.find((p) => p.id === block.place_id);
      return place?.is_outdoor === true;
    });

    expect(outdoorBlocks).toHaveLength(0);
    expect(allBlocks.length).toBeGreaterThan(0);
  });
});

describe("resolveTripBriefingContext", () => {
  it("고정·가변 필드를 무결 JSON 컨텍스트로 분리", () => {
    const tripRequest: TripRequest = buildTripRequest({
      trip_days: 1,
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
