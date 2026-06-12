import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import placesFixture from "@/fixtures/places.sample.json";
import type { AppConfig } from "@/lib/config/app-config";
import type { FeedbackEvent, Place } from "@/lib/engine/types";

export function getFixtureBriefingData(): {
  places: Place[];
  feedback_events: FeedbackEvent[];
  config: AppConfig;
} {
  return {
    places: placesFixture as Place[],
    feedback_events: [],
    config: DEFAULT_APP_CONFIG,
  };
}
