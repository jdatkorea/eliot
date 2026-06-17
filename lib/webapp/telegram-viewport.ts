type TelegramWebAppBridge = {
  expand?: () => void;
};

function getNativeTelegramWebApp(): TelegramWebAppBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as Window & { Telegram?: { WebApp?: TelegramWebAppBridge } }
  ).Telegram?.WebApp;
}

export function forceTelegramExpand(): void {
  getNativeTelegramWebApp()?.expand?.();
}

export function correctTelegramViewportOnBlur(): void {
  if (typeof window === "undefined") return;

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }

  forceTelegramExpand();
  window.scrollTo(0, 0);

  requestAnimationFrame(() => {
    const { body } = document;
    const previousHeight = body.style.height;
    body.style.height = `${window.innerHeight}px`;

    requestAnimationFrame(() => {
      body.style.height = previousHeight;
      forceTelegramExpand();
      window.scrollTo(0, 0);
    });
  });
}
