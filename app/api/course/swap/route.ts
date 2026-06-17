import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { applySwapToBriefing } from "@/lib/engine/apply-course-swap";
import {
  flattenBriefingPlaceIds,
  resolveGlobalBlockIndex,
  swapSpotAtIndex,
} from "@/lib/engine/swap-spot";
import type { Briefing } from "@/lib/engine/types";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import type { StoredCourseState } from "@/lib/webapp/course-state-storage";

export type SwapCourseRequestBody = {
  dayIndex: number;
  blockIndex: number;
  state?: StoredCourseState;
};

function isSwapCourseRequestBody(value: unknown): value is SwapCourseRequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as SwapCourseRequestBody;
  return (
    Number.isInteger(body.dayIndex) &&
    Number.isInteger(body.blockIndex) &&
    body.dayIndex >= 0 &&
    body.blockIndex >= 0
  );
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isSwapCourseRequestBody(body)) {
      return Response.json(
        { ok: false, error: "dayIndex·blockIndex·state가 필요합니다." },
        { status: 400 },
      );
    }

    if (!body.state) {
      return Response.json(
        {
          ok: false,
          error:
            "코스 상태가 없습니다. CloudStorage에서 브리핑 상태를 읽어 state로 전달하세요.",
        },
        { status: 400 },
      );
    }

    const { state, dayIndex, blockIndex } = body;
    const briefing = state.briefing;
    const globalIndex = resolveGlobalBlockIndex(
      briefing.days,
      dayIndex,
      blockIndex,
    );
    const coursePlaceIds = flattenBriefingPlaceIds(briefing.days);

    const briefingData = await fetchBriefingData();
    const swapResult = swapSpotAtIndex({
      places: briefingData.places,
      coursePlaceIds,
      blockIndex: globalIndex,
      destination: state.destination,
      mode: state.mode,
      moodTags: state.mood_tags,
    });

    if (!swapResult.swappedPlace) {
      return Response.json({
        ok: true,
        swapped: false,
        briefing,
        message: "교체 가능한 동일 카테고리 장소가 없습니다.",
      });
    }

    const nextBriefing: Briefing = applySwapToBriefing({
      briefing,
      dayIndex,
      blockIndex,
      swappedPlace: swapResult.swappedPlace,
      config: briefingData.config ?? DEFAULT_APP_CONFIG,
      moodTags: state.mood_tags,
    });

    const nextState: StoredCourseState = {
      ...state,
      briefing: nextBriefing,
      saved_at: new Date().toISOString(),
    };

    return Response.json({
      ok: true,
      swapped: true,
      briefing: nextBriefing,
      state: nextState,
      previous_place_id: swapResult.previousPlaceId,
      swapped_place_id: swapResult.swappedPlace.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[course/swap] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
