import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { parseWebhookBody } from "@/lib/webhook/parse-telegram";
import {
  buildTripRequest,
  DEFAULT_WEBAPP_FORM,
  FIXED_BASE_CAMP,
  FIXED_DURATION_HOURS,
  isWebAppFormValid,
  type WebAppFormState,
} from "@/lib/webapp/build-trip-request";

function wrapTelegramUpdate(tripRequest: TripRequest, chatId = 987654321) {
  return {
    message: {
      chat: { id: chatId },
      web_app_data: {
        data: JSON.stringify(tripRequest),
      },
    },
  };
}

const defaultFormState: WebAppFormState = { ...DEFAULT_WEBAPP_FORM };

describe("buildTripRequest (WebApp payload)", () => {
  it("기본값으로 고정 조건 + 가변 필드를 TripRequest에 매핑", () => {
    const payload = buildTripRequest(defaultFormState);

    expect(payload).toEqual({
      start_mode: "duration",
      duration_hours: FIXED_DURATION_HOURS,
      trip_days: 1,
      origin: FIXED_BASE_CAMP,
      return_location: FIXED_BASE_CAMP,
      mood_tags: [],
      mood_intensity: 90,
      mode: "family",
      weather: DEFAULT_WEBAPP_FORM.weather,
      sunset_time: DEFAULT_WEBAPP_FORM.sunset_time,
      constraints: DEFAULT_WEBAPP_FORM.constraints,
    });
    expect(payload).not.toHaveProperty("departure_time");
    expect(payload).not.toHaveProperty("return_time");
  });

  it("가변 필드 trim 후 페이로드에 반영", () => {
    const payload = buildTripRequest({
      trip_days: 2,
      weather: "  맑음  ",
      mood_intensity: 50,
      sunset_time: " 20:30 ",
      constraints: " 직선 동선 ",
    });

    expect(payload.weather).toBe("맑음");
    expect(payload.mood_intensity).toBe(50);
    expect(payload.sunset_time).toBe("20:30");
    expect(payload.constraints).toBe("직선 동선");
  });
});

describe("isWebAppFormValid", () => {
  it("기본값은 유효", () => {
    expect(isWebAppFormValid(defaultFormState)).toBe(true);
  });

  it("필수 가변 필드가 비어 있으면 무효", () => {
    expect(
      isWebAppFormValid({ ...defaultFormState, weather: "   " }),
    ).toBe(false);
    expect(
      isWebAppFormValid({ ...defaultFormState, constraints: "" }),
    ).toBe(false);
  });

  it("에너지 활성화도는 0~100 범위", () => {
    expect(
      isWebAppFormValid({ ...defaultFormState, mood_intensity: -1 }),
    ).toBe(false);
    expect(
      isWebAppFormValid({ ...defaultFormState, mood_intensity: 101 }),
    ).toBe(false);
  });
});

describe("parseWebhookBody (Telegram web_app_data)", () => {
  it("WebApp 페이로드를 TripRequest로 파싱", () => {
    const tripRequest = buildTripRequest(defaultFormState);
    const result = parseWebhookBody(wrapTelegramUpdate(tripRequest));

    expect(result.tripRequest).toEqual(tripRequest);
    expect(result.chatId).toBe(987654321);
    expect(normalize(result.tripRequest).duration).toBe(FIXED_DURATION_HOURS);
  });

  it("WebApp 페이로드로 브리핑 URL 2개 생성 가능", () => {
    const tripRequest = buildTripRequest(defaultFormState);
    const { tripRequest: parsed } = parseWebhookBody(
      wrapTelegramUpdate(tripRequest),
    );
    const links = buildBriefingLinks(parsed, "http://localhost:3000");

    expect(links.urlA).toMatch(/^http:\/\/localhost:3000\/briefing#data=/);
    expect(links.urlB).toMatch(/^http:\/\/localhost:3000\/briefing#data=/);
    expect(links.urlA).toContain("variant=A");
    expect(links.urlB).toContain("variant=B");
    expect(links.briefingA.context_meta?.weather_text).toBe(
      DEFAULT_WEBAPP_FORM.weather,
    );
    expect(links.briefingA.context_meta?.sunset_time).toBe(
      DEFAULT_WEBAPP_FORM.sunset_time,
    );
  });

  it("web_app_data가 없으면 에러", () => {
    expect(() =>
      parseWebhookBody({
        message: { chat: { id: 1 } },
      }),
    ).toThrow("web_app_data");
  });

  it("유효하지 않은 TripRequest면 에러", () => {
    expect(() =>
      parseWebhookBody(
        wrapTelegramUpdate({
          start_mode: "duration",
          duration_hours: 5,
          mode: "solo",
          mood_tags: [],
        } as unknown as TripRequest),
      ),
    ).toThrow("유효한 TripRequest");
  });

  it("쿼리 duration으로 TripRequest 운영 시간을 덮어쓴다", () => {
    const tripRequest = buildTripRequest(defaultFormState);
    const request = new Request(
      "http://localhost/api/webhook/telegram?duration=6",
      { method: "POST" },
    );
    const result = parseWebhookBody(wrapTelegramUpdate(tripRequest), request);

    expect(result.tripRequest.duration_hours).toBe(6);
    expect(normalize(result.tripRequest).duration).toBe(6);
  });

  it("페이로드 최상위 duration으로 TripRequest를 덮어쓴다", () => {
    const tripRequest = buildTripRequest(defaultFormState);
    const result = parseWebhookBody({
      duration_hours: 7,
      data: tripRequest,
    });

    expect(result.tripRequest.duration_hours).toBe(7);
  });
});

describe("WebApp 모바일 레이아웃 불변식", () => {
  it("고정·가변 필드 수가 명세와 일치 (고정 2 + 가변 5)", () => {
    const fixedKeys = ["operation_time", "base_camp"] as const;
    const dynamicKeys = Object.keys(DEFAULT_WEBAPP_FORM);

    expect(fixedKeys).toHaveLength(2);
    expect(dynamicKeys).toHaveLength(5);
    expect(dynamicKeys).toEqual([
      "trip_days",
      "weather",
      "mood_intensity",
      "sunset_time",
      "constraints",
    ]);
  });

  it("페이로드에 weather·sunset·constraints가 포함되어 백엔드로 전달 가능", () => {
    const payload = buildTripRequest(defaultFormState);

    expect(payload).toMatchObject({
      weather: expect.any(String),
      sunset_time: expect.any(String),
      constraints: expect.any(String),
      mood_intensity: expect.any(Number),
    });
  });
});
