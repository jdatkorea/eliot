import {
  fillDescTemplate,
  resolveMoodEffects,
  weatherKeyFromRainProb,
} from "./apply-config";
import type { AppConfig, Briefing, Place } from "./types";

function resolveDot(category: Place["category"]): Briefing["days"][number]["blocks"][number]["dot"] {
  if (category === "meal") return "accent";
  if (category === "kids") return "green";
  return "default";
}

export function applySwapToBriefing(params: {
  briefing: Briefing;
  dayIndex: number;
  blockIndex: number;
  swappedPlace: Place;
  config: AppConfig;
  moodTags: string[];
}): Briefing {
  const { briefing, dayIndex, blockIndex, swappedPlace, config, moodTags } =
    params;
  const day = briefing.days[dayIndex];
  if (!day) {
    throw new Error(`dayIndex ${dayIndex}가 브리핑 범위를 벗어났습니다.`);
  }
  const block = day.blocks[blockIndex];
  if (!block) {
    throw new Error(`blockIndex ${blockIndex}가 일차 범위를 벗어났습니다.`);
  }

  const weatherKey = weatherKeyFromRainProb(config, briefing.weather.rain_prob);
  const relaxedPrefix = resolveMoodEffects(config, moodTags).relaxedLabels
    ? "여유롭게 "
    : "";
  const desc = fillDescTemplate(
    config,
    swappedPlace.category,
    moodTags,
    weatherKey,
    swappedPlace.name,
  );

  const rainNumeric = parseInt(
    briefing.weather.rain_prob.replace(/[^0-9]/g, ""),
    10,
  );

  const nextBlock = {
    ...block,
    place_id: swappedPlace.id,
    title: `${relaxedPrefix}${swappedPlace.name}`,
    desc,
    dot: resolveDot(swappedPlace.category),
    weather_note: undefined as string | undefined,
  };

  if (swappedPlace.is_outdoor === true) {
    if (Number.isFinite(rainNumeric) && rainNumeric >= config.rain_prob_threshold) {
      nextBlock.weather_note = "우천 시 실내 대안 검토";
    } else {
      nextBlock.weather_note = "야외 장소 — 날씨 확인 후 이동";
    }
  }

  const days = briefing.days.map((currentDay, currentDayIndex) => {
    if (currentDayIndex !== dayIndex) return currentDay;
    return {
      ...currentDay,
      blocks: currentDay.blocks.map((currentBlock, currentBlockIndex) =>
        currentBlockIndex === blockIndex ? nextBlock : currentBlock,
      ),
    };
  });

  return { ...briefing, days };
}
