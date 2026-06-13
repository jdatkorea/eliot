import type { Briefing } from "@/lib/engine/types";
import type { TripRequest } from "@/lib/engine/types";
import { relayTripBriefing } from "@/lib/journey/relay-briefing";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";
import { buildTelegramLinkMessage } from "@/lib/webhook/telegram-message";
import type { BriefingData } from "@/lib/supabase/fetch-briefing-data";
import {
  JOKER_FALLBACK_NAME,
  stubEmptyPlacesBriefingData,
  stubFixtureBriefingData,
} from "./stubs/briefing-data-stub";

const HARNESS_BASE_URL = "http://localhost:3000";

const happyPathTripRequest: TripRequest = {
  start_mode: "duration",
  duration_hours: 5,
  mood_tags: ["relaxed_pace", "food_hearty"],
  mood_intensity: 3,
  mode: "family",
  origin: "인천 송도",
  return_location: "인천 송도",
};

const fallbackTripRequest: TripRequest = {
  start_mode: "duration",
  duration_hours: 5,
  mood_tags: ["indoor_only"],
  mode: "family",
  origin: "인천 송도",
};

function blockTitles(briefing: Briefing): string[] {
  return briefing.days.flatMap((day) => day.blocks.map((block) => block.title));
}

function briefingUsesJoker(briefing: Briefing): boolean {
  return blockTitles(briefing).some((title) => title.includes(JOKER_FALLBACK_NAME));
}

function logTelegramPayload(
  label: string,
  links: {
    urlA: string;
    urlB: string;
    labelA: string;
    labelB: string;
    feedbackUrl: string;
  },
): void {
  const payload = buildTelegramLinkMessage(links);
  console.log(`\n=== ${label} — Telegram sendMessage 본문 ===`);
  console.log(`parse_mode: ${payload.parse_mode}`);
  console.log(payload.text);
}

async function runRelayCase(
  caseName: string,
  tripRequest: TripRequest,
  briefingData: BriefingData,
): Promise<void> {
  console.log(`\n--- [${caseName}] relayTripBriefing 시작 ---`);
  console.log("TripRequest:", JSON.stringify(tripRequest, null, 2));
  console.log(
    `BriefingData: places=${briefingData.places.length}, source=${briefingData.source}`,
  );

  const result = await relayTripBriefing(tripRequest, briefingData);

  console.log(
    `[engine] places=${result.placesCount}, dataSource=${result.dataSource}, tripId=${result.tripId}`,
  );

  logTelegramPayload(caseName, {
    urlA: result.urlA,
    urlB: result.urlB,
    labelA: result.labelA,
    labelB: result.labelB,
    feedbackUrl: result.feedbackUrl,
  });

  console.log(`\n[${caseName}] Variant A (${result.labelA}):`);
  console.log(result.urlA);
  console.log(`[${caseName}] Variant B (${result.labelB}):`);
  console.log(result.urlB);
  console.log(`[${caseName}] Feedback URL:`);
  console.log(result.feedbackUrl);
}

async function runJokerFallbackCase(): Promise<void> {
  const caseName = "Joker Fallback (빈 Safe Pool)";
  const briefingData = stubEmptyPlacesBriefingData();

  await runRelayCase(caseName, fallbackTripRequest, briefingData);

  const { briefingA, briefingB } = buildBriefingLinks(
    fallbackTripRequest,
    HARNESS_BASE_URL,
    briefingData,
  );

  const jokerInA = briefingUsesJoker(briefingA);
  const jokerInB = briefingUsesJoker(briefingB);

  console.log(`\n[fallback] A 브리핑 Joker 사용: ${jokerInA}`);
  console.log(`[fallback] B 브리핑 Joker 사용: ${jokerInB}`);
  console.log(`[fallback] A 블록 타이틀: ${blockTitles(briefingA).join(" | ")}`);
  console.log(`[fallback] B 블록 타이틀: ${blockTitles(briefingB).join(" | ")}`);

  if (!jokerInA || !jokerInB) {
    throw new Error(
      `[fallback] Joker(${JOKER_FALLBACK_NAME})가 A/B 브리핑에 반영되지 않았습니다 — 무음 실패 가능성`,
    );
  }

  console.log(
    `\n✓ [fallback] 조건 불일치 시 "${JOKER_FALLBACK_NAME}" fallback 정상 트리거`,
  );
}

async function main(): Promise<void> {
  console.log("ELIOT relayTripBriefing 테스트 하네스");
  console.log("외부 I/O: Supabase/Telegram 호출 없음 (briefingData 주입 + 메시지 로그만)");

  await runRelayCase(
    "Happy Path (fixture Safe Pool)",
    happyPathTripRequest,
    stubFixtureBriefingData(),
  );

  await runJokerFallbackCase();

  console.log("\n✓ 하네스 정상 종료");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
