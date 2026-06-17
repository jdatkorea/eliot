import { canonicalizeDestination } from "./course-generator";
import { buildSwapSeed, deterministicIndex } from "./deterministic-index";
import type { Place, PlaceCategory } from "./types";

export type SwapSpotParams = {
  places: Place[];
  coursePlaceIds: string[];
  blockIndex: number;
  destination: string;
  mode: "family" | "couple";
  moodTags?: string[];
  tripId: string;
  attemptIndex: number;
};

export type SwapSpotResult = {
  coursePlaceIds: string[];
  previousPlaceId: string;
  swappedPlace: Place | null;
};

function passesRegionGate(
  place: Place,
  homeRegion: string,
  moodTags: string[],
): boolean {
  if (moodTags.includes("extend_range")) return true;
  return canonicalizeDestination(place.destination) === canonicalizeDestination(homeRegion);
}

function findPlaceById(places: Place[], id: string): Place | undefined {
  return places.find((place) => place.id === id);
}

function sameCategoryCandidates(
  places: Place[],
  category: PlaceCategory,
  params: Omit<SwapSpotParams, "blockIndex" | "coursePlaceIds" | "tripId" | "attemptIndex"> & {
    excludeIds: Set<string>;
    currentPlaceId: string;
  },
): Place[] {
  const moodTags = params.moodTags ?? [];
  return places.filter((place) => {
    if (place.category !== category) return false;
    if (place.id === params.currentPlaceId) return false;
    if (params.excludeIds.has(place.id)) return false;
    if (params.mode === "family" && place.no_kids_zone === true) return false;
    if (!passesRegionGate(place, params.destination, moodTags)) return false;
    return true;
  });
}

export function swapSpotAtIndex(params: SwapSpotParams): SwapSpotResult {
  const { coursePlaceIds, blockIndex, places, destination, mode, tripId, attemptIndex } =
    params;

  if (blockIndex < 0 || blockIndex >= coursePlaceIds.length) {
    throw new Error(`blockIndex ${blockIndex}가 코스 범위를 벗어났습니다.`);
  }

  const previousPlaceId = coursePlaceIds[blockIndex]!;
  const currentPlace = findPlaceById(places, previousPlaceId);
  if (!currentPlace) {
    return { coursePlaceIds: [...coursePlaceIds], previousPlaceId, swappedPlace: null };
  }

  const excludeIds = new Set(coursePlaceIds);
  const candidates = sameCategoryCandidates(places, currentPlace.category, {
    places,
    destination,
    mode,
    moodTags: params.moodTags,
    excludeIds,
    currentPlaceId: previousPlaceId,
  });

  if (candidates.length === 0) {
    return { coursePlaceIds: [...coursePlaceIds], previousPlaceId, swappedPlace: null };
  }

  const sortedCandidates = [...candidates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const seed = buildSwapSeed(tripId, attemptIndex);
  const swappedPlace =
    sortedCandidates[deterministicIndex(seed, sortedCandidates.length)] ?? null;
  if (!swappedPlace) {
    return { coursePlaceIds: [...coursePlaceIds], previousPlaceId, swappedPlace: null };
  }

  const nextIds = [...coursePlaceIds];
  nextIds[blockIndex] = swappedPlace.id;

  return {
    coursePlaceIds: nextIds,
    previousPlaceId,
    swappedPlace,
  };
}

export function flattenBriefingPlaceIds(
  days: { blocks: { place_id: string }[] }[],
): string[] {
  return days.flatMap((day) => day.blocks.map((block) => block.place_id));
}

export function resolveGlobalBlockIndex(
  days: { blocks: unknown[] }[],
  dayIndex: number,
  blockIndex: number,
): number {
  let offset = 0;
  for (let index = 0; index < dayIndex; index++) {
    offset += days[index]?.blocks.length ?? 0;
  }
  return offset + blockIndex;
}
