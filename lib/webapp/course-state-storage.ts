import type { Briefing } from "@/lib/engine/types";
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
  saved_at: string;
};

function isStoredCourseState(value: unknown): value is StoredCourseState {
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

export function parseStoredCourseState(raw: string | null): StoredCourseState | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredCourseState(parsed) ? parsed : null;
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
