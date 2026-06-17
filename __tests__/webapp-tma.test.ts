import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGenerateBriefingOptions,
  feedbackEventsFromPriorTrip,
  mergePriorFeedbackIntoContext,
  resolveHomeRegionFromTripRequest,
} from "@/lib/engine/trip-context";
import type { PriorTripFeedback } from "@/lib/engine/types";
import {
  buildTripRequest,
  DEFAULT_WEBAPP_FORM,
} from "@/lib/webapp/build-trip-request";
import { submitTripRequest } from "@/lib/webapp/submit-trip-request";
import {
  approximateSunsetKst,
  CLOUD_STORAGE_LAST_TRIP_KEY,
  formatIsoDateKst,
  formatKstDateLabelFromIso,
  isWithinSongdoBounds,
  loadLastTripFeedback,
  parsePriorTripFeedback,
  resolveDestinationFromCoords,
  resolveTelegramMessageDate,
  saveLastTripFeedback,
} from "@/lib/webapp/telegram-native";

const SONGDO_CENTER = { lat: 37.382, lng: 126.657 };
const OUTSIDE_SONGDO = { lat: 37.55, lng: 126.98 };

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

function installTelegramWebAppMock(options?: {
  cloudStorage?: CloudStorageMock;
  messageDate?: number;
  location?: { latitude: number; longitude: number } | null;
}) {
  const cloudStorage = options?.cloudStorage ?? createCloudStorageMock();
  const locationResult = options?.location ?? SONGDO_CENTER;

  const locationManager = {
    isInited: false,
    init: vi.fn((callback?: () => void) => {
      locationManager.isInited = true;
      callback?.();
    }),
    getLocation: vi.fn(
      (callback: (location: { latitude: number; longitude: number } | null) => void) => {
        callback(
          locationResult
            ? {
                latitude: locationResult.latitude,
                longitude: locationResult.longitude,
              }
            : null,
        );
      },
    ),
  };

  const webApp = {
    initData: "signed-init-data",
    initDataUnsafe: {
      auth_date: 1718600000,
      message: { date: options?.messageDate ?? 1718600000 },
      user: { id: 12345 },
    },
    CloudStorage: cloudStorage,
    LocationManager: locationManager,
    close: vi.fn(),
    showAlert: vi.fn(),
  };

  Object.defineProperty(globalThis, "window", {
    value: { Telegram: { WebApp: webApp } },
    writable: true,
    configurable: true,
  });

  return { webApp, cloudStorage, locationManager };
}

describe("telegram-native — Songdo boundary", () => {
  it("송도 중심 좌표는 송도 권역으로 판정", () => {
    expect(isWithinSongdoBounds(SONGDO_CENTER.lat, SONGDO_CENTER.lng)).toBe(
      true,
    );
    expect(resolveDestinationFromCoords(SONGDO_CENTER.lat, SONGDO_CENTER.lng)).toBe(
      "송도",
    );
  });

  it("송도 밖 좌표는 기본 홈 리전으로 판정", () => {
    expect(
      isWithinSongdoBounds(OUTSIDE_SONGDO.lat, OUTSIDE_SONGDO.lng),
    ).toBe(false);
    expect(
      resolveDestinationFromCoords(OUTSIDE_SONGDO.lat, OUTSIDE_SONGDO.lng),
    ).toBe("인천_근교");
  });
});

describe("telegram-native — initData message.date", () => {
  it("message.date로 KST 날짜·일몰 시간 파생", () => {
  const date = resolveTelegramMessageDate({
      initDataUnsafe: { message: { date: 1718600000 } },
    });

    expect(date).not.toBeNull();
    expect(formatIsoDateKst(date!)).toBe("2024-06-17");
    expect(approximateSunsetKst(date!)).toBe("19:56");
  });

  it("message.date 없으면 auth_date fallback", () => {
    const date = resolveTelegramMessageDate({
      initDataUnsafe: { auth_date: 1704067200 },
    });

    expect(date).not.toBeNull();
    expect(formatIsoDateKst(date!)).toBe("2024-01-01");
  });
});

describe("buildTripRequest — location 페이로드", () => {
  it("GPS 좌표·destination을 TripRequest에 삽입", () => {
    const payload = buildTripRequest({
      ...DEFAULT_WEBAPP_FORM,
      trip_date: "2024-06-17",
      location: SONGDO_CENTER,
      destination: "송도",
    });

    expect(payload.location).toEqual(SONGDO_CENTER);
    expect(payload.destination).toBe("송도");
    expect(payload.trip_date).toBe("2024-06-17");
  });
});

describe("trip-context — CloudStorage 피드백 결합", () => {
  const prior: PriorTripFeedback = {
    mood_intensity: 40,
    weather: "흐림",
    place_category: "meal",
    failure_reason: "food",
    satisfaction: 2,
    saved_at: "2024-06-16T10:00:00.000Z",
  };

  it("prior 피드백을 BriefingContextMeta에 결합", () => {
    const base = buildGenerateBriefingOptions(
      buildTripRequest(DEFAULT_WEBAPP_FORM),
      "2024년 6월 17일(수)",
    );

    const merged = mergePriorFeedbackIntoContext(base.trip_context!, prior);

    expect(merged.prior_trip_feedback).toEqual(prior);
    expect(merged.energy_level).toBe(40);
    expect(merged.weather_text).toBe("흐림");
  });

  it("prior 피드백을 feedback_events로 변환", () => {
    const events = feedbackEventsFromPriorTrip(prior);

    expect(events).toHaveLength(1);
    expect(events[0].context_tags.place_category).toBe("meal");
    expect(events[0].failure_reason).toBe("food");
  });

  it("location 기반 homeRegion 해석", () => {
    const region = resolveHomeRegionFromTripRequest(
      buildTripRequest({
        ...DEFAULT_WEBAPP_FORM,
        location: SONGDO_CENTER,
      }),
    );

    expect(region).toBe("송도");
  });

  it("trip_date로 date_label 포맷", () => {
    const options = buildGenerateBriefingOptions(
      buildTripRequest({
        ...DEFAULT_WEBAPP_FORM,
        trip_date: "2024-06-17",
      }),
      formatKstDateLabelFromIso("2024-06-17"),
    );

    expect(options.date_label).toBe("2024년 6월 17일(월)");
    expect(options.destination).toBe("인천_근교");
  });
});

describe("submitTripRequest — CloudStorage 루프", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      }),
    );
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("제출 전 CloudStorage 피드백을 불러 API에 결합", async () => {
    const priorPayload: PriorTripFeedback = {
      mood_intensity: 35,
      place_category: "cafe",
      saved_at: "2024-06-15T09:00:00.000Z",
    };

    const cloudStorage = createCloudStorageMock({
      [CLOUD_STORAGE_LAST_TRIP_KEY]: JSON.stringify(priorPayload),
    });
    const { webApp } = installTelegramWebAppMock({ cloudStorage });

    const tripRequest = buildTripRequest(DEFAULT_WEBAPP_FORM);
    await submitTripRequest(webApp, tripRequest);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      data: { prior_trip_feedback?: PriorTripFeedback };
    };
    expect(body.data.prior_trip_feedback?.place_category).toBe("cafe");
    expect(cloudStorage.setItem).toHaveBeenCalled();
    expect(webApp.close).toHaveBeenCalled();
  });

  it("window.Telegram 없으면 CloudStorage 스킵", async () => {
    Reflect.deleteProperty(globalThis, "window");

    const webApp = {
      initData: "signed",
      initDataUnsafe: { user: { id: 1 } },
      close: vi.fn(),
      showAlert: vi.fn(),
    };

    const tripRequest = buildTripRequest(DEFAULT_WEBAPP_FORM);
    await submitTripRequest(webApp, tripRequest);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      data: { prior_trip_feedback?: PriorTripFeedback };
    };
    expect(body.data.prior_trip_feedback).toBeUndefined();
  });
});

describe("CloudStorage 파싱", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("loadLastTripFeedback는 TMA 가드 안에서만 동작", async () => {
    const prior: PriorTripFeedback = {
      mood_intensity: 60,
      saved_at: "2024-06-16T08:00:00.000Z",
    };

    const cloudStorage = createCloudStorageMock({
      [CLOUD_STORAGE_LAST_TRIP_KEY]: JSON.stringify(prior),
    });
    installTelegramWebAppMock({ cloudStorage });

    const loaded = await loadLastTripFeedback();
    expect(loaded?.mood_intensity).toBe(60);
    expect(parsePriorTripFeedback(JSON.stringify(prior))).toEqual(prior);
  });

  it("saveLastTripFeedback는 JSON payload 저장", async () => {
    const cloudStorage = createCloudStorageMock();
    installTelegramWebAppMock({ cloudStorage });

    const saved = await saveLastTripFeedback({
      mood_intensity: 80,
      saved_at: "2024-06-17T12:00:00.000Z",
    });

    expect(saved).toBe(true);
    expect(cloudStorage.store.get(CLOUD_STORAGE_LAST_TRIP_KEY)).toContain(
      '"mood_intensity":80',
    );
  });
});
