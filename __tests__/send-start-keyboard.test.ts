import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStartUpdate } from "@/lib/webhook/parse-telegram";
import {
  buildStartKeyboardMarkup,
  sendStartKeyboard,
} from "@/lib/webhook/send-start-keyboard";

describe("parseStartUpdate (/start)", () => {
  it("/start 텍스트 update를 시작 명령으로 인식", () => {
    expect(
      parseStartUpdate({
        message: {
          chat: { id: 12345 },
          text: "/start",
        },
      }),
    ).toEqual({ chatId: 12345 });
  });

  it("web_app_data가 있으면 /start로 처리하지 않음", () => {
    expect(
      parseStartUpdate({
        message: {
          chat: { id: 1 },
          text: "/start",
          web_app_data: { data: "{}" },
        },
      }),
    ).toBeNull();
  });

  it("web_app_data만 있는 update는 null", () => {
    expect(
      parseStartUpdate({
        message: {
          chat: { id: 1 },
          web_app_data: { data: "{}" },
        },
      }),
    ).toBeNull();
  });
});

describe("sendStartKeyboard", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    }
  });

  it("web_app url 포함 reply_markup으로 sendMessage 호출", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    global.fetch = fetchMock;

    const appBaseUrl = "https://eliot-murex.vercel.app";
    await sendStartKeyboard(987654321, appBaseUrl);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottest-bot-token/sendMessage");

    const payload = JSON.parse(String(init.body)) as {
      chat_id: number;
      text: string;
      reply_markup: ReturnType<typeof buildStartKeyboardMarkup>;
    };

    expect(payload.chat_id).toBe(987654321);
    expect(payload.text).toContain("여정 만들기");
    expect(payload.reply_markup).toEqual(
      buildStartKeyboardMarkup(`${appBaseUrl}/webapp`),
    );
    expect(payload.reply_markup.keyboard[0][0].web_app.url).toBe(
      "https://eliot-murex.vercel.app/webapp",
    );
  });
});
