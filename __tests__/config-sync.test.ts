import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  isAppConfig,
  parseConfigValueSafe,
  safeAppConfigFromDbRows,
} from "@/lib/config/app-config";
import { parseConfigFromSheet } from "@/scripts/lib/config-sync";

describe("parseConfigValueSafe", () => {
  it("유효 JSON 객체 파싱", () => {
    const result = parseConfigValueSafe('{"short":["출발","점심"]}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ short: ["출발", "점심"] });
    }
  });

  it("JSON 구문 오류 시 즉시 실패", () => {
    const result = parseConfigValueSafe('{"broken": ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("JSON 구문 오류");
    }
  });

  it("스칼라 숫자는 JSON.parse 또는 fallback으로 허용", () => {
    expect(parseConfigValueSafe("50")).toEqual({ ok: true, value: 50 });
  });
});

describe("parseConfigFromSheet — 오류 행 스킵", () => {
  const validMoodTags = JSON.stringify(DEFAULT_APP_CONFIG.mood_tags);
  const validThreshold = String(DEFAULT_APP_CONFIG.rain_prob_threshold);

  it("JSON 오류 행만 스킵하고 유효 행은 유지", () => {
    const rows = [
      ["key", "value", "scope", "updated_at"],
      ["mood_tags", validMoodTags, "global", "2026-06-12"],
      ["templates", '{"broken": ', "global", "2026-06-12"],
      ["rain_prob_threshold", validThreshold, "global", "2026-06-12"],
    ];

    const result = parseConfigFromSheet(rows, { logErrors: false });

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].key).toBe("templates");
    expect(result.invalid[0].rowNumber).toBe(3);
    expect(result.rows.map((r) => r.key)).toEqual([
      "mood_tags",
      "rain_prob_threshold",
    ]);
    expect(result.missingKeys.length).toBeGreaterThan(0);
  });
});

describe("safeAppConfigFromDbRows — 런타임 fail-over", () => {
  it("필수 키 누락 시 DEFAULT_APP_CONFIG", () => {
    const config = safeAppConfigFromDbRows([
      { key: "rain_prob_threshold", value: 50 },
    ]);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
  });

  it("Zod 불일치 값 시 DEFAULT_APP_CONFIG", () => {
    const config = safeAppConfigFromDbRows([
      { key: "mood_tags", value: DEFAULT_APP_CONFIG.mood_tags },
      { key: "mood_tag_effects", value: DEFAULT_APP_CONFIG.mood_tag_effects },
      { key: "templates", value: { base: {}, block_category_map: {}, desc_by_category: {} } },
      { key: "rain_prob_threshold", value: "not-a-number" },
    ]);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
  });

  it("isAppConfig 타입 가드", () => {
    expect(isAppConfig(DEFAULT_APP_CONFIG)).toBe(true);
    expect(isAppConfig({})).toBe(false);
  });
});
