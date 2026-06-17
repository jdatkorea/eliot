import {
  buildGenerateBriefingOptions,
  resolvePriorFeedback,
} from "@/lib/engine/trip-context";
import type { PriorTripFeedback, TripRequest } from "@/lib/engine/types";
import { saveFeedback } from "@/lib/webapp/feedback-storage";
import { formatKstDateLabelFromIso } from "@/lib/webapp/telegram-native";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number } };
  close: () => void;
  showAlert: (message: string) => void;
};

function resolveDateLabel(tripRequest: TripRequest, baseTimestamp: string): string {
  if (tripRequest.trip_date?.trim()) {
    return formatKstDateLabelFromIso(tripRequest.trip_date.trim());
  }

  const now = new Date(baseTimestamp);
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = f.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}년 ${get("month")}월 ${get("day")}일(${get("weekday")})`;
}

async function enrichTripRequestWithCloudFeedback(
  tripRequest: TripRequest,
): Promise<TripRequest> {
  let priorFeedback: PriorTripFeedback | undefined;

  if (typeof window !== "undefined" && window.Telegram?.WebApp) {
    priorFeedback = await resolvePriorFeedback();
  }

  const enriched: TripRequest = {
    ...tripRequest,
    ...(priorFeedback ? { prior_trip_feedback: priorFeedback } : {}),
  };

  const baseTimestamp = new Date().toISOString();
  const dateLabel = resolveDateLabel(enriched, baseTimestamp);
  const options = buildGenerateBriefingOptions(
    enriched,
    dateLabel,
    baseTimestamp,
  );

  if (options.trip_context) {
    enriched.prior_trip_feedback = options.trip_context.prior_trip_feedback;
  }

  return enriched;
}

function buildFeedbackPayload(tripRequest: TripRequest): PriorTripFeedback {
  return {
    mood_intensity: tripRequest.mood_intensity,
    mood_tags: tripRequest.mood_tags,
    mode: tripRequest.mode,
    weather: tripRequest.weather,
    saved_at: new Date().toISOString(),
  };
}

export async function submitTripRequest(
  webApp: TelegramWebApp,
  tripRequest: TripRequest,
): Promise<void> {
  if (!webApp.initData) {
    webApp.showAlert(
      "텔레그램 하단 전용 키보드 버튼을 통해서만 제출할 수 있습니다.",
    );
    return;
  }

  const enrichedRequest = await enrichTripRequestWithCloudFeedback(tripRequest);

  const response = await fetch("/api/journey/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: webApp.initDataUnsafe?.user?.id,
      data: enrichedRequest,
    }),
  });

  const result = (await response.json()) as { error?: string };

  if (response.ok) {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      await saveFeedback(buildFeedbackPayload(enrichedRequest));
    }
    webApp.close();
    return;
  }

  webApp.showAlert(result.error ?? "제출에 실패했습니다.");
}
