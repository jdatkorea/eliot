"use client";

import { useEffect, useState } from "react";
import { buildEngineDebugLog } from "@/lib/admin/engine-debug";
import { computeFeedbackStats, type FeedbackStats } from "@/lib/admin/feedback-stats";
import type { Briefing } from "@/lib/engine/types";
import { getFeedback } from "@/lib/webapp/feedback-storage";

const CATEGORY_LABELS: Record<string, string> = {
  meal: "식사",
  cafe: "카페",
  activity: "액티비티",
  view: "전망",
  kids: "키즈",
};

type DashboardViewProps = {
  isAdmin: boolean;
  briefing: Briefing;
  onClose: () => void;
};

const EMPTY_STATS: FeedbackStats = {
  totalEntries: 0,
  poolExhaustedCount: 0,
  poolExhaustedRate: 0,
  topExcludedCategories: [],
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function DashboardView({
  isAdmin,
  briefing,
  onClose,
}: DashboardViewProps) {
  const [stats, setStats] = useState<FeedbackStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      try {
        const log = await getFeedback();
        if (!cancelled) {
          setStats(computeFeedbackStats(log.entries));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const debugLog = buildEngineDebugLog();
  const currentPoolExhausted = briefing.pool_exhausted === true;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
      aria-label="관리자 대시보드"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1">
        <h2 className="text-xs font-semibold text-indigo-900">관리자 대시보드</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-800"
        >
          브리핑으로
        </button>
      </div>

      <section className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1">
        <h3 className="text-xs font-semibold text-slate-800">CloudStorage 피드백</h3>
        {loading ? (
          <p className="mt-0.5 text-[10px] text-slate-500">통계 불러오는 중…</p>
        ) : (
          <dl className="mt-0.5 space-y-1">
            <div className="grid grid-cols-[5.5rem_1fr] gap-1">
              <dt className="text-[10px] font-medium text-slate-500">총 항목</dt>
              <dd className="text-[10px] text-slate-700">{stats.totalEntries}</dd>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-1">
              <dt className="text-[10px] font-medium text-slate-500">pool_exhausted</dt>
              <dd className="text-[10px] text-slate-700">
                {stats.poolExhaustedCount}회 ({formatPercent(stats.poolExhaustedRate)})
              </dd>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-1">
              <dt className="text-[10px] font-medium text-slate-500">현재 브리핑</dt>
              <dd className="text-[10px] text-slate-700">
                {currentPoolExhausted ? "풀 소진됨" : "정상"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1">
        <h3 className="text-xs font-semibold text-slate-800">excluded_categories 빈도</h3>
        {stats.topExcludedCategories.length === 0 ? (
          <p className="mt-0.5 text-[10px] text-slate-500">집계할 카테고리 없음</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {stats.topExcludedCategories.map((item) => {
              const maxCount = stats.topExcludedCategories[0]?.count ?? 1;
              const width = Math.max(8, Math.round((item.count / maxCount) * 100));
              return (
                <li key={item.category}>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-medium text-slate-700">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    <span className="text-slate-500">{item.count}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                    <div
                      className="h-1.5 rounded bg-indigo-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1">
        <h3 className="text-xs font-semibold text-slate-800">Debug Log · 7필드 엔진</h3>
        <pre className="mt-0.5 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-[9px] leading-snug text-emerald-300">
          {JSON.stringify(debugLog, null, 2)}
        </pre>
      </section>
    </section>
  );
}
