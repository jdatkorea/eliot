import {
  deliverCourseSwap,
  parseCourseSwapRequest,
} from "@/lib/webhook/course-swap-callback";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = parseCourseSwapRequest(body);

    if ("ok" in parsed) {
      return Response.json(parsed, { status: 400 });
    }

    const result = await deliverCourseSwap(parsed);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[course/swap] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
