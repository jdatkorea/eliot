import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { buildSwapSeed, deterministicIndex } from "@/lib/engine/deterministic-index";
import { swapSpotAtIndex } from "@/lib/engine/swap-spot";
import type { Place } from "@/lib/engine/types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

const places = placesFixture as Place[];
const TRIP_ID = "trip-deterministic-swap-test";
const ATTEMPT_INDEX = 0;

describe("swapSpotAtIndex", () => {
  it("동일 카테고리 후보로 블록을 교체한다", () => {
    const cafePlaces = places.filter((place) => place.category === "cafe");
    expect(cafePlaces.length).toBeGreaterThan(2);

    const coursePlaceIds = [
      cafePlaces[0]!.id,
      places.find((place) => place.category === "view")!.id,
      places.find((place) => place.category === "meal")!.id,
      cafePlaces[1]!.id,
    ];

    const result = swapSpotAtIndex({
      places,
      coursePlaceIds,
      blockIndex: 0,
      destination: FIXED_DESTINATION,
      mode: "couple",
      tripId: TRIP_ID,
      attemptIndex: ATTEMPT_INDEX,
    });

    expect(result.swappedPlace).not.toBeNull();
    expect(result.coursePlaceIds[0]).not.toBe(result.previousPlaceId);
    expect(result.coursePlaceIds[0]).toBe(result.swappedPlace?.id);
    expect(result.swappedPlace?.category).toBe("cafe");
  });

  it("동일 tripId·attemptIndex면 항상 같은 장소를 선택한다", () => {
    const cafePlaces = places.filter((place) => place.category === "cafe");
    const coursePlaceIds = [
      cafePlaces[0]!.id,
      places.find((place) => place.category === "view")!.id,
      places.find((place) => place.category === "meal")!.id,
      cafePlaces[1]!.id,
    ];

    const params = {
      places,
      coursePlaceIds,
      blockIndex: 0,
      destination: FIXED_DESTINATION,
      mode: "couple" as const,
      tripId: TRIP_ID,
      attemptIndex: ATTEMPT_INDEX,
    };

    const first = swapSpotAtIndex(params);
    const second = swapSpotAtIndex(params);

    expect(first.swappedPlace?.id).toBe(second.swappedPlace?.id);
    expect(buildSwapSeed(TRIP_ID, ATTEMPT_INDEX)).toBe(`${TRIP_ID}|${ATTEMPT_INDEX}`);
  });

  it("attemptIndex가 시드에 반영되어 선택 인덱스가 달라질 수 있다", () => {
    const indices = [0, 1, 2, 3, 4].map((attemptIndex) =>
      deterministicIndex(buildSwapSeed(TRIP_ID, attemptIndex), 5),
    );
    expect(new Set(indices).size).toBeGreaterThan(1);
  });

  it("후보가 없으면 교체하지 않는다", () => {
    const soloPlace = places[0]!;
    const result = swapSpotAtIndex({
      places: [soloPlace],
      coursePlaceIds: [soloPlace.id],
      blockIndex: 0,
      destination: FIXED_DESTINATION,
      mode: "family",
      tripId: TRIP_ID,
      attemptIndex: ATTEMPT_INDEX,
    });

    expect(result.swappedPlace).toBeNull();
    expect(result.coursePlaceIds).toEqual([soloPlace.id]);
  });
});
