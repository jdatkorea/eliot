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

const MOOD_INTENSITY_LOW_THRESHOLD = 30;
const MOOD_INTENSITY_HIGH_THRESHOLD = 70;
const MOOD_INTENSITY_INDOOR_THRESHOLD = 15;

export function clampMoodIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveMoodTagsFromIntensity(intensity: number): string[] {
  const clamped = clampMoodIntensity(intensity);
  const tags: string[] = [];

  if (clamped < MOOD_INTENSITY_LOW_THRESHOLD) {
    tags.push("baby_tired");
    if (clamped < MOOD_INTENSITY_INDOOR_THRESHOLD) {
      tags.push("indoor_only");
    }
  } else if (clamped > MOOD_INTENSITY_HIGH_THRESHOLD) {
    tags.push("extend_range");
  } else {
    tags.push("relaxed_pace");
  }

  return tags;
}

function mergeMoodTags(derived: string[], manual: string[]): string[] {
  return [...new Set([...derived, ...manual])];
}

export function normalize(req: TripRequest): NormalizedTrip {
  const duration =
    req.start_mode === "fixed"
      ? hoursBetween(req.departure_time!, req.return_time!)
      : req.duration_hours!;

  const origin = req.origin ?? HOME_ADDRESS;

  const mood_intensity =
    req.mood_intensity !== undefined
      ? clampMoodIntensity(req.mood_intensity)
      : undefined;

  const mood_tags =
    mood_intensity !== undefined
      ? mergeMoodTags(
          deriveMoodTagsFromIntensity(mood_intensity),
          req.mood_tags,
        )
      : req.mood_tags;

  const trip_days =
    req.trip_days !== undefined && req.trip_days >= 1
      ? Math.min(3, Math.max(1, Math.round(req.trip_days)))
      : 1;

  return {
    duration,
    trip_days,
    origin,
    mood_tags,
    mood_intensity,
    mode: req.mode,
    return_location: req.return_location ?? origin,
  };
}
