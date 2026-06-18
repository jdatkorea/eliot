"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { FailureReason } from "@/lib/engine/types";
import {
  DEFAULT_SUBJECT_ID,
  parseFeedbackLinkParams,
  toContextTags,
  V0_TRIP_ID,
} from "@/lib/feedback/context";
import {
  FAILURE_REASON_LABELS,
  FAILURE_REASONS,
  hasValidationErrors,
  validateFeedbackForm,
} from "@/lib/feedback/validate";

type Sentiment = "good" | "bad" | null;

const NEGATIVE_FAILURE_REASONS = FAILURE_REASONS.filter(
  (reason) => reason !== "none",
);

function closeTelegramWebApp(): void {
  if (typeof window === "undefined") return;

  try {
    const webApp = (
      window as Window & { Telegram?: { WebApp?: { close?: () => void } } }
    ).Telegram?.WebApp;

    if (webApp && typeof webApp.close === "function") {
      webApp.close();
    }
  } catch {
    // Telegram 미니앱이 아닌 환경에서는 무시
  }
}

function FeedbackForm() {
  const searchParams = useSearchParams();
  const linkParams = parseFeedbackLinkParams(searchParams);
  const subjectId = linkParams.subject_id ?? DEFAULT_SUBJECT_ID;
  const tripId = linkParams.trip_id ?? V0_TRIP_ID;

  const [sentiment, setSentiment] = useState<Sentiment>(null);
  const [failureReason, setFailureReason] = useState<FailureReason | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [routeVariant] = useState<"A" | "B" | null>(
    linkParams.route_variant ?? null,
  );
  const [fieldErrors, setFieldErrors] = useState<{
    failure_reason?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);

  const submitFeedback = useCallback(
    async (payload: {
      satisfaction: number;
      failure_reason: FailureReason;
      note: string | null;
    }) => {
      setSubmitError(null);
      setSubmitting(true);

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            satisfaction: payload.satisfaction,
            failure_reason: payload.failure_reason,
            note: payload.note,
            subject_id: subjectId,
            trip_id: tripId,
            context_tags: toContextTags({
              mood_tags: linkParams.mood_tags ?? [],
              mood_intensity: linkParams.mood_intensity,
              mode: linkParams.mode,
              return_location: linkParams.return_location,
              route_variant: routeVariant ?? undefined,
            }),
          }),
        });

        const result = (await response.json()) as {
          ok: boolean;
          error?: string;
        };

        if (!response.ok || !result.ok) {
          throw new Error(result.error ?? "피드백 저장에 실패했습니다.");
        }

        setShowSuccessFlash(true);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "피드백 저장 중 오류가 발생했습니다.";
        setSubmitError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [linkParams, routeVariant, subjectId, tripId],
  );

  useEffect(() => {
    if (!showSuccessFlash) return;

    const timer = window.setTimeout(closeTelegramWebApp, 500);
    return () => window.clearTimeout(timer);
  }, [showSuccessFlash]);

  async function handleGoodTap() {
    if (submitting) return;

    setSentiment("good");
    setFailureReason(null);
    setNote("");
    setFieldErrors({});

    await submitFeedback({
      satisfaction: 5,
      failure_reason: "none",
      note: null,
    });
  }

  function handleBadTap() {
    if (submitting) return;

    setSentiment("bad");
    setFailureReason(null);
    setFieldErrors({});
    setSubmitError(null);
  }

  async function handleNegativeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateFeedbackForm({
      satisfaction: 2,
      failure_reason: failureReason,
      note,
    });

    setFieldErrors(errors);

    if (hasValidationErrors(errors)) {
      return;
    }

    await submitFeedback({
      satisfaction: 2,
      failure_reason: failureReason!,
      note: note.trim() || null,
    });
  }

  const showNegativeDetails = sentiment === "bad";

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center bg-[var(--tg-bg-color)] px-4 py-8 text-[var(--tg-text-color)]">
      <Card tone="telegram" className="space-y-5">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">여정 피드백</h1>
          <p className="webapp-subtitle mt-1 text-sm leading-snug">
            오늘 여정은 어떠셨나요?
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="primary"
            tone="telegram"
            fullWidth
            disabled={submitting}
            className={cn(
              "min-h-16 py-5 text-lg",
              sentiment === "good" &&
                "ring-2 ring-[var(--tg-link-color)] ring-offset-2 ring-offset-[var(--tg-section-bg-color)]",
            )}
            onClick={() => {
              void handleGoodTap();
            }}
          >
            좋음
          </Button>
          <Button
            type="button"
            variant="secondary"
            tone="telegram"
            fullWidth
            disabled={submitting}
            className={cn(
              "min-h-16 py-5 text-lg",
              sentiment === "bad" &&
                "ring-2 ring-[var(--tg-link-color)] ring-offset-2 ring-offset-[var(--tg-section-bg-color)]",
            )}
            onClick={handleBadTap}
          >
            아쉬움
          </Button>
        </div>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            showNegativeDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <form
              onSubmit={(event) => {
                void handleNegativeSubmit(event);
              }}
              className="space-y-4 pt-1"
            >
              <section>
                <h2 className="webapp-section-title text-xs font-semibold">
                  어떤 점이 아쉬웠나요?
                </h2>
                <div className="mt-2 flex flex-col gap-2">
                  {NEGATIVE_FAILURE_REASONS.map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      variant="secondary"
                      tone="telegram"
                      fullWidth
                      className={cn(
                        "min-h-12 text-left",
                        failureReason === reason &&
                          "ring-2 ring-[var(--tg-link-color)] ring-offset-1 ring-offset-[var(--tg-section-bg-color)]",
                      )}
                      onClick={() => {
                        setFailureReason(reason);
                        setFieldErrors((prev) => ({
                          ...prev,
                          failure_reason: undefined,
                        }));
                      }}
                    >
                      {FAILURE_REASON_LABELS[reason]}
                    </Button>
                  ))}
                </div>
                {fieldErrors.failure_reason ? (
                  <p className="mt-2 text-sm text-red-600" role="alert">
                    {fieldErrors.failure_reason}
                  </p>
                ) : null}
              </section>

              <section>
                <label
                  htmlFor="feedback-note"
                  className="webapp-section-title block text-xs font-semibold"
                >
                  추가로 남기고 싶은 말{" "}
                  <span className="font-normal">(선택)</span>
                </label>
                <textarea
                  id="feedback-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder="더 알려주고 싶은 점이 있다면 적어 주세요."
                  className="webapp-input webapp-textarea mt-2 w-full resize-none"
                />
              </section>

              {submitError ? (
                <p className="text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                tone="telegram"
                fullWidth
                disabled={submitting}
                className="min-h-14"
              >
                {submitting ? "저장 중…" : "피드백 보내기"}
              </Button>
            </form>
          </div>
        </div>

        {sentiment === "good" && submitError ? (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        ) : null}
      </Card>

      {showSuccessFlash ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tg-bg-color)]/95"
          role="status"
          aria-live="polite"
        >
          <p className="text-lg font-semibold">제출 완료 ✔️</p>
        </div>
      ) : null}
    </main>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center bg-[var(--tg-bg-color)] px-4 py-10">
          <p className="webapp-subtitle text-sm">불러오는 중…</p>
        </main>
      }
    >
      <FeedbackForm />
    </Suspense>
  );
}
