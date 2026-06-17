import { describe, expect, it } from "vitest";
import { buildEngineDebugLog, ENGINE_SCORING_WEIGHTS } from "@/lib/admin/engine-debug";
import { computeFeedbackStats } from "@/lib/admin/feedback-stats";
import { isAdminTelegramUser } from "@/lib/admin/is-admin";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";

const COMMANDER_ID = 123456789;

describe("isAdminTelegramUser", () => {
  it("사령관 ID와 일치하면 true", () => {
    expect(isAdminTelegramUser(COMMANDER_ID, COMMANDER_ID)).toBe(true);
  });

  it("타인 ID는 false", () => {
    expect(isAdminTelegramUser(99999, COMMANDER_ID)).toBe(false);
  });

  it("user id 없으면 false", () => {
    expect(isAdminTelegramUser(undefined, COMMANDER_ID)).toBe(false);
  });
});

describe("computeFeedbackStats", () => {
  it("excluded_categories·place_category 빈도 집계", () => {
    const stats = computeFeedbackStats([
      { place_category: "meal" },
      { place_category: "cafe" },
      { place_category: "meal" },
      { excluded_categories: ["view", "kids"] },
    ]);

    expect(stats.totalEntries).toBe(4);
    expect(stats.topExcludedCategories[0]).toEqual({ category: "meal", count: 2 });
    expect(stats.topExcludedCategories).toContainEqual({ category: "view", count: 1 });
    expect(stats.topExcludedCategories).toContainEqual({ category: "kids", count: 1 });
  });

  it("pool_exhausted 발생 빈도 집계", () => {
    const stats = computeFeedbackStats([
      { pool_exhausted: true },
      { pool_exhausted: false },
      { pool_exhausted: true },
    ]);

    expect(stats.poolExhaustedCount).toBe(2);
    expect(stats.poolExhaustedRate).toBeCloseTo(2 / 3);
  });
});

describe("buildEngineDebugLog", () => {
  it("7필드 엔진 가중치·mood_tag_effects 포함", () => {
    const log = buildEngineDebugLog(DEFAULT_APP_CONFIG);

    expect(log.moodTagEffects).toEqual(DEFAULT_APP_CONFIG.mood_tag_effects);
    expect(log.blockCategoryMap).toEqual(
      DEFAULT_APP_CONFIG.templates.block_category_map,
    );
    expect(log.scoringWeights).toEqual(ENGINE_SCORING_WEIGHTS);
    expect(log.rainProbThreshold).toBe(DEFAULT_APP_CONFIG.rain_prob_threshold);
  });
});
