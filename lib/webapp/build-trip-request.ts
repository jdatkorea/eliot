import type { TripLocation, TripRequest } from "@/lib/engine/types";

export const FIXED_OPERATION_TIME_LABEL = "출발 ~ 귀환 (총 5시간)";
export const FIXED_BASE_CAMP = "인천 연수구 랜드마크로 20 호반써밋 송도";
export const FIXED_DESTINATION = "인천_근교";
export const FIXED_DURATION_HOURS = 5;

export const DEFAULT_WEBAPP_FORM: WebAppFormState = {
  weather: "23도~31도, 폭염, 자외선 매우 높음",
  mood_intensity: 90,
  sunset_time: "19:56",
  constraints:
    "18:00 이후 퇴근길 교통체증 회피를 위한 선형(Linear) 동선 유지 (와리가리 금지).",
};

export type WebAppFormState = {
  weather: string;
  mood_intensity: number;
  sunset_time: string;
  constraints: string;
  trip_date?: string;
  location?: TripLocation;
  destination?: string;
};

export function isWebAppFormValid(state: WebAppFormState): boolean {
  return (
    state.weather.trim().length > 0 &&
    Number.isFinite(state.mood_intensity) &&
    state.mood_intensity >= 0 &&
    state.mood_intensity <= 100 &&
    state.sunset_time.trim().length > 0 &&
    state.constraints.trim().length > 0
  );
}

export function buildTripRequest(state: WebAppFormState): TripRequest {
  const request: TripRequest = {
    start_mode: "duration",
    duration_hours: FIXED_DURATION_HOURS,
    origin: FIXED_BASE_CAMP,
    return_location: FIXED_BASE_CAMP,
    mood_tags: [],
    mood_intensity: state.mood_intensity,
    mode: "family",
    weather: state.weather.trim(),
    sunset_time: state.sunset_time.trim(),
    constraints: state.constraints.trim(),
  };

  if (state.trip_date?.trim()) {
    request.trip_date = state.trip_date.trim();
  }

  if (state.location) {
    request.location = state.location;
  }

  if (state.destination?.trim()) {
    request.destination = state.destination.trim();
  }

  return request;
}
