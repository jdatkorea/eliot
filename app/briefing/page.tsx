"use client";

import { decompressFromEncodedURIComponent } from "lz-string";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Block, Briefing } from "@/lib/engine/types";
import {
  resolveBriefingPayload,
  type BriefingLinkPayload,
  type ResolvedBriefingPayload,
} from "@/lib/webhook/briefing-urls";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & ResolvedBriefingPayload);

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getHashSnapshot() {
  return window.location.hash;
}

function getServerHashSnapshot() {
  return "";
}

function useLocationHash() {
  return useSyncExternalStore(
    subscribeToHash,
    getHashSnapshot,
    getServerHashSnapshot,
  );
}

function parseHashParams(hash: string): { data: string | null; variant: "A" | "B" } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const variantParam = params.get("variant");
  return {
    data: params.get("data"),
    variant: variantParam === "B" ? "B" : "A",
  };
}

function decodeBriefingPayload(data: string): BriefingLinkPayload {
  const json = decompressFromEncodedURIComponent(data);
  if (!json) {
    throw new Error("브리핑 데이터를 복원할 수 없습니다.");
  }

  const parsed = JSON.parse(json) as BriefingLinkPayload | Briefing;

  if ("briefing" in parsed || "briefingA" in parsed) {
    return parsed as BriefingLinkPayload;
  }

  return {
    briefing: parsed as Briefing,
    variantLabel: "",
  };
}

function resolveViewFromHash(hash: string): ViewState {
  if (!hash) {
    return { status: "loading" };
  }

  try {
    const { data, variant } = parseHashParams(hash);
    if (!data) {
      return {
        status: "error",
        message: "URL에 브리핑 데이터가 없습니다.",
      };
    }

    const payload = decodeBriefingPayload(data);
    return {
      status: "ready",
      ...resolveBriefingPayload(payload, variant),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "브리핑을 불러오지 못했습니다.",
    };
  }
}

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

function selectBriefing(
  view: ResolvedBriefingPayload,
  variant: "A" | "B",
): { briefing: Briefing; variantLabel: string } {
  if (view.dual) {
    return {
      briefing: variant === "B" ? view.dual.briefingB : view.dual.briefingA,
      variantLabel: variant === "B" ? view.dual.labelB : view.dual.labelA,
    };
  }

  return {
    briefing: view.briefing,
    variantLabel: view.variantLabel,
  };
}

const actionButtonClass =
  "block w-full rounded border px-2 py-1.5 text-left text-[10px] font-semibold leading-tight transition-colors";

function actionButtonStateClass(selected: boolean): string {
  return selected
    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

export default function BriefingPage() {
  const hash = useLocationHash();
  const view = useMemo(() => resolveViewFromHash(hash), [hash]);
  const [overrideVariant, setOverrideVariant] = useState<"A" | "B" | null>(null);

  useEffect(() => {
    setOverrideVariant(null);
  }, [hash]);

  if (view.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 px-2">
        <p className="text-xs leading-snug text-slate-500">브리핑을 불러오는 중…</p>
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 px-2">
        <p className="text-xs leading-snug text-rose-600">{view.message}</p>
      </div>
    );
  }

  const variant = overrideVariant ?? view.variant;
  const { briefing, variantLabel } = selectBriefing(view, variant);
  const showNav = Boolean(view.dual || view.feedbackUrl);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900 leading-snug">
      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2 py-1.5">
        <header className="shrink-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {briefing.destination.replace(/_/g, " ")}
              </p>
              <h1 className="text-sm font-semibold leading-tight">
                {briefing.date_label}
              </h1>
            </div>
            <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {variant} · {variantLabel}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {briefing.days.map((day) => (
            <section
              key={day.label}
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-200 bg-white"
            >
              <div className="shrink-0 border-b border-slate-100 px-2 py-1">
                <p className="text-[10px] font-medium text-slate-500">{day.label}</p>
                <h2 className="text-xs font-semibold leading-tight">{day.title}</h2>
              </div>

              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-hidden">
                {day.blocks.map((block) => (
                  <li
                    key={`${day.label}-${block.time_label}-${block.place_id}`}
                    className="px-2 py-1"
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
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1">
            <h2 className="text-xs font-semibold text-slate-800">체크리스트</h2>
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
          </section>
        </div>

        {showNav ? (
          <nav
            className="flex shrink-0 flex-col gap-2"
            aria-label="다음 행동"
          >
            {view.dual
              ? (["A", "B"] as const).map((option) => {
                  const selected = variant === option;
                  const label =
                    option === "A" ? view.dual!.labelA : view.dual!.labelB;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setOverrideVariant(option)}
                      className={`${actionButtonClass} ${actionButtonStateClass(selected)}`}
                    >
                      <span className="block">{option} · {label}</span>
                      <span className="font-normal text-slate-500">
                        브리핑 보기
                      </span>
                    </button>
                  );
                })
              : null}

            {view.feedbackUrl ? (
              <a
                href={view.feedbackUrl}
                className={`${actionButtonClass} ${actionButtonStateClass(false)}`}
              >
                <span className="block">여정 종료 후 피드백 남기기</span>
              </a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
