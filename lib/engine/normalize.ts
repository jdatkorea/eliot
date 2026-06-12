import type { NormalizedTrip, TripRequest } from "./types";

export const HOME_ADDRESS = "인천 송도";

export function hoursBetween(departure: string, returnTime: string): number {
  const start = parseTimeToMinutes(departure);
  const end = parseTimeToMinutes(returnTime);
  const diff = end - start;
  return diff > 0 ? diff / 60 : (24 * 60 + diff) / 60;
}

function parseTimeToMinutes(value: string): number {
  const isoMatch = value.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    return Number(isoMatch[1]) * 60 + Number(isoMatch[2]);
  }

  const clockMatch = value.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return date.getHours() * 60 + date.getMinutes();
  }

  throw new Error(`Invalid time format: ${value}`);
}

export function normalize(req: TripRequest): NormalizedTrip {
  const duration =
    req.start_mode === "fixed"
      ? hoursBetween(req.departure_time!, req.return_time!)
      : req.duration_hours!;

  const origin = req.origin ?? HOME_ADDRESS;

  return {
    duration,
    origin,
    mood_tags: req.mood_tags,
    mode: req.mode,
    return_location: req.return_location ?? origin,
  };
}
