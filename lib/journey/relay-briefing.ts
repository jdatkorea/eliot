import { randomUUID } from "crypto";
import {
  formatBriefingFamilyTime,
  sanitizeTelegramMarkdown,
} from "@/lib/engine/format-briefing";
import { normalize } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";
import {
  buildFeedbackUrl,
  createFeedbackLinkParams,
} from "@/lib/feedback/context";
import {
  fetchBriefingData,
  type BriefingData,
} from "@/lib/supabase/fetch-briefing-data";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import {
  sendTelegramLinks,
  type TelegramBriefingLinks,
} from "@/lib/webhook/send-telegram-links";

export type RelayBriefingResult = {
  urlA: string;
  urlB: string;
  labelA: string;
  labelB: string;
  tripId: string;
  feedbackUrl: string;
  placesCount: number;
  dataSource: BriefingData["source"];
  briefingSummary?: string;
};

export type JourneySubmitResponse = {
  ok: true;
  urls: [string, string];
  labels: { A: string; B: string };
  trip_id: string;
  feedback_url: string;
};

export type DeliverTripBriefingOptions = {
  skipIfNoToken?: boolean;
  requireChatId?: boolean;
};

function toTelegramLinks(
  result: RelayBriefingResult,
  briefingSummary?: string,
): TelegramBriefingLinks {
  return {
    urlA: result.urlA,
    urlB: result.urlB,
    labelA: result.labelA,
    labelB: result.labelB,
    feedbackUrl: result.feedbackUrl,
    briefingSummary,
  };
}

export function toJourneyResponse(
  result: RelayBriefingResult,
): JourneySubmitResponse {
  return {
    ok: true,
    urls: [result.urlA, result.urlB],
    labels: { A: result.labelA, B: result.labelB },
    trip_id: result.tripId,
    feedback_url: result.feedbackUrl,
  };
}

export async function relayTripBriefing(
  tripRequest: TripRequest,
  briefingData?: BriefingData,
): Promise<RelayBriefingResult> {
  const data = briefingData ?? (await fetchBriefingData());
  const tripId = randomUUID();
  const normalized = normalize(tripRequest);
  const feedbackUrl = buildFeedbackUrl(
    createFeedbackLinkParams(normalized, tripId),
  );

  const { urlA, urlB, labelA, labelB, briefingA } = await buildBriefingLinks(
    tripRequest,
    undefined,
    data,
    feedbackUrl,
  );

  const briefingSummary = sanitizeTelegramMarkdown(
    formatBriefingFamilyTime(briefingA, labelA),
  );

  return {
    urlA,
    urlB,
    labelA,
    labelB,
    tripId,
    feedbackUrl,
    placesCount: data.places.length,
    dataSource: data.source,
    briefingSummary,
  };
}

export async function deliverTripBriefing(
  tripRequest: TripRequest,
  chatId?: string | number,
  options?: DeliverTripBriefingOptions,
): Promise<JourneySubmitResponse> {
  const briefing = await relayTripBriefing(tripRequest);

  const resolvedChatId =
    chatId ?? process.env.TELEGRAM_CHAT_ID ?? undefined;

  if (resolvedChatId === undefined) {
    if (options?.requireChatId) {
      throw new Error("chatId가 없습니다.");
    }
    console.warn("[relay] resolvedChatId undefined — sendMessage 스킵");
  } else {
    await sendTelegramLinks(
      resolvedChatId,
      toTelegramLinks(briefing, briefing.briefingSummary),
      {
        skipIfNoToken: options?.skipIfNoToken,
      },
    );
    console.log("[relay] sendMessage OK chat_id:", resolvedChatId);
  }

  console.log(
    "[relay] places:",
    briefing.placesCount,
    "source:",
    briefing.dataSource,
  );

  return toJourneyResponse(briefing);
}
