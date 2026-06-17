import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  feedbackEventsFromFeedbackLog,
  resolvePriorFeedback,
} from "@/lib/engine/trip-context";
import type { PriorTripFeedback } from "@/lib/engine/types";
import {
  clearFeedbackStorage,
  FEEDBACK_ARCHIVE_THRESHOLD,
  FEEDBACK_STORAGE_KEY,
  getFeedback,
  maintainFeedbackStorage,
  parseFeedbackLog,
  saveFeedback,
} from "@/lib/webapp/feedback-storage";
import { CLOUD_STORAGE_LAST_TRIP_KEY } from "@/lib/webapp/telegram-native";

type CloudStorageMock = {
  store: Map<string, string>;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

function createCloudStorageMock(
  initial: Record<string, string> = {},
): CloudStorageMock {
  const store = new Map(Object.entries(initial));

  return {
    store,
    getItem: vi.fn((key: string, callback: (error: null, value: string) => void) => {
      callback(null, store.get(key) ?? "");
    }),
    setItem: vi.fn(
      (
        key: string,
        value: string,
        callback?: (error: null, success: boolean) => void,
      ) => {
        store.set(key, value);
        callback?.(null, true);
      },
    ),
  };
}

function installTelegramWebAppMock(cloudStorage: CloudStorageMock) {
  Object.defineProperty(globalThis, "window", {
    value: {
      Telegram: {
        WebApp: {
          initData: "signed-init-data",
          CloudStorage: cloudStorage,
        },
      },
    },
    writable: true,
    configurable: true,
  });
}

function makeEntry(index: number): PriorTripFeedback {
  return {
    mood_intensity: index % 100,
    place_category: index % 2 === 0 ? "meal" : "cafe",
    saved_at: `2024-06-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
  };
}

describe("feedback-storage — parseFeedbackLog", () => {
  it("빈 문자열은 빈 로그", () => {
    expect(parseFeedbackLog(null)).toEqual({ entries: [] });
    expect(parseFeedbackLog("")).toEqual({ entries: [] });
  });

  it("entries 래퍼 JSON 파싱", () => {
    const entry: PriorTripFeedback = { mood_intensity: 42 };
    expect(parseFeedbackLog(JSON.stringify({ entries: [entry] }))).toEqual({
      entries: [entry],
    });
  });
});

describe("feedback-storage — getFeedback / saveFeedback", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("saveFeedback가 로그에 항목을 추가하고 legacy 키를 동기화", async () => {
    const cloudStorage = createCloudStorageMock();
    installTelegramWebAppMock(cloudStorage);

    const saved = await saveFeedback({ mood_intensity: 55, weather: "맑음" });

    expect(saved).toBe(true);
    const log = await getFeedback();
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].mood_intensity).toBe(55);
    expect(cloudStorage.store.get(CLOUD_STORAGE_LAST_TRIP_KEY)).toContain(
      '"mood_intensity":55',
    );
  });

  it("legacy last_trip_feedback 키에서 마이그레이션", async () => {
    const legacy: PriorTripFeedback = {
      mood_intensity: 70,
      place_category: "view",
      saved_at: "2024-06-10T08:00:00.000Z",
    };

    const cloudStorage = createCloudStorageMock({
      [CLOUD_STORAGE_LAST_TRIP_KEY]: JSON.stringify(legacy),
    });
    installTelegramWebAppMock(cloudStorage);

    const log = await getFeedback();
    expect(log.entries).toEqual([legacy]);
  });
});

describe("feedback-storage — maintainFeedbackStorage", () => {
  const originalFetch = globalThis.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, archived: FEEDBACK_ARCHIVE_THRESHOLD }),
      }),
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.stubGlobal("fetch", originalFetch);
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("900개 미만이면 아카이빙하지 않음", async () => {
    const entries = Array.from({ length: 899 }, (_, index) => makeEntry(index));
    const cloudStorage = createCloudStorageMock({
      [FEEDBACK_STORAGE_KEY]: JSON.stringify({ entries }),
    });
    installTelegramWebAppMock(cloudStorage);

    await maintainFeedbackStorage();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((await getFeedback()).entries).toHaveLength(899);
  });

  it("900개 도달 시 console.warn 후 아카이빙·초기화", async () => {
    const entries = Array.from({ length: 900 }, (_, index) => makeEntry(index));
    const cloudStorage = createCloudStorageMock({
      [FEEDBACK_STORAGE_KEY]: JSON.stringify({ entries }),
    });
    installTelegramWebAppMock(cloudStorage);

    await maintainFeedbackStorage();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("900 entries reached threshold"),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/feedback/archive",
      expect.objectContaining({ method: "POST" }),
    );

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      entries: PriorTripFeedback[];
    };
    expect(body.entries).toHaveLength(900);

    expect((await getFeedback()).entries).toHaveLength(0);
    expect(cloudStorage.store.get(FEEDBACK_STORAGE_KEY)).toBe(
      JSON.stringify({ entries: [] }),
    );
  });
});

describe("trip-context — resolvePriorFeedback", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("place_category가 있는 최신 항목을 우선 반환", async () => {
    const entries: PriorTripFeedback[] = [
      { mood_intensity: 10, saved_at: "2024-06-01T00:00:00.000Z" },
      {
        mood_intensity: 20,
        place_category: "cafe",
        saved_at: "2024-06-02T00:00:00.000Z",
      },
      {
        mood_intensity: 30,
        saved_at: "2024-06-03T00:00:00.000Z",
      },
    ];

    const cloudStorage = createCloudStorageMock({
      [FEEDBACK_STORAGE_KEY]: JSON.stringify({ entries }),
    });
    installTelegramWebAppMock(cloudStorage);

    const prior = await resolvePriorFeedback();
    expect(prior?.place_category).toBe("cafe");
    expect(prior?.mood_intensity).toBe(20);
  });

  it("feedbackEventsFromFeedbackLog가 가중치 루틴용 이벤트 배열 생성", () => {
    const events = feedbackEventsFromFeedbackLog(
      [
        { place_category: "meal", satisfaction: 2, failure_reason: "food" },
        { place_category: "cafe", satisfaction: 4 },
      ],
      "2024-06-17T12:00:00.000Z",
    );

    expect(events).toHaveLength(2);
    expect(events[0].context_tags.place_category).toBe("meal");
    expect(events[1].id).toBe("cloud-prior-feedback-1");
  });
});

describe("feedback-storage — clearFeedbackStorage", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("로그와 legacy 키를 비움", async () => {
    const cloudStorage = createCloudStorageMock({
      [FEEDBACK_STORAGE_KEY]: JSON.stringify({
        entries: [{ mood_intensity: 1 }],
      }),
      [CLOUD_STORAGE_LAST_TRIP_KEY]: JSON.stringify({ mood_intensity: 1 }),
    });
    installTelegramWebAppMock(cloudStorage);

    await clearFeedbackStorage();

    expect(cloudStorage.store.get(FEEDBACK_STORAGE_KEY)).toBe(
      JSON.stringify({ entries: [] }),
    );
    expect(cloudStorage.store.get(CLOUD_STORAGE_LAST_TRIP_KEY)).toBe("");
  });
});
