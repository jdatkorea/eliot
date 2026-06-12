import { compressToEncodedURIComponent } from "lz-string";
import { getFixtureBriefingData } from "@/lib/fixtures/briefing-data";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { normalize } from "@/lib/engine/normalize";
import type {
  Briefing,
  FeedbackEvent,
  Place,
  TripRequest,
} from "@/lib/engine/types";
import { deriveVariantB, variantLabel } from "@/lib/engine/variant";

export type BriefingLinkPayload = {
  briefing: Briefing;
  variantLabel: string;
};

export type BriefingLinksResult = {
  urlA: string;
  urlB: string;
  labelA: string;
  labelB: string;
  briefingA: Briefing;
  briefingB: Briefing;
};

export type BriefingDataInput = {
  places: Place[];
  feedback_events: FeedbackEvent[];
};

function buildBriefingUrl(
  baseUrl: string,
  briefing: Briefing,
  label: string,
  variant: "A" | "B",
): string {
  const payload: BriefingLinkPayload = { briefing, variantLabel: label };
  const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/briefing#data=${compressed}&variant=${variant}`;
}

export function buildBriefingLinks(
  tripRequest: TripRequest,
  baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000",
  data: BriefingDataInput = getFixtureBriefingData(),
): BriefingLinksResult {
  const normalized = normalize(tripRequest);
  const moodTagsA = normalized.mood_tags;
  const moodTagsB = deriveVariantB(moodTagsA);
  const { places, feedback_events } = data;

  const briefingA = generateBriefing({
    normalized: { ...normalized, mood_tags: moodTagsA },
    places,
    feedback_events,
  });

  const briefingB = generateBriefing({
    normalized: { ...normalized, mood_tags: moodTagsB },
    places,
    feedback_events,
  });

  const labelA = variantLabel(moodTagsA);
  const labelB = variantLabel(moodTagsB);

  return {
    urlA: buildBriefingUrl(baseUrl, briefingA, labelA, "A"),
    urlB: buildBriefingUrl(baseUrl, briefingB, labelB, "B"),
    labelA,
    labelB,
    briefingA,
    briefingB,
  };
}
