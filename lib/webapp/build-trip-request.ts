import { HOME_ADDRESS } from "@/lib/engine/normalize";
import type { TripRequest } from "@/lib/engine/types";

export type WebAppFormState = {
  start_mode: "fixed" | "duration";
  departure_time: string;
  return_time: string;
  duration_hours: number;
  origin: string;
  return_location: string;
  mood_tags: string[];
  mode: "family" | "couple";
};

export function isWebAppFormValid(state: WebAppFormState): boolean {
  if (state.mode !== "family" && state.mode !== "couple") {
    return false;
  }

  if (state.start_mode === "fixed") {
    return Boolean(state.departure_time && state.return_time);
  }

  return Number.isFinite(state.duration_hours) && state.duration_hours > 0;
}

export function buildTripRequest(state: WebAppFormState): TripRequest {
  const origin = state.origin.trim() || HOME_ADDRESS;
  const returnLocation = state.return_location.trim() || origin;

  const shared = {
    mood_tags: state.mood_tags,
    mode: state.mode,
    origin,
    return_location: returnLocation,
  };

  if (state.start_mode === "fixed") {
    return {
      ...shared,
      start_mode: "fixed",
      departure_time: state.departure_time,
      return_time: state.return_time,
    };
  }

  return {
    ...shared,
    start_mode: "duration",
    duration_hours: state.duration_hours,
  };
}
