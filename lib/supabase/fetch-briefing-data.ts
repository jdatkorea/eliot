import { getFixtureBriefingData } from "@/lib/fixtures/briefing-data";
import type { FeedbackEvent, Place } from "@/lib/engine/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FETCH_TIMEOUT_MS = 3_000;

export type BriefingData = {
  places: Place[];
  feedback_events: FeedbackEvent[];
};

async function fetchFromSupabase(): Promise<BriefingData> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  const [placesResult, feedbackResult] = await Promise.all([
    supabase.from("places").select("*"),
    supabase.from("feedback_events").select("*"),
  ]);

  if (placesResult.error) {
    throw placesResult.error;
  }
  if (feedbackResult.error) {
    throw feedbackResult.error;
  }

  return {
    places: (placesResult.data ?? []) as Place[],
    feedback_events: (feedbackResult.data ?? []) as FeedbackEvent[],
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Supabase 조회 시간 초과 (${ms}ms)`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function fetchBriefingData(): Promise<BriefingData> {
  const fallback = getFixtureBriefingData();

  try {
    return await withTimeout(fetchFromSupabase(), FETCH_TIMEOUT_MS);
  } catch {
    return fallback;
  }
}
