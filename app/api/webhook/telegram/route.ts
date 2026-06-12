import { randomUUID } from "crypto";
import { normalize } from "@/lib/engine/normalize";
import {
  buildFeedbackUrl,
  createFeedbackLinkParams,
} from "@/lib/feedback/context";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { parseWebhookBody } from "@/lib/webhook/parse-telegram";
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
    return;
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

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const { tripRequest, chatId } = parseWebhookBody(body);
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

    const resolvedChatId =
      chatId ?? process.env.TELEGRAM_CHAT_ID ?? undefined;

    if (resolvedChatId !== undefined) {
      await sendTelegramLinks(
        resolvedChatId,
        urlA,
        urlB,
        labelA,
        labelB,
        feedbackUrl,
      );
    }

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
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
