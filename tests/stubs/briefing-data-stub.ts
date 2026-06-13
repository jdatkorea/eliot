import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { getFixtureBriefingData } from "@/lib/fixtures/briefing-data";
import type { AppConfig, FeedbackEvent, Place } from "@/lib/engine/types";
import type { BriefingData } from "@/lib/supabase/fetch-briefing-data";

export const JOKER_FALLBACK_NAME = "송도 현대프리미엄아울렛";

/** Supabase `fetchBriefingData()` 대체 — 로컬 fixture JSON 주입 */
export function stubFixtureBriefingData(
  source: BriefingData["source"] = "fixture",
): BriefingData {
  return { ...getFixtureBriefingData(), source };
}

/** 조건 불일치 시 Joker fallback(송도 현대프리미엄아울렛) 트리거용 빈 풀 */
export function stubEmptyPlacesBriefingData(
  source: BriefingData["source"] = "fixture",
): BriefingData {
  return {
    places: [],
    feedback_events: [],
    config: DEFAULT_APP_CONFIG,
    source,
  };
}

/** 커스텀 places/config로 Supabase 응답 형태를 흉내 */
export function stubBriefingData(input: {
  places?: Place[];
  feedback_events?: FeedbackEvent[];
  config?: AppConfig;
  source?: BriefingData["source"];
}): BriefingData {
  const base = getFixtureBriefingData();
  return {
    places: input.places ?? base.places,
    feedback_events: input.feedback_events ?? base.feedback_events,
    config: input.config ?? base.config,
    source: input.source ?? "fixture",
  };
}
