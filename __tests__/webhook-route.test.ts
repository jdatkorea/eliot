import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhook/telegram/route";

const originalFetch = global.fetch;
const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/webhook/telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhook/telegram secret_token", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
    }
    if (originalAppBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalAppBaseUrl;
    }
    if (originalBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    }
  });

  it("헤더 불일치 시 401", async () => {
    const response = await POST(
      makeRequest(
        { message: { chat: { id: 1 }, text: "/start" } },
        { "x-telegram-bot-api-secret-token": "wrong-secret" },
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("헤더 일치 시 /start 분기 통과", async () => {
    process.env.APP_BASE_URL = "https://eliot-murex.vercel.app";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    global.fetch = fetchMock;

    const response = await POST(
      makeRequest(
        { message: { chat: { id: 42 }, text: "/start" } },
        { "x-telegram-bot-api-secret-token": "expected-secret" },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "start_keyboard",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
