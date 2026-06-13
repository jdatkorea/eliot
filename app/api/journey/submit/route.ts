import { parseSubmitBody } from "@/lib/journey/parse-submit-body";
import { deliverTripBriefing } from "@/lib/journey/relay-briefing";

export async function POST(request: Request) {
  try {
    const data: unknown = await request.json();
    console.log("Submit API 호출됨, 데이터:", data);
    const { chatId, tripRequest } = parseSubmitBody(data);
    const result = await deliverTripBriefing(tripRequest, chatId, {
      requireChatId: true,
    });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[journey/submit] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
