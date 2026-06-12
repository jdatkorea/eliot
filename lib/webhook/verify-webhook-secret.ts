export function verifyTelegramWebhookSecret(
  request: Request,
): Response | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "TELEGRAM_WEBHOOK_SECRET 미설정 — webhook secret 검증을 건너뜁니다.",
    );
    return null;
  }

  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (header !== secret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
