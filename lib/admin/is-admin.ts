export function isAdminTelegramUser(
  userId: number | undefined,
  commanderTelegramId: number,
): boolean {
  return (
    typeof userId === "number" &&
    Number.isFinite(userId) &&
    userId === commanderTelegramId
  );
}

export function readTelegramUserId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}
