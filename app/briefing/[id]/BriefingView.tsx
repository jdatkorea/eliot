"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DashboardView from "@/lib/admin/DashboardView";
import { useIsAdmin } from "@/lib/admin/useIsAdmin";
import {
  BRIEFING_CHECKLIST_HEADING,
  getBriefingContextLines,
  formatDestinationLabel,
} from "@/lib/engine/format-briefing";
import type { Block, Briefing } from "@/lib/engine/types";
import {
  parseFeedbackLinkParams,
  V0_TRIP_ID,
} from "@/lib/feedback/context";
import {
  readCourseState,
  writeCourseState,
  type StoredCourseState,
} from "@/lib/webapp/course-state-storage";

export type BriefingDualPayload = {
  briefingA: Briefing;
  briefingB: Briefing;
  labelA: string;
  labelB: string;
};

export type BriefingViewProps = {
  briefing: Briefing;
  variantLabel: string;
  variant: "A" | "B";
  feedbackUrl?: string;
  dual?: BriefingDualPayload;
};

function dotClassName(dot: Block["dot"]): string {
  switch (dot) {
    case "accent":
      return "bg-amber-500";
    case "green":
      return "bg-emerald-500";
    default:
      return "bg-sky-500";
  }
}

/** 사령관 Telegram user id — TMA initDataUnsafe.user.id 와 일치해야 함 */
const COMMANDER_TELEGRAM_ID = 123456789;

function resolveTripIdFromFeedbackUrl(feedbackUrl?: string): string {
  if (!feedbackUrl?.trim()) return V0_TRIP_ID;
  try {
    const params = new URL(feedbackUrl).searchParams;
    return parseFeedbackLinkParams(params).trip_id ?? V0_TRIP_ID;
  } catch {
    return V0_TRIP_ID;
  }
}

function buildStoredCourseState(
  briefing: Briefing,
  variant: "A" | "B",
  feedbackUrl?: string,
  existing?: StoredCourseState | null,
): StoredCourseState {
  return {
    briefing,
    variant,
    destination: briefing.destination,
    mode: briefing.context_meta?.prior_trip_feedback?.mode ?? "family",
    mood_tags: briefing.context_meta?.prior_trip_feedback?.mood_tags ?? [],
    trip_id: existing?.trip_id ?? resolveTripIdFromFeedbackUrl(feedbackUrl),
    swap_attempt_index: existing?.swap_attempt_index ?? 0,
    saved_at: new Date().toISOString(),
  };
}

function resolveBaseBriefing(
  dual: BriefingDualPayload | undefined,
  activeVariant: "A" | "B",
  fallback: Briefing,
): Briefing {
  if (!dual) return fallback;
  return activeVariant === "B" ? dual.briefingB : dual.briefingA;
}

function resolveVariantLabel(
  dual: BriefingDualPayload | undefined,
  activeVariant: "A" | "B",
  fallback: string,
): string {
  if (!dual) return fallback;
  return activeVariant === "B" ? dual.labelB : dual.labelA;
}

export default function BriefingView({
  briefing: initialBriefing,
  variantLabel,
  variant,
  feedbackUrl,
  dual,
}: BriefingViewProps) {
  const isAdmin = useIsAdmin(COMMANDER_TELEGRAM_ID);
  const [activeVariant, setActiveVariant] = useState<"A" | "B">(variant);
  const [showDashboard, setShowDashboard] = useState(false);
  const [activeBriefing, setActiveBriefing] = useState<Briefing | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const [expandedBlockKey, setExpandedBlockKey] = useState<string | null>(null);

  useEffect(() => {
    setActiveVariant(variant);
  }, [variant]);

  const baseBriefing = useMemo(
    () => resolveBaseBriefing(dual, activeVariant, initialBriefing),
    [dual, activeVariant, initialBriefing],
  );

  const currentVariantLabel = useMemo(
    () => resolveVariantLabel(dual, activeVariant, variantLabel),
    [dual, activeVariant, variantLabel],
  );

  const briefing = activeBriefing ?? baseBriefing;

  const handleVariantChange = useCallback(
    (next: "A" | "B") => {
      if (!dual || next === activeVariant) return;

      setActiveVariant(next);
      setActiveBriefing(null);
      setSwapMessage(null);
      setSwapTarget(null);

      const url = new URL(window.location.href);
      url.searchParams.set("variant", next);
      window.history.replaceState(null, "", url.toString());
    },
    [activeVariant, dual],
  );

  useEffect(() => {
    void writeCourseState(
      buildStoredCourseState(briefing, activeVariant, feedbackUrl),
    );
  }, [briefing, activeVariant, feedbackUrl]);

  const handleSwapSpot = useCallback(
    async (dayIndex: number, blockIndex: number) => {
      const targetKey = `${dayIndex}-${blockIndex}`;
      setSwapTarget(targetKey);
      setSwapMessage(null);

      try {
        let stored = await readCourseState();
        if (!stored) {
          stored = buildStoredCourseState(
            briefing,
            activeVariant,
            feedbackUrl,
          );
        } else {
          stored = { ...stored, briefing, variant: activeVariant };
        }

        const response = await fetch("/api/course/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dayIndex,
            blockIndex,
            state: stored,
          }),
        });

        const result = (await response.json()) as {
          ok: boolean;
          swapped?: boolean;
          briefing?: Briefing;
          state?: StoredCourseState;
          message?: string;
          error?: string;
        };

        if (!response.ok || !result.ok) {
          setSwapMessage(result.error ?? "장소 교체에 실패했습니다.");
          return;
        }

        if (result.briefing) {
          setActiveBriefing(result.briefing);
        }
        if (result.state) {
          await writeCourseState(result.state);
        }

        setSwapMessage(
          result.swapped
            ? "다른 장소로 교체되었습니다."
            : (result.message ?? "교체 가능한 장소가 없습니다."),
        );
      } catch (error) {
        setSwapMessage(
          error instanceof Error
            ? error.message
            : "장소 교체 중 오류가 발생했습니다.",
        );
      } finally {
        setSwapTarget(null);
      }
    },
    [activeVariant, briefing, feedbackUrl],
  );

  const contextLines = useMemo(() => getBriefingContextLines(briefing), [briefing]);
  const showNav = Boolean(feedbackUrl);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900 leading-snug">
      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2 py-1.5">
        {dual ? (
          <div className="relative shrink-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition-colors hover:border-indigo-300"
              aria-haspopup="listbox"
              aria-expanded={variantMenuOpen}
              aria-label="브리핑 안 선택"
              onClick={() => setVariantMenuOpen((open) => !open)}
            >
              <span>
                현재: {activeVariant}안 · {currentVariantLabel}
              </span>
              <span aria-hidden className="text-slate-400">
                ▾
              </span>
            </button>
            {variantMenuOpen ? (
              <ul
                role="listbox"
                aria-label="브리핑 안 선택"
                className="absolute left-0 right-0 top-full z-10 mt-0.5 overflow-hidden rounded border border-slate-200 bg-white shadow-sm"
              >
                {(["A", "B"] as const).map((v) => (
                  <li key={v} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeVariant === v}
                      className={`block w-full px-2 py-1 text-left text-[10px] font-semibold transition-colors ${
                        activeVariant === v
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        handleVariantChange(v);
                        setVariantMenuOpen(false);
                      }}
                    >
                      {v}안 · {v === "A" ? dual.labelA : dual.labelB}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <header className="shrink-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {formatDestinationLabel(briefing.destination)}
              </p>
              <h1 className="text-sm font-semibold leading-tight">
                {briefing.date_label}
              </h1>
            </div>
            {!dual ? (
              <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {activeVariant} · {currentVariantLabel}
              </span>
            ) : null}
          </div>
        </header>

        {showDashboard && isAdmin ? (
          <DashboardView
            isAdmin={isAdmin}
            briefing={briefing}
            onClose={() => setShowDashboard(false)}
          />
        ) : (
          <>
            {contextLines.length > 0 ? (
              <Card padding="sm">
                <h2 className="text-xs font-semibold text-slate-800">작전 컨텍스트</h2>
                <dl className="mt-0.5 space-y-0.5">
                  {contextLines.map((line) => (
                    <div key={line.label} className="grid grid-cols-[4.5rem_1fr] gap-1">
                      <dt className="text-[10px] font-medium text-slate-500">
                        {line.label}
                      </dt>
                      <dd className="text-[10px] leading-snug text-slate-700">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {briefing.days.map((day, dayIndex) => (
                <Card
                  key={day.label}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
                >
                  <div className="shrink-0 border-b border-slate-100 px-2 py-1">
                    <p className="text-[10px] font-medium text-slate-500">{day.label}</p>
                    <h2 className="text-xs font-semibold leading-tight">{day.title}</h2>
                  </div>

                  <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-hidden">
                    {day.blocks.map((block, blockIndex) => {
                      const blockKey = `${dayIndex}-${blockIndex}`;
                      const isExpanded = expandedBlockKey === blockKey;

                      return (
                        <li
                          key={`${day.label}-${block.time_label}-${block.place_id}`}
                          className="cursor-pointer px-2 py-1 transition-colors hover:bg-slate-50/80"
                          onClick={() =>
                            setExpandedBlockKey((prev) =>
                              prev === blockKey ? null : blockKey,
                            )
                          }
                        >
                          <div className="flex items-start gap-1.5">
                            <span
                              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClassName(block.dot)}`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-semibold text-slate-700">
                                  {block.time_label}
                                </span>
                                <h3 className="text-xs font-semibold leading-tight">
                                  {block.title}
                                </h3>
                              </div>
                              <p className="text-[10px] leading-snug text-slate-600">
                                {block.desc}
                              </p>
                              {block.weather_note ? (
                                <p
                                  className="rounded border border-amber-200 bg-amber-50 px-1 py-px text-[10px] font-medium leading-snug text-amber-800"
                                  role="note"
                                >
                                  {block.weather_note}
                                </p>
                              ) : null}
                              <div
                                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                }`}
                              >
                                <div className="overflow-hidden">
                                  <Button
                                    variant="ghost"
                                    disabled={swapTarget === blockKey}
                                    className="mt-0.5"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleSwapSpot(dayIndex, blockIndex);
                                    }}
                                  >
                                    {swapTarget === blockKey
                                      ? "교체 중…"
                                      : "다른 곳으로"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}

              <Card padding="sm">
                <h2 className="text-xs font-semibold text-slate-800">
                  {BRIEFING_CHECKLIST_HEADING}
                </h2>
                <ul className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {briefing.checklist.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-1 text-[10px] leading-snug text-slate-700"
                    >
                      <span className="text-emerald-600" aria-hidden>
                        ✓
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {swapMessage ? (
                <Card padding="sm" role="status">
                  <p className="text-[10px] leading-snug text-slate-700">{swapMessage}</p>
                </Card>
              ) : null}

              {briefing.pool_exhausted ? (
                <Card tone="warning" padding="sm" role="note">
                  <p className="text-[10px] leading-snug text-amber-800">
                    현재 장소 풀이 제한적입니다. 조건을 완화하면 더 많은 동선을 볼 수
                    있습니다.
                  </p>
                </Card>
              ) : null}
            </div>
          </>
        )}

        {showNav || isAdmin ? (
          <nav
            className="flex shrink-0 flex-col gap-2"
            aria-label="다음 행동"
          >
            {showNav ? (
              <Button variant="secondary" fullWidth href={feedbackUrl!}>
                <span className="block">여정 종료 후 피드백 남기기</span>
              </Button>
            ) : null}
            {isAdmin && !showDashboard ? (
              <Button
                variant="primary"
                fullWidth
                onClick={() => setShowDashboard(true)}
              >
                <span className="block">대시보드 보기</span>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
