import type { FeedbackContextTags, NormalizedTrip } from "@/lib/engine/types";

export const DEFAULT_SUBJECT_ID = "subin";

export type FeedbackLinkParams = {
  trip_id: string;
  subject_id: string;
  mood_tags: string[];
  mood_intensity?: number;
  mode: "family" | "couple";
  return_location: string;
  route_variant?: "A" | "B";
};

export function createFeedbackLinkParams(
  normalized: NormalizedTrip,
  tripId: string,
  subjectId = DEFAULT_SUBJECT_ID,
): FeedbackLinkParams {
  return {
    trip_id: tripId,
    subject_id: subjectId,
    mood_tags: normalized.mood_tags,
    mood_intensity: normalized.mood_intensity,
    mode: normalized.mode,
    return_location: normalized.return_location,
  };
}

export function buildFeedbackUrl(
  params: FeedbackLinkParams,
  baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000",
): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const search = new URLSearchParams();

  search.set("trip_id", params.trip_id);
  search.set("subject_id", params.subject_id);
  search.set("mode", params.mode);
  search.set("return_location", params.return_location);

  if (params.mood_tags.length > 0) {
    search.set("mood_tags", params.mood_tags.join(","));
  }

  if (params.mood_intensity !== undefined) {
    search.set("mood_intensity", String(params.mood_intensity));
  }

  if (params.route_variant) {
    search.set("route_variant", params.route_variant);
  }

  return `${normalizedBase}/feedback?${search.toString()}`;
}

export function parseMoodTagsParam(value: string | null): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseFeedbackLinkParams(
  searchParams: Pick<URLSearchParams, "get">,
): Partial<FeedbackLinkParams> {
  const trip_id = searchParams.get("trip_id")?.trim() || undefined;
  const subject_id =
    searchParams.get("subject_id")?.trim() || DEFAULT_SUBJECT_ID;
  const modeParam = searchParams.get("mode");
  const mode =
    modeParam === "family" || modeParam === "couple" ? modeParam : undefined;
  const return_location = searchParams.get("return_location")?.trim() || undefined;
  const mood_tags = parseMoodTagsParam(searchParams.get("mood_tags"));
  const moodIntensityParam = searchParams.get("mood_intensity");
  const mood_intensity =
    moodIntensityParam !== null && moodIntensityParam.trim() !== ""
      ? Number(moodIntensityParam)
      : undefined;
  const routeVariantParam = searchParams.get("route_variant");
  const route_variant =
    routeVariantParam === "A" || routeVariantParam === "B"
      ? routeVariantParam
      : undefined;

  return {
    trip_id,
    subject_id,
    mood_tags,
    mood_intensity:
      mood_intensity !== undefined && Number.isFinite(mood_intensity)
        ? mood_intensity
        : undefined,
    mode,
    return_location,
    route_variant,
  };
}

export function toContextTags(
  params: Pick<
    FeedbackLinkParams,
    "mood_tags" | "mood_intensity" | "mode" | "return_location" | "route_variant"
  >,
): FeedbackContextTags {
  const tags: FeedbackContextTags = {};

  if (params.mood_tags.length > 0) {
    tags.mood_tags = params.mood_tags;
  }

  if (params.mood_intensity !== undefined) {
    tags.mood_intensity = params.mood_intensity;
  }

  if (params.mode) {
    tags.mode = params.mode;
  }

  if (params.return_location) {
    tags.return_location = params.return_location;
  }

  if (params.route_variant) {
    tags.route_variant = params.route_variant;
  }

  return tags;
}
