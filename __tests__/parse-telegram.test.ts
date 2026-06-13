import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { parseWebhookBody } from "@/lib/webhook/parse-telegram";
import {
  buildTripRequest,
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

const durationFormState: WebAppFormState = {
  start_mode: "duration",
  departure_time: "09:00",
  return_time: "14:00",
  duration_hours: 5,
  origin: "인천 송도",
  return_location: "인천 송도",
  mood_tags: ["relaxed_pace", "food_light"],
  mood_intensity: 3,
  mode: "family",
};

const fixedFormState: WebAppFormState = {
  start_mode: "fixed",
  departure_time: "10:30",
  return_time: "18:00",
  duration_hours: 5,
  origin: "인천 송도",
  return_location: "김포공항",
  mood_tags: ["baby_tired"],
  mood_intensity: 3,
  mode: "couple",
};

describe("buildTripRequest (WebApp payload)", () => {
  it("duration 모드: duration_hours만 포함하고 시각 필드는 제외", () => {
    const payload = buildTripRequest(durationFormState);

    expect(payload).toEqual({
      start_mode: "duration",
      duration_hours: 5,
      origin: "인천 송도",
      return_location: "인천 송도",
      mood_tags: ["relaxed_pace", "food_light"],
      mood_intensity: 3,
      mode: "family",
    });
    expect(payload).not.toHaveProperty("departure_time");
    expect(payload).not.toHaveProperty("return_time");
  });

  it("fixed 모드: 출발·도착 시각만 포함하고 duration_hours는 제외", () => {
    const payload = buildTripRequest(fixedFormState);

    expect(payload).toEqual({
      start_mode: "fixed",
      departure_time: "10:30",
      return_time: "18:00",
      origin: "인천 송도",
      return_location: "김포공항",
      mood_tags: ["baby_tired"],
      mood_intensity: 3,
      mode: "couple",
    });
    expect(payload).not.toHaveProperty("duration_hours");
  });
});

describe("parseWebhookBody (Telegram web_app_data)", () => {
  it("WebApp duration 페이로드를 TripRequest로 파싱", () => {
    const tripRequest = buildTripRequest(durationFormState);
    const result = parseWebhookBody(wrapTelegramUpdate(tripRequest));

    expect(result.tripRequest).toEqual(tripRequest);
    expect(result.chatId).toBe(987654321);
  });

  it("WebApp fixed 페이로드를 TripRequest로 파싱", () => {
    const tripRequest = buildTripRequest(fixedFormState);
    const result = parseWebhookBody(wrapTelegramUpdate(tripRequest));

    expect(result.tripRequest).toEqual(tripRequest);
    expect(normalize(result.tripRequest).duration).toBe(7.5);
  });

  it("WebApp 페이로드로 브리핑 URL 2개 생성 가능", () => {
    const tripRequest = buildTripRequest(durationFormState);
    const { tripRequest: parsed } = parseWebhookBody(
      wrapTelegramUpdate(tripRequest),
    );
    const links = buildBriefingLinks(parsed, "http://localhost:3000");

    expect(links.urlA).toMatch(/^http:\/\/localhost:3000\/briefing#data=/);
    expect(links.urlB).toMatch(/^http:\/\/localhost:3000\/briefing#data=/);
    expect(links.urlA).toContain("variant=A");
    expect(links.urlB).toContain("variant=B");
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
});
