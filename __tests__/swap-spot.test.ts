import { describe, expect, it, vi } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { swapSpotAtIndex } from "@/lib/engine/swap-spot";
import type { Place } from "@/lib/engine/types";
import { FIXED_DESTINATION } from "@/lib/webapp/build-trip-request";

const places = placesFixture as Place[];

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
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const result = swapSpotAtIndex({
      places,
      coursePlaceIds,
      blockIndex: 0,
      destination: FIXED_DESTINATION,
      mode: "couple",
    });

    expect(result.swappedPlace).not.toBeNull();
    expect(result.coursePlaceIds[0]).not.toBe(result.previousPlaceId);
    expect(result.coursePlaceIds[0]).toBe(result.swappedPlace?.id);
    expect(result.swappedPlace?.category).toBe("cafe");
    vi.restoreAllMocks();
  });

  it("후보가 없으면 교체하지 않는다", () => {
    const soloPlace = places[0]!;
    const result = swapSpotAtIndex({
      places: [soloPlace],
      coursePlaceIds: [soloPlace.id],
      blockIndex: 0,
      destination: FIXED_DESTINATION,
      mode: "family",
    });

    expect(result.swappedPlace).toBeNull();
    expect(result.coursePlaceIds).toEqual([soloPlace.id]);
  });
});
