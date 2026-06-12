import { FAILURE_REASONS } from "@/lib/feedback/validate";
import type { FailureReason } from "@/lib/engine/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const V0_SUBJECT_ID = "v0-subject";
const V0_TRIP_ID = "v0-trip";

type FeedbackPayload = {
  satisfaction: number;
  failure_reason: FailureReason;
  note?: string | null;
  subject_id?: string;
  trip_id?: string;
};

function isValidFailureReason(value: unknown): value is FailureReason {
  return (
    typeof value === "string" &&
    (FAILURE_REASONS as readonly string[]).includes(value)
  );
}

function parsePayload(body: unknown): FeedbackPayload {
  if (!body || typeof body !== "object") {
    throw new Error("요청 본문이 올바르지 않습니다.");
  }

  const record = body as Record<string, unknown>;
  const satisfaction = record.satisfaction;

  if (
    typeof satisfaction !== "number" ||
    !Number.isInteger(satisfaction) ||
    satisfaction < 1 ||
    satisfaction > 5
  ) {
    throw new Error("satisfaction은 1~5 정수여야 합니다.");
  }

  if (!isValidFailureReason(record.failure_reason)) {
    throw new Error("failure_reason이 올바르지 않습니다.");
  }

  const note =
    record.note === undefined || record.note === null
      ? null
      : String(record.note);

  const subject_id =
    typeof record.subject_id === "string" && record.subject_id.trim()
      ? record.subject_id.trim()
      : V0_SUBJECT_ID;

  const trip_id =
    typeof record.trip_id === "string" && record.trip_id.trim()
      ? record.trip_id.trim()
      : V0_TRIP_ID;

  return {
    satisfaction,
    failure_reason: record.failure_reason,
    note,
    subject_id,
    trip_id,
  };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const payload = parsePayload(body);

    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return Response.json(
        { ok: false, error: "Supabase가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const { error } = await supabase.from("feedback_events").insert({
      subject_id: payload.subject_id,
      trip_id: payload.trip_id,
      context_tags: {},
      satisfaction: payload.satisfaction,
      failure_reason: payload.failure_reason,
      note: payload.note,
    });

    if (error) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
