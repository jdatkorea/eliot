import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhook/telegram/route";
import { WEBHOOK_ERROR_USER_MESSAGE } from "@/lib/webhook/send-error-message";

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

describe("POST /api/webhook/telegram error handling", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
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

  it("web_app_data 누락 시 400 + 사용자 오류 메시지 sendMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    global.fetch = fetchMock;

    const response = await POST(
      makeRequest(
        { message: { chat: { id: 99 }, text: "hello" } },
        { "x-telegram-bot-api-secret-token": "expected-secret" },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Telegram update에 web_app_data가 없습니다.",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.telegram.org/bottest-bot-token/sendMessage",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      chat_id: 99,
      text: WEBHOOK_ERROR_USER_MESSAGE,
    });
  });

  it("지원하지 않는 payload 시 400 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    global.fetch = fetchMock;

    const response = await POST(
      makeRequest(
        { unknown_field: true },
        { "x-telegram-bot-api-secret-token": "expected-secret" },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "지원하지 않는 webhook payload 형식입니다.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
