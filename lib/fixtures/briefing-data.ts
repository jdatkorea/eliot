import placesFixture from "@/fixtures/places.sample.json";
import type { FeedbackEvent, Place } from "@/lib/engine/types";

export function getFixtureBriefingData(): {
  places: Place[];
  feedback_events: FeedbackEvent[];
} {
  return {
    places: placesFixture as Place[],
    feedback_events: [],
  };
}
