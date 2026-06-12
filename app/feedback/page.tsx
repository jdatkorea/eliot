"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

function FeedbackForm() {
  const searchParams = useSearchParams();
  const linkParams = parseFeedbackLinkParams(searchParams);
  const subjectId = linkParams.subject_id ?? DEFAULT_SUBJECT_ID;
  const tripId = linkParams.trip_id ?? V0_TRIP_ID;

  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [failureReason, setFailureReason] = useState<FailureReason | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [routeVariant, setRouteVariant] = useState<"A" | "B" | null>(
    linkParams.route_variant ?? null,
  );
  const [fieldErrors, setFieldErrors] = useState<{
    satisfaction?: string;
    failure_reason?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateFeedbackForm({
      satisfaction,
      failure_reason: failureReason,
      note,
    });

    setFieldErrors(errors);

    if (hasValidationErrors(errors)) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          satisfaction,
          failure_reason: failureReason,
          note: note.trim() || null,
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

      setSubmitted(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "피드백 저장 중 오류가 발생했습니다.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
            피드백이 저장되었습니다
          </p>
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
            소중한 의견이 다음 여정에 반영됩니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">여정 피드백</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          오늘 여정은 어떠셨나요? 솔직한 피드백이 다음 브리핑을 더 좋게
          만듭니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-8">
        <section>
          <h2 className="mb-3 text-base font-semibold">
            전체 만족도 <span className="text-red-500">*</span>
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = satisfaction === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSatisfaction(value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      satisfaction: undefined,
                    }));
                  }}
                  className={`min-h-14 rounded-xl border text-lg font-semibold transition-colors ${
                    selected
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-800 hover:border-sky-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
          {fieldErrors.satisfaction ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {fieldErrors.satisfaction}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">
            아쉬웠던 점 <span className="text-red-500">*</span>
          </h2>
          <div className="flex flex-col gap-2">
            {FAILURE_REASONS.map((reason) => {
              const selected = failureReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setFailureReason(reason);
                    setFieldErrors((prev) => ({
                      ...prev,
                      failure_reason: undefined,
                    }));
                  }}
                  className={`min-h-14 rounded-xl border px-4 text-left text-base font-medium transition-colors ${
                    selected
                      ? "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
                      : "border-zinc-300 bg-white text-zinc-800 hover:border-sky-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {FAILURE_REASON_LABELS[reason]}
                </button>
              );
            })}
          </div>
          {fieldErrors.failure_reason ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {fieldErrors.failure_reason}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">
            선택한 브리핑 <span className="font-normal text-zinc-500">(선택)</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((variant) => {
              const selected = routeVariant === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setRouteVariant((current) =>
                      current === variant ? null : variant,
                    )
                  }
                  className={`min-h-14 rounded-xl border px-4 text-base font-medium transition-colors ${
                    selected
                      ? "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
                      : "border-zinc-300 bg-white text-zinc-800 hover:border-sky-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {variant}안
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <label
            htmlFor="feedback-note"
            className="mb-3 block text-base font-semibold"
          >
            추가 메모 <span className="font-normal text-zinc-500">(선택)</span>
          </label>
          <textarea
            id="feedback-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder="더 알려주고 싶은 점이 있다면 적어 주세요."
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </section>

        {submitError ? (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-auto min-h-14 rounded-xl bg-sky-600 text-base font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "저장 중…" : "피드백 보내기"}
        </button>
      </form>
    </main>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center px-4 py-10">
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        </main>
      }
    >
      <FeedbackForm />
    </Suspense>
  );
}
