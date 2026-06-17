import type { TripRequest } from "@/lib/engine/types";

function parseDurationHours(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return undefined;
  return hours;
}

export function resolveDurationHoursFromPayload(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;

  const record = body as Record<string, unknown>;
  const direct =
    parseDurationHours(
      typeof record.duration === "number"
        ? String(record.duration)
        : typeof record.duration === "string"
          ? record.duration
          : undefined,
    ) ??
    parseDurationHours(
      typeof record.duration_hours === "number"
        ? String(record.duration_hours)
        : typeof record.duration_hours === "string"
          ? record.duration_hours
          : undefined,
    );

  return direct;
}

export function resolveDurationHoursFromRequest(
  request: Request,
): number | undefined {
  const url = new URL(request.url);
  return (
    parseDurationHours(url.searchParams.get("duration")) ??
    parseDurationHours(url.searchParams.get("duration_hours"))
  );
}

export function applyDurationOverride(
  tripRequest: TripRequest,
  request?: Request,
  body?: unknown,
): TripRequest {
  const hours =
    (request ? resolveDurationHoursFromRequest(request) : undefined) ??
    resolveDurationHoursFromPayload(body);

  if (hours === undefined) return tripRequest;

  return {
    ...tripRequest,
    start_mode: "duration",
    duration_hours: hours,
  };
}
