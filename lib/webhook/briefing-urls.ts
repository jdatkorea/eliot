import { compressToEncodedURIComponent } from "lz-string";
import { getFixtureBriefingData } from "@/lib/fixtures/briefing-data";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { normalize } from "@/lib/engine/normalize";
import type {
  AppConfig,
  Briefing,
  FeedbackEvent,
  Place,
  TripRequest,
} from "@/lib/engine/types";
import { deriveVariantB, variantLabel } from "@/lib/engine/variant";

function formatKstDate(date: Date): string {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = f.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}년 ${get("month")}월 ${get("day")}일(${get("weekday")})`;
}

/** 단일 브리핑(레거시) 또는 A/B 듀얼 페이로드 */
export type BriefingLinkPayload = {
  briefing?: Briefing;
  variantLabel?: string;
  briefingA?: Briefing;
  briefingB?: Briefing;
  labelA?: string;
  labelB?: string;
  feedbackUrl?: string;
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
  config: AppConfig;
};

export type ResolvedBriefingPayload = {
  briefing: Briefing;
  variant: "A" | "B";
  variantLabel: string;
  feedbackUrl?: string;
  dual?: {
    briefingA: Briefing;
    briefingB: Briefing;
    labelA: string;
    labelB: string;
  };
};

export function isDualBriefingPayload(
  payload: BriefingLinkPayload,
): payload is BriefingLinkPayload & {
  briefingA: Briefing;
  briefingB: Briefing;
  labelA: string;
  labelB: string;
} {
  return Boolean(payload.briefingA && payload.briefingB && payload.labelA && payload.labelB);
}

export function resolveBriefingPayload(
  payload: BriefingLinkPayload,
  variant: "A" | "B",
): ResolvedBriefingPayload {
  if (isDualBriefingPayload(payload)) {
    const briefing = variant === "B" ? payload.briefingB : payload.briefingA;
    const variantLabel =
      variant === "B" ? payload.labelB : payload.labelA;

    return {
      briefing,
      variant,
      variantLabel,
      feedbackUrl: payload.feedbackUrl,
      dual: {
        briefingA: payload.briefingA,
        briefingB: payload.briefingB,
        labelA: payload.labelA,
        labelB: payload.labelB,
      },
    };
  }

  if (!payload.briefing) {
    throw new Error("브리핑 데이터가 없습니다.");
  }

  return {
    briefing: payload.briefing,
    variant,
    variantLabel: payload.variantLabel ?? (variant === "B" ? "원거리·확장형" : "근거리·기본형"),
    feedbackUrl: payload.feedbackUrl,
  };
}

function buildBriefingUrl(
  baseUrl: string,
  payload: BriefingLinkPayload,
  variant: "A" | "B",
): string {
  const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/briefing#data=${compressed}&variant=${variant}`;
}

export function buildBriefingLinks(
  tripRequest: TripRequest,
  baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000",
  data: BriefingDataInput = getFixtureBriefingData(),
  feedbackUrl?: string,
): BriefingLinksResult {
  const normalized = normalize(tripRequest);
  const moodTagsA = normalized.mood_tags;
  const moodTagsB = deriveVariantB(moodTagsA);
  const { places, feedback_events, config } = data;

  const dateLabel = formatKstDate(new Date());

  const briefingA = generateBriefing({
    normalized: { ...normalized, mood_tags: moodTagsA },
    places,
    feedback_events,
    config,
    date_label: dateLabel,
  });

  const briefingB = generateBriefing({
    normalized: { ...normalized, mood_tags: moodTagsB },
    places,
    feedback_events,
    config,
    date_label: dateLabel,
  });

  const labelA = variantLabel(moodTagsA);
  const labelB = variantLabel(moodTagsB);

  const payload: BriefingLinkPayload = {
    briefingA,
    briefingB,
    labelA,
    labelB,
    feedbackUrl,
  };

  return {
    urlA: buildBriefingUrl(baseUrl, payload, "A"),
    urlB: buildBriefingUrl(baseUrl, payload, "B"),
    labelA,
    labelB,
    briefingA,
    briefingB,
  };
}
