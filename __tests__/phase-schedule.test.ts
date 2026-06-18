import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  formatMinutesToClockTime,
  parseClockTimeToMinutes,
  resolvePhaseClockWindows,
} from "@/lib/engine/phase-schedule";

describe("parseClockTimeToMinutes / formatMinutesToClockTime", () => {
  it("HH:MM을 분으로, 분을 다시 HH:MM으로 왕복 변환", () => {
    expect(parseClockTimeToMinutes("10:00")).toBe(600);
    expect(parseClockTimeToMinutes("19:56")).toBe(19 * 60 + 56);
    expect(formatMinutesToClockTime(600)).toBe("10:00");
    expect(formatMinutesToClockTime(19 * 60 + 56)).toBe("19:56");
  });

  it("자정을 넘는 분도 0~23:59 범위로 정규화", () => {
    expect(formatMinutesToClockTime(1440)).toBe("00:00");
    expect(formatMinutesToClockTime(1500)).toBe("01:00");
  });

  it("잘못된 형식은 예외", () => {
    expect(() => parseClockTimeToMinutes("not-a-time")).toThrow();
  });
});

describe("resolvePhaseClockWindows", () => {
  const config = DEFAULT_APP_CONFIG;

  it("[property] 모든 phase가 [출발,귀환] window 내 + 단조 증가", () => {
    const templates = Object.values(config.templates.base);
    const durations = [3, 5, 6, 8];

    for (const timeLabels of templates) {
      for (const duration of durations) {
        const windows = resolvePhaseClockWindows(timeLabels, config, duration, "10:00");

        for (let i = 0; i < windows.length; i++) {
          expect(windows[i]!.end_minutes).toBeGreaterThan(windows[i]!.start_minutes);
          if (i > 0) {
            // 단조 증가 — 다음 phase의 시작은 이전 phase의 끝과 정확히 맞물린다(틈/중첩 없음)
            expect(windows[i]!.start_minutes).toBe(windows[i - 1]!.end_minutes);
          }
        }

        const departureMinutes = parseClockTimeToMinutes("10:00");
        expect(windows[0]!.start_minutes).toBe(departureMinutes);
        expect(windows[windows.length - 1]!.end_minutes).toBe(
          departureMinutes + duration * 60,
        );
      }
    }
  });

  it("[property] phase 구간 합 = 총 작전시간(오차 0 — 마지막 phase가 나머지를 흡수)", () => {
    const timeLabels = config.templates.base.half_day;
    const durationHours = 5;
    const windows = resolvePhaseClockWindows(timeLabels, config, durationHours, "10:00");

    const totalAllocated = windows.reduce(
      (sum, w) => sum + (w.end_minutes - w.start_minutes),
      0,
    );
    expect(totalAllocated).toBe(durationHours * 60);
  });

  it("빈 timeLabels는 빈 배열을 반환한다 (0-stop과 무관 — 방어적 처리)", () => {
    expect(resolvePhaseClockWindows([], config, 5, "10:00")).toEqual([]);
  });
});
