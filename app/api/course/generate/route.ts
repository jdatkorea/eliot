import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  assertNoCrossDayDuplicates,
  generateMultiDayCourse,
  type TripDurationDays,
} from "@/lib/engine/course-generator";
import type { Place } from "@/lib/engine/types";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";

type GenerateCourseBody = {
  duration: TripDurationDays;
  destination: string;
  mode?: "family" | "couple";
  mood_tags?: string[];
  origin?: string;
};

function isValidDuration(value: unknown): value is TripDurationDays {
  return value === 1 || value === 2 || value === 3;
}

function filterPlacesByDestination(
  places: Place[],
  destination: string,
): Place[] {
  return places.filter(
    (place) =>
      place.destination === destination ||
      place.destination.includes(destination) ||
      destination.includes(place.destination),
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateCourseBody;

    if (!isValidDuration(body.duration)) {
      return Response.json(
        { ok: false, error: "duration은 1, 2, 3 중 하나여야 합니다." },
        { status: 400 },
      );
    }

    if (!body.destination?.trim()) {
      return Response.json(
        { ok: false, error: "destination이 필요합니다." },
        { status: 400 },
      );
    }

    const destination = body.destination.trim();
    const mode = body.mode ?? "family";
    const mood_tags = body.mood_tags ?? [];

    const briefingData = await fetchBriefingData();
    const scopedPlaces = filterPlacesByDestination(
      briefingData.places,
      destination,
    );

    if (scopedPlaces.length === 0) {
      return Response.json(
        {
          ok: false,
          error: `destination "${destination}"에 해당하는 장소가 없습니다.`,
        },
        { status: 404 },
      );
    }

    const result = generateMultiDayCourse({
      duration: body.duration,
      places: scopedPlaces,
      config: briefingData.config ?? DEFAULT_APP_CONFIG,
      destination,
      mode,
      mood_tags,
      origin: body.origin,
      feedback_events: briefingData.feedback_events,
    });

    const noDuplicates = assertNoCrossDayDuplicates(result.blocks);

    console.log(
      `[course/generate] destination=${destination} duration=${body.duration} ` +
        `days=${result.blocks.length} duplicates=${!noDuplicates} ` +
        `pool_exhausted=${result.pool_exhausted ?? false}`,
    );

    for (const block of result.blocks) {
      console.log(
        `  Day ${block.day}: ${block.course.map((p) => p.name).join(" → ")}`,
      );
      console.log(
        `    ids: ${block.course.map((p) => p.id).join(", ")}`,
      );
    }

    return Response.json({
      ok: true,
      destination,
      duration: body.duration,
      blocks: result.blocks,
      pool_exhausted: result.pool_exhausted ?? false,
      cross_day_duplicates: !noDuplicates,
      data_source: briefingData.source,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[course/generate] 처리 오류:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
