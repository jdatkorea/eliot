import type { AppConfig, TimeLabel } from "./types";

export type PhaseClockWindow = {
  label: TimeLabel;
  start_time: string;
  end_time: string;
  /** 자정 기준 분(分) — 다음날로 넘어가면 1440을 넘을 수 있다 */
  start_minutes: number;
  end_minutes: number;
};

/** "HH:MM" → 자정 기준 분. config.default_departure_time / sunset_time처럼 항상 단순 시계 문자열만 받는다(ISO 등 자유 형식은 다루지 않음 — normalize.ts의 parseTimeToMinutes와 별개). */
export function parseClockTimeToMinutes(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid clock time format: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesToClockTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * timeLabels(템플릿 phase 순서)를 출발 시각부터 단조 증가하는 clock-time
 * 구간으로 배분한다. config.phase_durations는 절대 분이 아니라 상대
 * 가중치 — 합이 항상 정확히 durationHours×60(작전시간 window)과 일치하도록
 * 마지막 phase가 나머지를 흡수한다(반올림 오차가 누적되지 않게).
 */
export function resolvePhaseClockWindows(
  timeLabels: readonly TimeLabel[],
  config: AppConfig,
  durationHours: number,
  departureTime: string,
): PhaseClockWindow[] {
  if (timeLabels.length === 0) return [];

  const totalMinutes = Math.round(durationHours * 60);
  const weights = timeLabels.map((label) => config.phase_durations[label] ?? 1);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const departureMinutes = parseClockTimeToMinutes(departureTime);

  const windows: PhaseClockWindow[] = [];
  let cursor = 0;
  let allocatedSoFar = 0;

  for (let i = 0; i < timeLabels.length; i++) {
    const isLast = i === timeLabels.length - 1;
    const share = isLast
      ? totalMinutes - allocatedSoFar
      : Math.round((weights[i]! / weightSum) * totalMinutes);
    allocatedSoFar += share;

    const startMinutes = departureMinutes + cursor;
    const endMinutes = startMinutes + share;

    windows.push({
      label: timeLabels[i]!,
      start_time: formatMinutesToClockTime(startMinutes),
      end_time: formatMinutesToClockTime(endMinutes),
      start_minutes: startMinutes,
      end_minutes: endMinutes,
    });

    cursor += share;
  }

  return windows;
}
