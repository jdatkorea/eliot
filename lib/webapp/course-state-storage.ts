import type { Briefing } from "@/lib/engine/types";
import { V0_TRIP_ID } from "@/lib/feedback/context";
import {
  readCloudStorageItem,
  writeCloudStorageItem,
} from "@/lib/webapp/telegram-native";

export const COURSE_STATE_STORAGE_KEY = "eliott_course_state";

export type StoredCourseState = {
  briefing: Briefing;
  variant: "A" | "B";
  destination: string;
  mode: "family" | "couple";
  mood_tags: string[];
  trip_id: string;
  swap_attempt_index: number;
  saved_at: string;
};

function isStoredCourseStateCore(value: unknown): value is Omit<
  StoredCourseState,
  "trip_id" | "swap_attempt_index"
> & {
  trip_id?: string;
  swap_attempt_index?: number;
} {
  if (!value || typeof value !== "object") return false;
  const state = value as StoredCourseState;
  return (
    Boolean(state.briefing) &&
    (state.variant === "A" || state.variant === "B") &&
    typeof state.destination === "string" &&
    (state.mode === "family" || state.mode === "couple") &&
    Array.isArray(state.mood_tags)
  );
}

export function normalizeStoredCourseState(
  value: Omit<StoredCourseState, "trip_id" | "swap_attempt_index"> & {
    trip_id?: string;
    swap_attempt_index?: number;
    saved_at?: string;
  },
): StoredCourseState {
  const swapAttemptIndex = value.swap_attempt_index ?? 0;
  return {
    ...value,
    trip_id: value.trip_id?.trim() || V0_TRIP_ID,
    swap_attempt_index:
      Number.isInteger(swapAttemptIndex) && swapAttemptIndex >= 0
        ? swapAttemptIndex
        : 0,
    saved_at: value.saved_at || new Date().toISOString(),
  };
}

export function parseStoredCourseState(raw: string | null): StoredCourseState | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredCourseStateCore(parsed)) return null;
    return normalizeStoredCourseState(parsed);
  } catch {
    return null;
  }
}

export async function readCourseState(): Promise<StoredCourseState | null> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return null;
  }
  const raw = await readCloudStorageItem(COURSE_STATE_STORAGE_KEY);
  return parseStoredCourseState(raw);
}

export async function writeCourseState(
  state: StoredCourseState,
): Promise<boolean> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return false;
  }
  return writeCloudStorageItem(
    COURSE_STATE_STORAGE_KEY,
    JSON.stringify({
      ...state,
      saved_at: state.saved_at || new Date().toISOString(),
    }),
  );
}
