import type { PriorTripFeedback } from "@/lib/engine/types";
import {
  CLOUD_STORAGE_LAST_TRIP_KEY,
  parsePriorTripFeedback,
  readCloudStorageItem,
  writeCloudStorageItem,
} from "@/lib/webapp/telegram-native";

export const FEEDBACK_STORAGE_KEY = "eliott_feedback_log";
export const FEEDBACK_ARCHIVE_THRESHOLD = 900;
/** Telegram CloudStorage 키 한도(1024) 대비 안전 여유 */
export const FEEDBACK_STORAGE_LIMIT = 1024;

export type FeedbackLog = {
  entries: PriorTripFeedback[];
};

function isPriorTripFeedback(value: unknown): value is PriorTripFeedback {
  return Boolean(value && typeof value === "object");
}

export function parseFeedbackLog(raw: string | null): FeedbackLog {
  if (!raw?.trim()) return { entries: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { entries: parsed.filter(isPriorTripFeedback) };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as FeedbackLog).entries)
    ) {
      return {
        entries: (parsed as FeedbackLog).entries.filter(isPriorTripFeedback),
      };
    }
    const single = parsePriorTripFeedback(raw);
    return single ? { entries: [single] } : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

async function migrateLegacyFeedback(log: FeedbackLog): Promise<FeedbackLog> {
  if (log.entries.length > 0) return log;

  const legacyRaw = await readCloudStorageItem(CLOUD_STORAGE_LAST_TRIP_KEY);
  const legacy = parsePriorTripFeedback(legacyRaw);
  if (!legacy) return log;

  return { entries: [legacy] };
}

export async function getFeedback(): Promise<FeedbackLog> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return { entries: [] };
  }

  const raw = await readCloudStorageItem(FEEDBACK_STORAGE_KEY);
  const parsed = parseFeedbackLog(raw);
  return migrateLegacyFeedback(parsed);
}

/**
 * INVARIANT 정리(2026-06-18): 과거 lib/engine/trip-context.ts에 있던 함수 —
 * getFeedback() 호출(CloudStorage IO)이 엔진 디렉토리 경계를 위반했다.
 * 호출부(lib/webapp/submit-trip-request.ts)가 이미 엔진 호출 *이전에*
 * await해서 순수 데이터(PriorTripFeedback)로 변환해 넘기고 있었으므로,
 * IO와 엔진 사이의 경계 위반은 이 함수가 엔진 폴더에 있다는 사실 자체였다 —
 * getFeedback()과 같은 파일로 옮겨 경계를 실제로 맞춘다.
 */
export async function resolvePriorFeedback(): Promise<
  PriorTripFeedback | undefined
> {
  const log = await getFeedback();
  if (!log.entries.length) return undefined;

  for (let index = log.entries.length - 1; index >= 0; index -= 1) {
    const entry = log.entries[index];
    if (entry.place_category) return entry;
  }

  return log.entries[log.entries.length - 1];
}

export async function saveFeedback(entry: PriorTripFeedback): Promise<boolean> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return false;
  }

  const log = await getFeedback();
  const stamped: PriorTripFeedback = {
    ...entry,
    saved_at: entry.saved_at ?? new Date().toISOString(),
  };
  const entries = [...log.entries, stamped];

  if (entries.length > FEEDBACK_STORAGE_LIMIT) {
    entries.splice(0, entries.length - FEEDBACK_STORAGE_LIMIT);
  }

  const saved = await writeCloudStorageItem(
    FEEDBACK_STORAGE_KEY,
    JSON.stringify({ entries }),
  );

  const latest = entries[entries.length - 1];
  if (latest) {
    await writeCloudStorageItem(
      CLOUD_STORAGE_LAST_TRIP_KEY,
      JSON.stringify(latest),
    );
  }

  return saved;
}

export async function clearFeedbackStorage(): Promise<boolean> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return false;
  }

  await writeCloudStorageItem(CLOUD_STORAGE_LAST_TRIP_KEY, "");
  return writeCloudStorageItem(
    FEEDBACK_STORAGE_KEY,
    JSON.stringify({ entries: [] }),
  );
}

async function archiveFeedbackToBackend(
  entries: PriorTripFeedback[],
): Promise<void> {
  try {
    await fetch("/api/feedback/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries,
        archived_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn("[feedback-storage] archive request failed", error);
  }
}

export async function maintainFeedbackStorage(): Promise<void> {
  if (typeof window === "undefined" || !window.Telegram?.WebApp) {
    return;
  }

  const log = await getFeedback();
  if (log.entries.length < FEEDBACK_ARCHIVE_THRESHOLD) return;

  console.warn(
    `[feedback-storage] ${log.entries.length} entries reached threshold (${FEEDBACK_ARCHIVE_THRESHOLD}); archiving and resetting`,
  );

  await archiveFeedbackToBackend(log.entries);
  await clearFeedbackStorage();
}
