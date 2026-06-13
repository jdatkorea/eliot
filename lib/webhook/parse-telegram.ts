import { isTripRequest, requireTripRequest } from "@/lib/engine/is-trip-request";
import type { TripRequest } from "@/lib/engine/types";

type TelegramChat = { id: number | string };

type TelegramMessage = {
  chat?: TelegramChat;
  web_app_data?: { data: string };
};

export type TelegramUpdate = {
  message?: TelegramMessage;
};

export type ParsedWebhookInput = {
  tripRequest: TripRequest;
  chatId: string | number | undefined;
};

export type StartUpdate = {
  chatId: string | number;
};

export function parseStartUpdate(body: unknown): StartUpdate | null {
  if (!body || typeof body !== "object" || !("message" in body)) {
    return null;
  }

  const update = body as TelegramUpdate;
  const chatId = update.message?.chat?.id;
  const rawData = update.message?.web_app_data?.data;
  const text = (update.message as { text?: string } | undefined)?.text;

  if (rawData || text !== "/start" || chatId === undefined) {
    return null;
  }

  return { chatId };
}

export function parseWebhookBody(body: unknown): ParsedWebhookInput {
  if (body && typeof body === "object" && "message" in body) {
    const update = body as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const rawData = update.message?.web_app_data?.data;

    if (!rawData) {
      throw new Error("Telegram update에 web_app_data가 없습니다.");
    }

    const parsed = JSON.parse(rawData) as unknown;
    const tripRequest = requireTripRequest(parsed, "web_app_data");

    return { tripRequest, chatId };
  }

  if (isTripRequest(body)) {
    const envChatId = process.env.TELEGRAM_CHAT_ID;
    return {
      tripRequest: body,
      chatId: envChatId ? envChatId : undefined,
    };
  }

  throw new Error("지원하지 않는 webhook payload 형식입니다.");
}
