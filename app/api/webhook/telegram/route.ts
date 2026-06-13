import { randomUUID } from "crypto";
import { normalize } from "@/lib/engine/normalize";
import {
  buildFeedbackUrl,
  createFeedbackLinkParams,
} from "@/lib/feedback/context";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { parseStartUpdate, parseWebhookBody } from "@/lib/webhook/parse-telegram";
import { sendStartKeyboard } from "@/lib/webhook/send-start-keyboard";
import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";
import { verifyTelegramWebhookSecret } from "@/lib/webhook/verify-webhook-secret";

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
  const unauthorized = verifyTelegramWebhookSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body: unknown = await request.json();

    // [recv] 수신 update 타입 진단
    const updateType =
      body && typeof body === "object"
        ? "message" in body
          ? (body as Record<string, unknown>).message &&
            typeof (body as Record<string, unknown>).message === "object" &&
            "web_app_data" in ((body as Record<string, unknown>).message as object)
            ? "web_app_data"
            : "text" in ((body as Record<string, unknown>).message as object)
              ? "text"
              : "other_message"
          : Object.keys(body).join(",")
        : "unknown";
    console.log("[recv] update_type:", updateType);

    const startUpdate = parseStartUpdate(body);

    if (startUpdate) {
      const appBaseUrl = process.env.APP_BASE_URL;
      if (!appBaseUrl || !appBaseUrl.startsWith("https://")) {
        console.error(
          "APP_BASE_URL이 없거나 https로 시작하지 않습니다:",
          appBaseUrl ?? "(미설정)",
        );
        return Response.json(
          {
            ok: false,
            error:
              "APP_BASE_URL이 없거나 https로 시작하지 않습니다. Telegram web_app URL은 HTTPS가 필요합니다.",
          },
          { status: 400 },
        );
      }

      await sendStartKeyboard(startUpdate.chatId, appBaseUrl);
      return Response.json({ ok: true, action: "start_keyboard" });
    }

    const { tripRequest, chatId } = parseWebhookBody(body);
    const briefingData = await fetchBriefingData();
    const { urlA, urlB, labelA, labelB } = buildBriefingLinks(
      tripRequest,
      undefined,
      briefingData,
    );

    // [engine] 결과 개수 + source 진단
    console.log(
      "[engine] places:", briefingData.places.length,
      "source:", briefingData.source,
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
      // [send] sendMessage 응답 (성공 시 이 줄 도달)
      console.log("[send] sendMessage OK chat_id:", resolvedChatId);
    } else {
      console.warn("[send] resolvedChatId undefined — sendMessage 스킵");
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
    console.error("[webhook] 처리 오류:", message);

    // Telegram은 non-2xx를 재시도 트리거로 해석 — 처리 실패는 200 ack 후 로그로만 관측
    return Response.json({ ok: true, error: message }, { status: 200 });
  }
}
