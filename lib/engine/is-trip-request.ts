import type { TripRequest } from "./types";

export function isTripRequest(value: unknown): value is TripRequest {
  if (!value || typeof value !== "object") return false;

  const req = value as TripRequest;

  if (!(req.start_mode === "fixed" || req.start_mode === "duration")) return false;
  if (!Array.isArray(req.mood_tags)) return false;
  if (!(req.mode === "family" || req.mode === "couple")) return false;

  if (req.start_mode === "duration") {
    const h = req.duration_hours;
    if (!Number.isFinite(h) || (h as number) <= 0) return false;
  }

  if (req.trip_days !== undefined) {
    const d = req.trip_days;
    if (!Number.isFinite(d) || (d as number) < 1 || (d as number) > 3) return false;
  }

  return true;
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
