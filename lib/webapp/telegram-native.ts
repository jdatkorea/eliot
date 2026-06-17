import type { PriorTripFeedback } from "@/lib/engine/types";

export const CLOUD_STORAGE_LAST_TRIP_KEY = "last_trip_feedback";

export const SONGDO_DESTINATION = "송도";
export const DEFAULT_HOME_REGION = "인천_근교";

export const SONGDO_BOUNDS = {
  minLat: 37.365,
  maxLat: 37.42,
  minLng: 126.61,
  maxLng: 126.705,
} as const;

export type TripLocation = {
  lat: number;
  lng: number;
};

export type TelegramWebAppLocation = {
  latitude: number;
  longitude: number;
};

export type TelegramCloudStorage = {
  getItem: (
    key: string,
    callback: (error: string | null, value: string | null) => void,
  ) => void;
  setItem: (
    key: string,
    value: string,
    callback?: (error: string | null, success: boolean) => void,
  ) => void;
};

export type TelegramLocationManager = {
  init: (callback?: () => void) => void;
  getLocation: (
    callback: (location: TelegramWebAppLocation | null) => void,
  ) => void;
  isInited?: boolean;
};

export type NativeTelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    auth_date?: number;
    message?: { date?: number };
    user?: { id?: number };
  };
  CloudStorage?: TelegramCloudStorage;
  LocationManager?: TelegramLocationManager;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: NativeTelegramWebApp;
    };
  }
}

export function getNativeTelegramWebApp(): NativeTelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

export function isWithinSongdoBounds(lat: number, lng: number): boolean {
  return (
    lat >= SONGDO_BOUNDS.minLat &&
    lat <= SONGDO_BOUNDS.maxLat &&
    lng >= SONGDO_BOUNDS.minLng &&
    lng <= SONGDO_BOUNDS.maxLng
  );
}

export function resolveDestinationFromCoords(lat: number, lng: number): string {
  return isWithinSongdoBounds(lat, lng)
    ? SONGDO_DESTINATION
    : DEFAULT_HOME_REGION;
}

export function resolveTelegramMessageDate(
  webApp: NativeTelegramWebApp,
): Date | null {
  const messageDate = webApp.initDataUnsafe?.message?.date;
  if (typeof messageDate === "number" && Number.isFinite(messageDate)) {
    return new Date(messageDate * 1000);
  }

  const authDate = webApp.initDataUnsafe?.auth_date;
  if (typeof authDate === "number" && Number.isFinite(authDate)) {
    return new Date(authDate * 1000);
  }

  return null;
}

export function formatIsoDateKst(date: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(date);
}

export function formatKstDateLabelFromIso(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(date);
  return `${year}년 ${month}월 ${day}일(${weekday})`;
}

export function formatKstDateLabel(date: Date): string {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = f.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}년 ${get("month")}월 ${get("day")}일(${get("weekday")})`;
}

const SUNSET_BY_MONTH_KST: Record<number, string> = {
  1: "17:45",
  2: "18:10",
  3: "18:40",
  4: "19:10",
  5: "19:35",
  6: "19:56",
  7: "20:00",
  8: "19:35",
  9: "19:00",
  10: "18:30",
  11: "17:55",
  12: "17:40",
};

export function approximateSunsetKst(date: Date): string {
  const month = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "numeric",
    }).format(date),
  );
  return SUNSET_BY_MONTH_KST[month] ?? "19:30";
}

export function readCloudStorageItem(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) {
      resolve(null);
      return;
    }

    const storage = window.Telegram.WebApp.CloudStorage;
    if (!storage) {
      resolve(null);
      return;
    }

    storage.getItem(key, (error, value) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(value ?? null);
    });
  });
}

export function writeCloudStorageItem(
  key: string,
  value: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) {
      resolve(false);
      return;
    }

    const storage = window.Telegram.WebApp.CloudStorage;
    if (!storage) {
      resolve(false);
      return;
    }

    storage.setItem(key, value, (error, success) => {
      resolve(!error && success);
    });
  });
}

export function parsePriorTripFeedback(
  raw: string | null,
): PriorTripFeedback | undefined {
  if (!raw?.trim()) return undefined;

  try {
    const parsed = JSON.parse(raw) as PriorTripFeedback;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function loadLastTripFeedback(): Promise<
  PriorTripFeedback | undefined
> {
  const { getFeedback } = await import("@/lib/webapp/feedback-storage");
  const log = await getFeedback();
  if (!log.entries.length) return undefined;
  return log.entries[log.entries.length - 1];
}

export async function saveLastTripFeedback(
  payload: PriorTripFeedback,
): Promise<boolean> {
  const { saveFeedback } = await import("@/lib/webapp/feedback-storage");
  return saveFeedback(payload);
}

export function requestTelegramLocation(): Promise<TripLocation | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.Telegram?.WebApp) {
      resolve(null);
      return;
    }

    const manager = window.Telegram.WebApp.LocationManager;
    if (!manager) {
      resolve(null);
      return;
    }

    const resolveLocation = () => {
      manager.getLocation((location) => {
        if (!location) {
          resolve(null);
          return;
        }
        resolve({
          lat: location.latitude,
          lng: location.longitude,
        });
      });
    };

    if (manager.isInited) {
      resolveLocation();
      return;
    }

    manager.init(() => {
      resolveLocation();
    });
  });
}
