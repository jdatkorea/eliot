import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";

export type TelegramBriefingLinks = {
  urlA: string;
  urlB: string;
  labelA: string;
  labelB: string;
  feedbackUrl: string;
};

export async function sendTelegramLinks(
  chatId: string | number,
  links: TelegramBriefingLinks,
  options?: { skipIfNoToken?: boolean },
): Promise<void> {
  console.log("텔레그램 발송 시도 중...");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (options?.skipIfNoToken) return;
    throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.");
  }

  const { text, parse_mode } = buildTelegramLinkMessage(links);

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
