import { requireTripRequest } from "@/lib/engine/is-trip-request";
import type { TripRequest } from "@/lib/engine/types";

export type ParsedSubmitBody = {
  chatId: string | number | undefined;
  tripRequest: TripRequest;
};

function isValidChatId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function parseSubmitBody(body: unknown): ParsedSubmitBody {
  if (!body || typeof body !== "object") {
    throw new Error("요청 본문이 올바르지 않습니다.");
  }

  const { chatId, data } = body as Record<string, unknown>;
  const tripRequest = requireTripRequest(data, "data");

  const resolvedChatId = isValidChatId(chatId)
    ? chatId
    : (process.env.TELEGRAM_CHAT_ID ?? undefined);

  return { chatId: resolvedChatId, tripRequest };
}
