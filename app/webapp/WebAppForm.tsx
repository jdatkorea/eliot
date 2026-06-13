"use client";

import { useCallback, useEffect, useState } from "react";
import { MOOD_TAGS } from "@/lib/config/mood-tags.config";
import { HOME_ADDRESS } from "@/lib/engine/normalize";
import { applyTelegramTheme } from "@/lib/webapp/apply-telegram-theme";
import {
  buildTripRequest,
  isWebAppFormValid,
  type WebAppFormState,
} from "@/lib/webapp/build-trip-request";
import { MOOD_TAG_LABELS } from "@/lib/webapp/mood-tag-labels";
import { submitTripRequest } from "@/lib/webapp/submit-trip-request";

type TelegramWebApp = typeof import("@twa-dev/sdk").default;

const MOOD_INTENSITY_PRESETS = [
  { label: "매우 피곤함", value: 10 },
  { label: "보통", value: 50 },
  { label: "활기참", value: 90 },
] as const;

const DEFAULT_FORM: WebAppFormState = {
  start_mode: "duration",
  departure_time: "09:00",
  return_time: "14:00",
  duration_hours: 5,
  origin: HOME_ADDRESS,
  return_location: HOME_ADDRESS,
  mood_tags: [],
  mood_intensity: 50,
  mode: "family",
};

function toggleMoodTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

export default function WebAppForm() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [form, setForm] = useState<WebAppFormState>(DEFAULT_FORM);
  const [isTelegram, setIsTelegram] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = useCallback(async () => {
    console.log("Submit 시작: 버튼 클릭됨");
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
    webApp.MainButton.setText(isSubmitting ? "전송 중..." : "브리핑 생성");

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
      <header className="mb-6 space-y-1">
        <h1 className="webapp-title text-xl font-semibold">여정 브리핑</h1>
        <p className="webapp-subtitle text-sm">
          오늘 일정에 맞게 입력하면 A/B 두 가지 코스를 보내드려요.
        </p>
      </header>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <section className="webapp-section space-y-3">
          <h2 className="webapp-section-title text-sm font-semibold">시작 모드</h2>
          <div className="flex gap-2">
            <ModeToggle
              active={form.start_mode === "fixed"}
              label="고정 시각"
              onClick={() => setForm((prev) => ({ ...prev, start_mode: "fixed" }))}
            />
            <ModeToggle
              active={form.start_mode === "duration"}
              label="가용 시간"
              onClick={() =>
                setForm((prev) => ({ ...prev, start_mode: "duration" }))
              }
            />
          </div>
        </section>

        {form.start_mode === "fixed" ? (
          <section className="webapp-section space-y-3">
            <h2 className="webapp-section-title text-sm font-semibold">출발 · 도착</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="webapp-label text-xs">출발 시각</span>
                <input
                  type="time"
                  className="webapp-input w-full"
                  value={form.departure_time}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      departure_time: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="webapp-label text-xs">도착 시각</span>
                <input
                  type="time"
                  className="webapp-input w-full"
                  value={form.return_time}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      return_time: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </section>
        ) : (
          <section className="webapp-section space-y-3">
            <h2 className="webapp-section-title text-sm font-semibold">총 가용 시간</h2>
            <label className="space-y-1">
              <span className="webapp-label text-xs">시간 (시간 단위)</span>
              <input
                type="number"
                min={1}
                max={24}
                step={0.5}
                className="webapp-input w-full"
                value={form.duration_hours}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    duration_hours: Number(event.target.value),
                  }))
                }
              />
            </label>
          </section>
        )}

        <section className="webapp-section space-y-3">
          <h2 className="webapp-section-title text-sm font-semibold">장소</h2>
          <label className="block space-y-1">
            <span className="webapp-label text-xs">출발 장소</span>
            <input
              type="text"
              className="webapp-input w-full"
              placeholder={HOME_ADDRESS}
              value={form.origin}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, origin: event.target.value }))
              }
            />
          </label>
          <label className="block space-y-1">
            <span className="webapp-label text-xs">복귀 장소</span>
            <input
              type="text"
              className="webapp-input w-full"
              placeholder={HOME_ADDRESS}
              value={form.return_location}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  return_location: event.target.value,
                }))
              }
            />
          </label>
        </section>

        <section className="webapp-section space-y-3">
          <h2 className="webapp-section-title text-sm font-semibold">기분 · 취향</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="webapp-label text-xs">기분 강도</span>
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
            <div className="flex flex-wrap gap-2">
              {MOOD_INTENSITY_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`webapp-chip ${
                    form.mood_intensity === preset.value ? "webapp-chip-active" : ""
                  }`}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      mood_intensity: preset.value,
                    }))
                  }
                >
                  {preset.label} ({preset.value}%)
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOOD_TAGS.map((tag) => {
              const selected = form.mood_tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`webapp-chip ${selected ? "webapp-chip-active" : ""}`}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      mood_tags: toggleMoodTag(prev.mood_tags, tag),
                    }))
                  }
                >
                  {MOOD_TAG_LABELS[tag]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="webapp-section space-y-3">
          <h2 className="webapp-section-title text-sm font-semibold">동행 모드</h2>
          <div className="flex gap-2">
            <ModeToggle
              active={form.mode === "family"}
              label="패밀리"
              onClick={() => setForm((prev) => ({ ...prev, mode: "family" }))}
            />
            <ModeToggle
              active={form.mode === "couple"}
              label="연인"
              onClick={() => setForm((prev) => ({ ...prev, mode: "couple" }))}
            />
          </div>
        </section>

        {!isTelegram ? (
          <button
            type="submit"
            className="webapp-submit w-full"
            disabled={!formValid || submitted}
          >
            {submitted ? "전송됨 (콘솔 확인)" : "브리핑 생성"}
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

        .webapp-section {
          background: var(--tg-section-bg-color);
          border-radius: 12px;
          padding: 14px;
        }

        .webapp-input {
          background: var(--tg-secondary-bg-color);
          color: var(--tg-text-color);
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 15px;
        }

        .webapp-input:focus {
          outline: 2px solid var(--tg-link-color);
          outline-offset: 0;
        }

        .webapp-chip {
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          background: var(--tg-secondary-bg-color);
          color: var(--tg-text-color);
          border: 1px solid transparent;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .webapp-chip-active {
          background: var(--tg-button-color);
          color: var(--tg-button-text-color);
        }

        .webapp-intensity-value {
          color: var(--tg-text-color);
        }

        .webapp-slider {
          accent-color: var(--tg-button-color);
          height: 4px;
        }

        .webapp-mode-toggle {
          flex: 1;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 600;
          background: var(--tg-secondary-bg-color);
          color: var(--tg-text-color);
          border: 1px solid transparent;
        }

        .webapp-mode-toggle-active {
          background: var(--tg-button-color);
          color: var(--tg-button-text-color);
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

function ModeToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`webapp-mode-toggle ${active ? "webapp-mode-toggle-active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
