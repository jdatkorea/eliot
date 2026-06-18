import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { applySwapToBriefing } from "@/lib/engine/apply-course-swap";
import {
  flattenBriefingPlaceIds,
  resolveGlobalBlockIndex,
  swapSpotAtIndex,
} from "@/lib/engine/swap-spot";
import type { Briefing } from "@/lib/engine/types";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import {
  normalizeStoredCourseState,
  type StoredCourseState,
} from "@/lib/webapp/course-state-storage";

export type CourseSwapRequest = {
  dayIndex: number;
  blockIndex: number;
  state: StoredCourseState;
};

export type CourseSwapSuccess = {
  ok: true;
  swapped: boolean;
  briefing: Briefing;
  state: StoredCourseState;
  message?: string;
  previous_place_id?: string;
  swapped_place_id?: string;
};

export type CourseSwapFailure = {
  ok: false;
  error: string;
};

export type CourseSwapResult = CourseSwapSuccess | CourseSwapFailure;

function isStoredCourseState(value: unknown): value is StoredCourseState {
  if (!value || typeof value !== "object") return false;
  const state = value as StoredCourseState;
  return (
    Boolean(state.briefing) &&
    (state.variant === "A" || state.variant === "B") &&
    typeof state.destination === "string" &&
    (state.mode === "family" || state.mode === "couple") &&
    Array.isArray(state.mood_tags)
  );
}

export function parseCourseSwapRequest(
  body: unknown,
): CourseSwapRequest | CourseSwapFailure {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "dayIndex·blockIndex·state가 필요합니다." };
  }

  const record = body as Record<string, unknown>;
  const dayIndex = record.dayIndex;
  const blockIndex = record.blockIndex;

  if (
    !Number.isInteger(dayIndex) ||
    !Number.isInteger(blockIndex) ||
    (dayIndex as number) < 0 ||
    (blockIndex as number) < 0
  ) {
    return { ok: false, error: "dayIndex·blockIndex·state가 필요합니다." };
  }

  if (!isStoredCourseState(record.state)) {
    return {
      ok: false,
      error:
        "코스 상태가 없습니다. CloudStorage에서 브리핑 상태를 읽어 state로 전달하세요.",
    };
  }

  return {
    dayIndex: dayIndex as number,
    blockIndex: blockIndex as number,
    state: normalizeStoredCourseState(record.state as StoredCourseState),
  };
}

export async function deliverCourseSwap(
  request: CourseSwapRequest,
): Promise<CourseSwapResult> {
  const { state, dayIndex, blockIndex } = request;
  const briefing = state.briefing;
  const globalIndex = resolveGlobalBlockIndex(
    briefing.days,
    dayIndex,
    blockIndex,
  );
  const coursePlaceIds = flattenBriefingPlaceIds(briefing.days);
  const tripId = state.trip_id;
  const attemptIndex = state.swap_attempt_index;

  const briefingData = await fetchBriefingData();
  const config = briefingData.config ?? DEFAULT_APP_CONFIG;
  const swapResult = swapSpotAtIndex({
    places: briefingData.places,
    coursePlaceIds,
    blockIndex: globalIndex,
    destination: state.destination,
    mode: state.mode,
    moodTags: state.mood_tags,
    tripId,
    attemptIndex,
    weatherConditions: briefing.weather.conditions,
    weatherExclusionRules: config.weather_exclusion_rules,
  });

  if (!swapResult.swappedPlace) {
    return {
      ok: true,
      swapped: false,
      briefing,
      state,
      message: "교체 가능한 동일 카테고리 장소가 없습니다.",
    };
  }

  const nextBriefing: Briefing = applySwapToBriefing({
    briefing,
    dayIndex,
    blockIndex,
    swappedPlace: swapResult.swappedPlace,
    config,
    moodTags: state.mood_tags,
  });

  const nextState: StoredCourseState = {
    ...state,
    briefing: nextBriefing,
    swap_attempt_index: attemptIndex + 1,
    saved_at: new Date().toISOString(),
  };

  return {
    ok: true,
    swapped: true,
    briefing: nextBriefing,
    state: nextState,
    previous_place_id: swapResult.previousPlaceId,
    swapped_place_id: swapResult.swappedPlace.id,
  };
}
