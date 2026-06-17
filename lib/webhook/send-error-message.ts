export const WEBHOOK_ERROR_USER_MESSAGE = "시스템 오류로 다시 시도해주세요";

export async function sendWebhookErrorMessage(
  chatId: string | number,
  options?: { skipIfNoToken?: boolean },
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (options?.skipIfNoToken) return;
    throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: WEBHOOK_ERROR_USER_MESSAGE,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram API 오류: ${response.status} ${detail}`);
  }
}
