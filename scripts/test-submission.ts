import { resolve } from "node:path";
import { config } from "dotenv";
import type { TripRequest } from "@/lib/engine/types";
import { getFixtureBriefingData } from "@/lib/fixtures/briefing-data";
import type { BriefingData } from "@/lib/supabase/fetch-briefing-data";
import { relayTripBriefing } from "../lib/journey/relay-briefing";
import { sendTelegramLinks } from "../lib/webhook/send-telegram-links";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

/**
 * 운영자 Telegram chat_id.
 * TELEGRAM_CHAT_ID env가 없을 때 사용 — 봇과 /start 대화 후 @userinfobot 등으로 확인한 값으로 교체.
 */
const CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID ?? "123456789");

const mockSubmission: { chatId: number; data: TripRequest } = {
  chatId: CHAT_ID,
  data: {
    start_mode: "duration",
    duration_hours: 5,
    mood_tags: ["relaxed_pace", "food_hearty"],
    mood_intensity: 3,
    mode: "family",
    origin: "인천 송도",
    return_location: "인천 송도",
  },
};

const fixtureBriefing: BriefingData = {
  ...getFixtureBriefingData(),
  source: "fixture",
};

async function testSubmission(): Promise<void> {
  console.log("=== test-submission: Telegram 송신 하네스 ===");
  console.log("[before] chatId:", mockSubmission.chatId);
  console.log("[before] tripRequest:", JSON.stringify(mockSubmission.data));

  console.log("[before] relayTripBriefing 호출...");
  const result = await relayTripBriefing(mockSubmission.data, fixtureBriefing);
  console.log("[after] relayTripBriefing 결과:", {
    tripId: result.tripId,
    labelA: result.labelA,
    labelB: result.labelB,
    placesCount: result.placesCount,
    dataSource: result.dataSource,
  });

  console.log("[before] sendTelegramLinks 호출 (DB 미사용, API 송신만)...");
  await sendTelegramLinks(mockSubmission.chatId, {
    urlA: result.urlA,
    urlB: result.urlB,
    labelA: result.labelA,
    labelB: result.labelB,
    feedbackUrl: result.feedbackUrl,
  });
  console.log("[after] sendTelegramLinks 완료");
}

testSubmission()
  .then(() => {
    console.log("\n통신 성공");
  })
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
