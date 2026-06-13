import { randomUUID } from "crypto";
import { normalize } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";
import {
  buildFeedbackUrl,
  createFeedbackLinkParams,
} from "@/lib/feedback/context";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";

async function sendTelegramLinks(
  chatId: string | number,
  urlA: string,
  urlB: string,
  labelA: string,
  labelB: string,
  feedbackUrl: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.");
  }

  const { text, parse_mode } = buildTelegramLinkMessage({
    urlA,
    urlB,
    labelA,
    labelB,
    feedbackUrl,
  });

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode,
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram API 오류: ${response.status} ${detail}`);
  }
}

function isValidChatId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isTripRequest(value: unknown): value is TripRequest {
  if (!value || typeof value !== "object") return false;
  const req = value as TripRequest;
  return (
    (req.start_mode === "fixed" || req.start_mode === "duration") &&
    Array.isArray(req.mood_tags) &&
    (req.mode === "family" || req.mode === "couple")
  );
}

function parseSubmitBody(body: unknown): {
  chatId: string | number | undefined;
  tripRequest: TripRequest;
} {
  if (!body || typeof body !== "object") {
    throw new Error("요청 본문이 올바르지 않습니다.");
  }

  const record = body as Record<string, unknown>;
  const { chatId, data } = record;

  if (!isTripRequest(data)) {
    throw new Error("data가 유효한 TripRequest가 아닙니다.");
  }

  const resolvedChatId: string | number | undefined =
    isValidChatId(chatId)
      ? chatId
      : (process.env.TELEGRAM_CHAT_ID ?? undefined);

  return { chatId: resolvedChatId, tripRequest: data };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const { chatId, tripRequest } = parseSubmitBody(body);

    const briefingData = await fetchBriefingData();
    const { urlA, urlB, labelA, labelB } = buildBriefingLinks(
      tripRequest,
      undefined,
      briefingData,
    );

    const tripId = randomUUID();
    const normalized = normalize(tripRequest);
    const feedbackUrl = buildFeedbackUrl(
      createFeedbackLinkParams(normalized, tripId),
    );

    if (chatId === undefined) {
      throw new Error("chatId가 없습니다.");
    }

    await sendTelegramLinks(
      chatId,
      urlA,
      urlB,
      labelA,
      labelB,
      feedbackUrl,
    );

    return Response.json({
      ok: true,
      urls: [urlA, urlB],
      labels: { A: labelA, B: labelB },
      trip_id: tripId,
      feedback_url: feedbackUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[journey/submit] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
