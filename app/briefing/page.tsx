"use client";

import { decompressFromEncodedURIComponent } from "lz-string";
import { useMemo, useSyncExternalStore } from "react";
import type { Block, Briefing } from "@/lib/engine/types";
import type { BriefingLinkPayload } from "@/lib/webhook/briefing-urls";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      briefing: Briefing;
      variant: "A" | "B";
      variantLabel: string;
    };

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

  if ("briefing" in parsed && parsed.briefing) {
    return parsed;
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
    const fallbackLabel =
      variant === "B" ? "원거리·확장형" : "근거리·기본형";

    return {
      status: "ready",
      briefing: payload.briefing,
      variant,
      variantLabel: payload.variantLabel || fallbackLabel,
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

function backupPlaceName(block: Block): string | null {
  if (!block.weather_backup) return null;
  const match = block.weather_backup.reason.match(/우천 시 (.+?)\(으\)로 대체/);
  return match?.[1] ?? block.weather_backup.place_id;
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

export default function BriefingPage() {
  const hash = useLocationHash();
  const view = useMemo(() => resolveViewFromHash(hash), [hash]);

  if (view.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-slate-500">브리핑을 불러오는 중…</p>
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-rose-600">{view.message}</p>
      </div>
    );
  }

  const { briefing, variant, variantLabel } = view;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {briefing.destination.replace(/_/g, " ")}
              </p>
              <h1 className="text-xl font-semibold">{briefing.date_label}</h1>
            </div>
            <span className="shrink-0 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
              {variant} · {variantLabel}
            </span>
          </div>

          <section className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-4 text-white shadow-sm">
            <p className="text-sm font-medium opacity-90">오늘 날씨</p>
            <p className="mt-1 text-2xl font-bold">{briefing.weather.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1">
                {briefing.weather.temp}
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1">
                강수 {briefing.weather.rain_prob}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed opacity-95">
              {briefing.weather.advice}
            </p>
          </section>
        </header>

        {briefing.days.map((day) => (
          <section
            key={day.label}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-medium text-slate-500">{day.label}</p>
              <h2 className="text-base font-semibold">{day.title}</h2>
            </div>

            <ul className="divide-y divide-slate-100">
              {day.blocks.map((block) => {
                const backupName = backupPlaceName(block);
                return (
                  <li key={`${day.label}-${block.time_label}-${block.place_id}`} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClassName(block.dot)}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {block.time_label}
                          </span>
                          <h3 className="text-sm font-semibold">{block.title}</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600">
                          {block.desc}
                        </p>
                        {block.weather_note ? (
                          <p className="text-xs text-slate-500">{block.weather_note}</p>
                        ) : null}
                        {backupName ? (
                          <p className="inline-flex rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            우천 시 → {backupName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">체크리스트</h2>
          <ul className="mt-3 space-y-2">
            {briefing.checklist.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-slate-700"
              >
                <span className="mt-0.5 text-emerald-600" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
