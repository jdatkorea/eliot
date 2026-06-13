import type { TripRequest } from "./types";

export function isTripRequest(value: unknown): value is TripRequest {
  if (!value || typeof value !== "object") return false;

  const req = value as TripRequest;
  return (
    (req.start_mode === "fixed" || req.start_mode === "duration") &&
    Array.isArray(req.mood_tags) &&
    (req.mode === "family" || req.mode === "couple")
  );
}

export function requireTripRequest(
  value: unknown,
  label = "data",
): TripRequest {
  if (!isTripRequest(value)) {
    throw new Error(`${label}가 유효한 TripRequest가 아닙니다.`);
  }
  return value;
}
