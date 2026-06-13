import { POST } from "@/app/api/webhook/telegram/route";
import type { TripRequest } from "@/lib/engine/types";
import { buildTripRequest } from "@/lib/webapp/build-trip-request";
import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";

const mockTripRequest: TripRequest = {
  start_mode: "duration",
  duration_hours: 5,
  mood_tags: ["relaxed_pace"],
  mode: "family",
  origin: "인천 송도",
};

const mockTelegramUpdate = {
  message: {
    chat: { id: 123456789 },
    web_app_data: {
      data: JSON.stringify(mockTripRequest),
    },
  },
};

async function runWebhookTest(body: unknown, label: string) {
  console.log(`\n=== ${label} ===`);

  const request = new Request("http://localhost/api/webhook/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const response = await POST(request);
  const result = (await response.json()) as {
    ok: boolean;
    urls?: string[];
    labels?: { A: string; B: string };
    trip_id?: string;
    feedback_url?: string;
    error?: string;
  };

  if (!response.ok || !result.ok || !result.urls || !result.feedback_url) {
    throw new Error(result.error ?? `웹훅 테스트 실패 (${response.status})`);
  }

  console.log(`Variant A (${result.labels?.A}):`);
  console.log(result.urls[0]);
  console.log(`Variant B (${result.labels?.B}):`);
  console.log(result.urls[1]);
  console.log(`Feedback (trip_id=${result.trip_id}):`);
  console.log(result.feedback_url);

  const telegramPayload = buildTelegramLinkMessage({
    urlA: result.urls[0],
    urlB: result.urls[1],
    labelA: result.labels?.A ?? "",
    labelB: result.labels?.B ?? "",
    feedbackUrl: result.feedback_url,
  });

  console.log("\nTelegram sendMessage payload:");
  console.log(
    JSON.stringify(
      {
        chat_id: 123456789,
        ...telegramPayload,
        disable_web_page_preview: true,
      },
      null,
      2,
    ),
  );

  return result.urls;
}

const webAppTripRequest = buildTripRequest({
  start_mode: "fixed",
  departure_time: "09:00",
  return_time: "15:00",
  duration_hours: 5,
  origin: "인천 송도",
  return_location: "인천 송도",
  mood_tags: ["relaxed_pace", "food_hearty"],
  mood_intensity: 3,
  mode: "family",
});

const webAppTelegramUpdate = {
  message: {
    chat: { id: 123456789 },
    web_app_data: {
      data: JSON.stringify(webAppTripRequest),
    },
  },
};

async function main() {
  const directUrls = await runWebhookTest(mockTripRequest, "Direct TripRequest");
  const telegramUrls = await runWebhookTest(
    mockTelegramUpdate,
    "Telegram web_app_data payload",
  );
  const webAppUrls = await runWebhookTest(
    webAppTelegramUpdate,
    "WebApp form → web_app_data payload",
  );

  if (
    directUrls.length !== 2 ||
    telegramUrls.length !== 2 ||
    webAppUrls.length !== 2
  ) {
    throw new Error("URL 2개가 생성되지 않았습니다.");
  }

  console.log("\n✓ 웹훅 테스트 성공: URL 2개 정상 출력");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
