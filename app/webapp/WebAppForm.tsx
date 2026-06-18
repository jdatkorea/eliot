"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { applyTelegramTheme } from "@/lib/webapp/apply-telegram-theme";
import {
  buildTripRequest,
  DEFAULT_WEBAPP_FORM,
  FIXED_BASE_CAMP,
  FIXED_OPERATION_TIME_LABEL,
  isWebAppFormValid,
  TRIP_DURATION_OPTIONS,
  type WebAppFormState,
} from "@/lib/webapp/build-trip-request";
import { maintainFeedbackStorage } from "@/lib/webapp/feedback-storage";
import { submitTripRequest } from "@/lib/webapp/submit-trip-request";
import {
  approximateSunsetKst,
  formatIsoDateKst,
  formatKstDateLabel,
  getNativeTelegramWebApp,
  requestTelegramLocation,
  resolveDestinationFromCoords,
  resolveTelegramMessageDate,
} from "@/lib/webapp/telegram-native";
import {
  correctTelegramViewportOnBlur,
  forceTelegramExpand,
} from "@/lib/webapp/telegram-viewport";

type TelegramWebApp = typeof import("@twa-dev/sdk").default;

function applyTelegramInitDate(
  webApp: ReturnType<typeof getNativeTelegramWebApp>,
): Partial<WebAppFormState> | null {
  if (!webApp) return null;

  const messageDate = resolveTelegramMessageDate(webApp);
  if (!messageDate) return null;

  return {
    trip_date: formatIsoDateKst(messageDate),
    sunset_time: approximateSunsetKst(messageDate),
  };
}

function formatDestinationDisplay(destination: string): string {
  return destination === "송도" ? "송도 권역" : destination;
}

export default function WebAppForm() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [form, setForm] = useState<WebAppFormState>(DEFAULT_WEBAPP_FORM);
  const [isTelegram, setIsTelegram] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const constraintsRef = useRef<HTMLTextAreaElement>(null);

  const formValid = isWebAppFormValid(form);

  useEffect(() => {
    let active = true;

    void import("@twa-dev/sdk").then((module) => {
      if (!active) return;

      const WebApp = module.default;
      WebApp.ready();
      WebApp.expand();
      forceTelegramExpand();
      applyTelegramTheme(WebApp.themeParams);

      const nativeApp = getNativeTelegramWebApp();
      const initOverrides = applyTelegramInitDate(nativeApp);
      if (initOverrides) {
        setForm((prev) => ({ ...prev, ...initOverrides }));
      }

      const inTelegram = Boolean(WebApp.initData || nativeApp?.initData);
      setWebApp(WebApp);
      setIsTelegram(inTelegram);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleFieldBlur = useCallback(() => {
    correctTelegramViewportOnBlur();
  }, []);

  const scrollConstraintsIntoView = useCallback(() => {
    forceTelegramExpand();
    webApp?.expand();
    requestAnimationFrame(() => {
      constraintsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [webApp]);

  const handleRequestLocation = useCallback(async () => {
    setLocationStatus("위치 확인 중...");

    const location = await requestTelegramLocation();
    if (!location) {
      setLocationStatus("위치를 가져오지 못했습니다.");
      webApp?.showAlert("위치를 가져오지 못했습니다.");
      return;
    }

    const destination = resolveDestinationFromCoords(location.lat, location.lng);
    setForm((prev) => ({
      ...prev,
      location,
      destination,
    }));
    setLocationStatus(
      destination === "송도"
        ? "송도 권역 확인 — 목적지 자동 설정됨"
        : `목적지: ${formatDestinationDisplay(destination)}`,
    );
  }, [webApp]);

  const handleSubmit = useCallback(async () => {
    if (!formValid || submitted || isSubmitting) return;

    const tripRequest = buildTripRequest(form);

    if (!isTelegram) {
      console.info("[dev] TripRequest:", JSON.stringify(tripRequest, null, 0));
      setSubmitted(true);
      return;
    }

    if (!webApp) return;

    setIsSubmitting(true);
    try {
      await maintainFeedbackStorage();
      await submitTripRequest(webApp, tripRequest);
      setSubmitted(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 에러가 발생했습니다.";
      webApp.showAlert(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, formValid, isSubmitting, isTelegram, submitted, webApp]);

  useEffect(() => {
    if (!webApp || !isTelegram) return;

    webApp.MainButton.show();
    webApp.MainButton.setText(isSubmitting ? "전송 중..." : "여정 생성");

    if (isSubmitting) {
      webApp.MainButton.disable();
    } else if (formValid && !submitted) {
      webApp.MainButton.enable();
    } else {
      webApp.MainButton.disable();
    }

    webApp.onEvent("mainButtonClicked", handleSubmit);

    return () => {
      webApp.offEvent("mainButtonClicked", handleSubmit);
    };
  }, [formValid, handleSubmit, isSubmitting, isTelegram, submitted, webApp]);

  const tripDateLabel = form.trip_date
    ? formatKstDateLabel(new Date(`${form.trip_date}T12:00:00+09:00`))
    : null;

  return (
    <div className="min-h-screen bg-[var(--tg-bg-color)] px-4 pb-28 pt-3 text-[var(--tg-text-color)] text-left">
      <header className="mb-4">
        <h1 className="text-lg font-semibold">여정 브리핑</h1>
        <p className="webapp-subtitle mt-1 text-sm leading-snug">
          고정 조건을 확인하고 오늘 변수만 조정한 뒤 여정을 생성하세요.
        </p>
        {tripDateLabel ? (
          <p className="webapp-hint mt-1 text-xs">여정 날짜: {tripDateLabel}</p>
        ) : null}
      </header>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <Card tone="telegram">
          <h2 className="webapp-section-title mb-2 text-xs font-semibold">
            고정 조건
          </h2>
          <p className="webapp-readonly-line text-sm">
            작전 시간: {FIXED_OPERATION_TIME_LABEL}
          </p>
          <p className="webapp-readonly-line mt-2 text-sm">
            베이스캠프: {FIXED_BASE_CAMP}
          </p>
          <p className="webapp-hint mt-1 text-xs">출발/도착지 고정</p>
        </Card>

        <Card tone="telegram" className="space-y-3">
          <h2 className="webapp-section-title text-xs font-semibold">
            오늘의 변수
          </h2>

          <div>
            <span className="webapp-label text-xs">현재 위치</span>
            <Button
              type="button"
              variant="secondary"
              tone="telegram"
              fullWidth
              className="mt-1"
              onClick={() => {
                void handleRequestLocation();
              }}
            >
              현재 위치 가져오기
            </Button>
            {form.destination ? (
              <p className="webapp-hint mt-1 text-xs">
                목적지: {formatDestinationDisplay(form.destination)}
              </p>
            ) : null}
            {locationStatus ? (
              <p className="webapp-hint mt-1 text-xs">{locationStatus}</p>
            ) : null}
          </div>

          <label className="block">
            <span className="webapp-label text-xs">여행 기간</span>
            <select
              className="webapp-input mt-1 w-full"
              value={form.trip_days}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  trip_days: Number(event.target.value) as WebAppFormState["trip_days"],
                }))
              }
              onBlur={handleFieldBlur}
            >
              {TRIP_DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="webapp-label text-xs">오늘의 날씨</span>
            <input
              type="text"
              className="webapp-input mt-1 w-full"
              value={form.weather}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, weather: event.target.value }))
              }
              onBlur={handleFieldBlur}
            />
          </label>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="webapp-label text-xs">에너지 활성화도</span>
              <span className="webapp-intensity-value text-sm font-semibold">
                {form.mood_intensity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              className="webapp-slider mt-2 w-full"
              value={form.mood_intensity}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  mood_intensity: Number(event.target.value),
                }))
              }
              onMouseUp={handleFieldBlur}
              onTouchEnd={handleFieldBlur}
            />
          </div>

          <label className="block">
            <span className="webapp-label text-xs">일몰 시간</span>
            <input
              type="time"
              className="webapp-input mt-1 w-full"
              value={form.sunset_time}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sunset_time: event.target.value }))
              }
              onBlur={handleFieldBlur}
            />
          </label>

          <label className="block">
            <span className="webapp-label text-xs">제약 조건</span>
            <textarea
              ref={constraintsRef}
              rows={3}
              className="webapp-input webapp-textarea mt-1 w-full resize-none"
              value={form.constraints}
              onFocus={scrollConstraintsIntoView}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, constraints: event.target.value }))
              }
              onBlur={handleFieldBlur}
            />
          </label>
        </Card>

        {!isTelegram ? (
          <Button
            type="submit"
            variant="primary"
            tone="telegram"
            fullWidth
            disabled={!formValid || submitted || isSubmitting}
          >
            {submitted ? "전송됨 (콘솔 확인)" : "여정 생성"}
          </Button>
        ) : null}

        {submitted && !isTelegram ? (
          <p className="webapp-hint text-xs">
            브라우저 개발 모드입니다. Telegram 앱에서는 MainButton으로 전송됩니다.
          </p>
        ) : null}
      </form>
    </div>
  );
}
