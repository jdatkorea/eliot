"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTelegramTheme } from "@/lib/webapp/apply-telegram-theme";
import {
  buildTripRequest,
  DEFAULT_WEBAPP_FORM,
  FIXED_BASE_CAMP,
  FIXED_OPERATION_TIME_LABEL,
  isWebAppFormValid,
  type WebAppFormState,
} from "@/lib/webapp/build-trip-request";
import { submitTripRequest } from "@/lib/webapp/submit-trip-request";

type TelegramWebApp = typeof import("@twa-dev/sdk").default;

export default function WebAppForm() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [form, setForm] = useState<WebAppFormState>(DEFAULT_WEBAPP_FORM);
  const [isTelegram, setIsTelegram] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const constraintsRef = useRef<HTMLTextAreaElement>(null);

  const formValid = isWebAppFormValid(form);

  useEffect(() => {
    let active = true;

    void import("@twa-dev/sdk").then((module) => {
      if (!active) return;

      const WebApp = module.default;
      WebApp.ready();
      WebApp.expand();
      applyTelegramTheme(WebApp.themeParams);

      const inTelegram = Boolean(WebApp.initData);
      setWebApp(WebApp);
      setIsTelegram(inTelegram);
    });

    return () => {
      active = false;
    };
  }, []);

  const scrollConstraintsIntoView = useCallback(() => {
    webApp?.expand();
    requestAnimationFrame(() => {
      constraintsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [webApp]);

  const handleSubmit = useCallback(async () => {
    if (!formValid || submitted || isSubmitting) return;

    const tripRequest = buildTripRequest(form);

    if (!isTelegram) {
      console.info("[dev] TripRequest:", JSON.stringify(tripRequest));
      setSubmitted(true);
      return;
    }

    if (!webApp) return;

    setIsSubmitting(true);
    try {
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

  return (
    <div className="webapp-root min-h-screen px-4 pb-28 pt-4">
      <header className="mb-5 space-y-1">
        <h1 className="webapp-title text-xl font-semibold">여정 브리핑</h1>
        <p className="webapp-subtitle text-sm">
          오늘 조건을 확인하고 여정을 생성하면 A/B 두 가지 코스를 보내드려요.
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <section className="webapp-card space-y-3">
          <h2 className="webapp-section-title text-xs font-semibold uppercase tracking-wide">
            고정 조건
          </h2>
          <dl className="space-y-3">
            <div className="webapp-readonly-row">
              <dt className="webapp-label text-xs">작전 시간</dt>
              <dd className="webapp-readonly-value text-sm font-medium">
                {FIXED_OPERATION_TIME_LABEL}
              </dd>
            </div>
            <div className="webapp-readonly-row">
              <dt className="webapp-label text-xs">베이스캠프</dt>
              <dd className="webapp-readonly-value text-sm font-medium">
                {FIXED_BASE_CAMP}
                <span className="webapp-hint mt-1 block text-xs font-normal">
                  출발/도착지 고정
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="webapp-card space-y-4">
          <h2 className="webapp-section-title text-xs font-semibold uppercase tracking-wide">
            오늘의 변수
          </h2>

          <label className="block space-y-1.5">
            <span className="webapp-label text-xs">오늘의 날씨</span>
            <input
              type="text"
              className="webapp-input w-full"
              value={form.weather}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, weather: event.target.value }))
              }
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
              className="webapp-slider w-full"
              value={form.mood_intensity}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  mood_intensity: Number(event.target.value),
                }))
              }
            />
          </div>

          <label className="block space-y-1.5">
            <span className="webapp-label text-xs">일몰 시간</span>
            <input
              type="time"
              className="webapp-input w-full"
              value={form.sunset_time}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sunset_time: event.target.value }))
              }
            />
          </label>

          <label className="block space-y-1.5">
            <span className="webapp-label text-xs">제약 조건</span>
            <textarea
              ref={constraintsRef}
              rows={4}
              className="webapp-input webapp-textarea w-full resize-none"
              value={form.constraints}
              onFocus={scrollConstraintsIntoView}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, constraints: event.target.value }))
              }
            />
          </label>
        </section>

        {!isTelegram ? (
          <button
            type="submit"
            className="webapp-submit w-full"
            disabled={!formValid || submitted || isSubmitting}
          >
            {submitted ? "전송됨 (콘솔 확인)" : "여정 생성"}
          </button>
        ) : null}

        {submitted && !isTelegram ? (
          <p className="webapp-hint text-center text-xs">
            브라우저 개발 모드입니다. Telegram 앱에서는 MainButton으로 전송됩니다.
          </p>
        ) : null}
      </form>

      <style jsx global>{`
        :root {
          --tg-bg-color: #ffffff;
          --tg-text-color: #1a1a1a;
          --tg-hint-color: #8e8e93;
          --tg-link-color: #2481cc;
          --tg-button-color: #2481cc;
          --tg-button-text-color: #ffffff;
          --tg-secondary-bg-color: #f2f2f7;
          --tg-section-bg-color: #ffffff;
          --tg-section-header-text-color: #6d6d72;
          --tg-subtitle-text-color: #8e8e93;
        }

        .webapp-root {
          background: var(--tg-bg-color);
          color: var(--tg-text-color);
        }

        .webapp-subtitle,
        .webapp-label,
        .webapp-hint {
          color: var(--tg-hint-color);
        }

        .webapp-section-title {
          color: var(--tg-section-header-text-color);
        }

        .webapp-card {
          background: var(--tg-section-bg-color);
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .webapp-readonly-row {
          border-radius: 10px;
          background: var(--tg-secondary-bg-color);
          padding: 12px;
        }

        .webapp-readonly-value {
          color: var(--tg-text-color);
          margin-top: 4px;
        }

        .webapp-input {
          background: var(--tg-secondary-bg-color);
          color: var(--tg-text-color);
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 15px;
        }

        .webapp-textarea {
          line-height: 1.45;
          min-height: 96px;
        }

        .webapp-input:focus {
          outline: 2px solid var(--tg-link-color);
          outline-offset: 0;
        }

        .webapp-intensity-value {
          color: var(--tg-text-color);
        }

        .webapp-slider {
          accent-color: var(--tg-button-color);
          height: 4px;
        }

        .webapp-submit {
          border-radius: 12px;
          padding: 14px;
          font-size: 16px;
          font-weight: 600;
          background: var(--tg-button-color);
          color: var(--tg-button-text-color);
        }

        .webapp-submit:disabled {
          opacity: 0.45;
        }
      `}</style>
    </div>
  );
}
