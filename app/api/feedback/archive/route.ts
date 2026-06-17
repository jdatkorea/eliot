import type { PriorTripFeedback } from "@/lib/engine/types";

type ArchivePayload = {
  entries?: PriorTripFeedback[];
  archived_at?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ArchivePayload;
    const entries = Array.isArray(body.entries) ? body.entries : [];

    console.warn("[feedback/archive] CloudStorage recycle dump", {
      count: entries.length,
      archived_at: body.archived_at ?? new Date().toISOString(),
      entries,
    });

    return Response.json({ ok: true, archived: entries.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[feedback/archive] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
