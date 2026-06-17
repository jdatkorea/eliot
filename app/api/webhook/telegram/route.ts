import { deliverTripBriefing } from "@/lib/journey/relay-briefing";
import {
  extractChatId,
  isWebhookClientError,
  parseStartUpdate,
  parseWebhookBody,
} from "@/lib/webhook/parse-telegram";
import { sendWebhookErrorMessage } from "@/lib/webhook/send-error-message";
import { sendStartKeyboard } from "@/lib/webhook/send-start-keyboard";
import { verifyTelegramWebhookSecret } from "@/lib/webhook/verify-webhook-secret";

function resolveUpdateType(body: unknown): string {
  if (!body || typeof body !== "object") return "unknown";
  if (!("message" in body)) return Object.keys(body).join(",");

  const message = (body as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "other_message";
  if ("web_app_data" in message) return "web_app_data";
  if ("text" in message) return "text";
  return "other_message";
}

export async function POST(request: Request) {
  const unauthorized = verifyTelegramWebhookSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  let body: unknown;
  try {
    body = await request.json();
    console.log("[recv] update_type:", resolveUpdateType(body));

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
    const result = await deliverTripBriefing(tripRequest, chatId, {
      skipIfNoToken: true,
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    const status = isWebhookClientError(error) ? 400 : 500;
    console.error("[webhook] 처리 오류:", message);

    const chatId = body !== undefined ? extractChatId(body) : undefined;
    if (chatId !== undefined) {
      try {
        await sendWebhookErrorMessage(chatId, { skipIfNoToken: true });
      } catch (notifyError) {
        const notifyMessage =
          notifyError instanceof Error
            ? notifyError.message
            : "알 수 없는 알림 오류";
        console.error("[webhook] 사용자 알림 실패:", notifyMessage);
      }
    }

    return Response.json({ ok: false, error: message }, { status });
  }
}
