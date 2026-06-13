import type { TripRequest } from "@/lib/engine/types";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number } };
  close: () => void;
  showAlert: (message: string) => void;
};

export async function submitTripRequest(
  webApp: TelegramWebApp,
  tripRequest: TripRequest,
): Promise<void> {
  if (!webApp.initData) {
    webApp.showAlert(
      "텔레그램 하단 전용 키보드 버튼을 통해서만 제출할 수 있습니다.",
    );
    return;
  }

  const response = await fetch("/api/journey/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: webApp.initDataUnsafe?.user?.id,
      data: tripRequest,
    }),
  });

  const result = (await response.json()) as { error?: string };

  if (response.ok) {
    webApp.close();
    return;
  }

  webApp.showAlert(result.error ?? "제출에 실패했습니다.");
}
