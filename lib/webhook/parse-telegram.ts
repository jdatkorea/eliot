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

function isTripRequest(value: unknown): value is TripRequest {
  if (!value || typeof value !== "object") return false;
  const req = value as TripRequest;
  return (
    (req.start_mode === "fixed" || req.start_mode === "duration") &&
    Array.isArray(req.mood_tags) &&
    (req.mode === "family" || req.mode === "couple")
  );
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
    if (!isTripRequest(parsed)) {
      throw new Error("web_app_data가 유효한 TripRequest가 아닙니다.");
    }

    return { tripRequest: parsed, chatId };
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
