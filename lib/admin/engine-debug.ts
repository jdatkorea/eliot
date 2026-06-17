import {
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from "@/lib/config/app-config";

export const ENGINE_SCORING_WEIGHTS = {
  baseScore: 1,
  categoryMatchBonus: 3,
  coupleCafeViewMultiplier: 1.5,
  indoorBiasPerPoint: 1,
} as const;

export type EngineDebugLog = {
  configSource: "default" | "runtime";
  moodTagEffects: AppConfig["mood_tag_effects"];
  blockCategoryMap: AppConfig["templates"]["block_category_map"];
  rainProbThreshold: number;
  scoringWeights: typeof ENGINE_SCORING_WEIGHTS;
};

export function buildEngineDebugLog(
  config: AppConfig = DEFAULT_APP_CONFIG,
  configSource: EngineDebugLog["configSource"] = "default",
): EngineDebugLog {
  return {
    configSource,
    moodTagEffects: config.mood_tag_effects,
    blockCategoryMap: config.templates.block_category_map,
    rainProbThreshold: config.rain_prob_threshold,
    scoringWeights: ENGINE_SCORING_WEIGHTS,
  };
}
