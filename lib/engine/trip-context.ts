import {
  FIXED_BASE_CAMP,
  FIXED_DESTINATION,
  FIXED_DURATION_HOURS,
  FIXED_OPERATION_TIME_LABEL,
} from "@/lib/webapp/build-trip-request";
import { resolveDestinationFromCoords } from "@/lib/webapp/telegram-native";
import type {
  Briefing,
  BriefingContextMeta,
  FeedbackEvent,
  GenerateBriefingInput,
  PriorTripFeedback,
  TripRequest,
  WeatherCondition,
} from "./types";

export type TripBriefingContext = {
  operation_time: string;
  base_camp: string;
  weather_text: string;
  energy_level?: number;
  sunset_time?: string;
  constraints?: string;
};

/**
 * 과거 버그(T3 이전): heatLike(폭염/한파/자외선 통째로 한 깃발)일 때
 * rain_prob을 10%로 강제 하향해 "위험 신호를 낮은 강수확률로 위장"했다 —
 * 폭염 텍스트가 들어와도 야외 블록에 우천 경고조차 안 뜨고, 폭염 자체에 대한
 * 경고/제외는 아예 없었다. rain_prob과 폭염/한파/자외선은 서로 독립적인
 * 축이므로 섞지 않는다 — rain_prob은 강수 텍스트만으로 판정하고, 폭염 등은
 * 별도 conditions 배열로 노출해 course-generator의 하드-제외 규칙이 직접
 * 소비한다(단순 텍스트 안내로 대체하지 않음).
 */
export function parseWeatherFromText(text: string): Briefing["weather"] {
  const trimmed = text.trim();
  const tempRange = trimmed.match(/(\d+)\s*도\s*[~\-–]\s*(\d+)\s*도/);
  const rainLike = /비|우천|폭우|소나기|장마/i.test(trimmed);
  const summary = trimmed.split(",")[0]?.trim() || trimmed || "맑음";

  const conditions: WeatherCondition[] = [];
  if (/폭염/i.test(trimmed)) conditions.push("heatwave");
  if (/한파/i.test(trimmed)) conditions.push("coldwave");
  if (/자외선/i.test(trimmed)) conditions.push("uv_high");

  return {
    summary,
    temp: tempRange
      ? `${tempRange[1]}~${tempRange[2]}°C`
      : summary,
    rain_prob: rainLike ? "70%" : "30%",
    advice: trimmed || "날씨를 확인하고 준비물을 챙기세요.",
    ...(conditions.length > 0 ? { conditions } : {}),
  };
}

export function resolveHomeRegionFromTripRequest(
  tripRequest: TripRequest,
): string {
  if (tripRequest.destination?.trim()) {
    return tripRequest.destination.trim();
  }

  if (tripRequest.location) {
    return resolveDestinationFromCoords(
      tripRequest.location.lat,
      tripRequest.location.lng,
    );
  }

  return FIXED_DESTINATION;
}

export function feedbackEventsFromFeedbackLog(
  entries: PriorTripFeedback[],
  baseTimestamp: string,
): FeedbackEvent[] {
  return entries.flatMap((entry, index) => {
    const events = feedbackEventsFromPriorTrip(entry, baseTimestamp);
    return events.map((event) => ({
      ...event,
      id: `cloud-prior-feedback-${index}`,
      trip_id: `cloud-storage-prior-${index}`,
    }));
  });
}

export function feedbackEventsFromPriorTrip(
  prior: PriorTripFeedback | undefined,
  baseTimestamp: string,
): FeedbackEvent[] {
  if (!prior?.place_category) return [];

  return [
    {
      id: "cloud-prior-feedback",
      subject_id: "subin",
      trip_id: "cloud-storage-prior",
      context_tags: {
        mood_intensity: prior.mood_intensity,
        mood_tags: prior.mood_tags,
        mode: prior.mode,
        place_category: prior.place_category,
        weather: prior.weather,
      },
      satisfaction: prior.satisfaction ?? 3,
      failure_reason: prior.failure_reason ?? "none",
      note: null,
      created_at: prior.saved_at ?? baseTimestamp,
    },
  ];
}

export function mergePriorFeedbackIntoContext(
  meta: BriefingContextMeta,
  prior?: PriorTripFeedback,
): BriefingContextMeta {
  if (!prior) return meta;

  return {
    ...meta,
    prior_trip_feedback: prior,
    energy_level: prior.mood_intensity ?? meta.energy_level,
    weather_text: prior.weather?.trim() || meta.weather_text,
  };
}

export function resolveTripBriefingContext(
  tripRequest: TripRequest,
): TripBriefingContext {
  return {
    operation_time: FIXED_OPERATION_TIME_LABEL,
    base_camp: tripRequest.origin?.trim() || FIXED_BASE_CAMP,
    weather_text: tripRequest.weather?.trim() || "",
    energy_level: tripRequest.mood_intensity,
    sunset_time: tripRequest.sunset_time?.trim(),
    constraints: tripRequest.constraints?.trim(),
  };
}

export type GenerateBriefingOptionsResult = Pick<
  GenerateBriefingInput,
  "date_label" | "weather" | "trip_context" | "destination"
> & {
  feedback_events: FeedbackEvent[];
};

export function buildGenerateBriefingOptions(
  tripRequest: TripRequest,
  dateLabel: string,
  baseTimestamp: string,
): GenerateBriefingOptionsResult {
  const context = resolveTripBriefingContext(tripRequest);
  const homeRegion = resolveHomeRegionFromTripRequest(tripRequest);

  let trip_context: BriefingContextMeta = {
    ...context,
    duration_hours: tripRequest.duration_hours ?? FIXED_DURATION_HOURS,
    trip_days: tripRequest.trip_days,
    destination: homeRegion,
    ...(tripRequest.location ? { location: tripRequest.location } : {}),
  };

  trip_context = mergePriorFeedbackIntoContext(
    trip_context,
    tripRequest.prior_trip_feedback,
  );

  const priorFeedbackEvents = tripRequest.prior_trip_feedback
    ? feedbackEventsFromPriorTrip(tripRequest.prior_trip_feedback, baseTimestamp)
    : [];

  return {
    date_label: dateLabel,
    weather: context.weather_text
      ? parseWeatherFromText(context.weather_text)
      : undefined,
    trip_context,
    destination: homeRegion,
    feedback_events: priorFeedbackEvents,
  };
}
