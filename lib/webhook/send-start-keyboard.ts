const START_MESSAGE =
  "여정을 만들어 드릴게요. 아래 '여정 만들기' 버튼을 누르세요.";

export function buildStartKeyboardMarkup(webAppUrl: string) {
  return {
    keyboard: [[{ text: "여정 만들기", web_app: { url: webAppUrl } }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export async function sendStartKeyboard(
  chatId: string | number,
  appBaseUrl: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return;
  }

  const webAppUrl = `${appBaseUrl}/webapp`;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: START_MESSAGE,
        reply_markup: buildStartKeyboardMarkup(webAppUrl),
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram API 오류: ${response.status} ${detail}`);
  }
}
