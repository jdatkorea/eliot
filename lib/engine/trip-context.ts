import {
  FIXED_BASE_CAMP,
  FIXED_DESTINATION,
  FIXED_DURATION_HOURS,
  FIXED_OPERATION_TIME_LABEL,
} from "@/lib/webapp/build-trip-request";
import { getFeedback } from "@/lib/webapp/feedback-storage";
import { resolveDestinationFromCoords } from "@/lib/webapp/telegram-native";
import type {
  Briefing,
  BriefingContextMeta,
  FeedbackEvent,
  GenerateBriefingInput,
  PriorTripFeedback,
  TripRequest,
} from "./types";

export type TripBriefingContext = {
  operation_time: string;
  base_camp: string;
  weather_text: string;
  energy_level?: number;
  sunset_time?: string;
  constraints?: string;
};

export function parseWeatherFromText(text: string): Briefing["weather"] {
  const trimmed = text.trim();
  const tempRange = trimmed.match(/(\d+)\s*도\s*[~\-–]\s*(\d+)\s*도/);
  const rainLike = /비|우천|폭우|소나기|장마/i.test(trimmed);
  const heatLike = /폭염|한파|자외선/i.test(trimmed);
  const summary = trimmed.split(",")[0]?.trim() || trimmed || "맑음";

  return {
    summary,
    temp: tempRange
      ? `${tempRange[1]}~${tempRange[2]}°C`
      : summary,
    rain_prob: rainLike ? "70%" : heatLike ? "10%" : "30%",
    advice: trimmed || "날씨를 확인하고 준비물을 챙기세요.",
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

export async function resolvePriorFeedback(): Promise<
  PriorTripFeedback | undefined
> {
  const log = await getFeedback();
  if (!log.entries.length) return undefined;

  for (let index = log.entries.length - 1; index >= 0; index -= 1) {
    const entry = log.entries[index];
    if (entry.place_category) return entry;
  }

  return log.entries[log.entries.length - 1];
}

export function feedbackEventsFromFeedbackLog(
  entries: PriorTripFeedback[],
): FeedbackEvent[] {
  return entries.flatMap((entry, index) => {
    const events = feedbackEventsFromPriorTrip(entry);
    return events.map((event) => ({
      ...event,
      id: `cloud-prior-feedback-${index}`,
      trip_id: `cloud-storage-prior-${index}`,
    }));
  });
}

export function feedbackEventsFromPriorTrip(
  prior: PriorTripFeedback | undefined,
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
      created_at: prior.saved_at ?? new Date().toISOString(),
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
    ? feedbackEventsFromPriorTrip(tripRequest.prior_trip_feedback)
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
