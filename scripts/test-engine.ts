/**
 * 추천 엔진 런타임 스모크 테스트 — Supabase 시딩 데이터만 사용 (fixture/Joker fallback 금지)
 *
 * 실행:
 *   npx tsx scripts/test-engine.ts
 *   npx tsx scripts/test-engine.ts --scenario rainy-couple
 *   npx tsx scripts/test-engine.ts --destination 경주 --raw-config
 *
 * 사전 확인 (선택):
 *   npx tsx scripts/verify-anon-read.ts
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  safeAppConfigFromDbRows,
  type AppConfig,
} from "@/lib/config/app-config";
import { resolveMoodEffects } from "@/lib/engine/apply-config";
import { generateBriefing } from "@/lib/engine/generate-briefing";
import { HOME_ADDRESS, normalize } from "@/lib/engine/normalize";
import type { Briefing, Place, TripRequest } from "@/lib/engine/types";
import type { BriefingData } from "@/lib/supabase/fetch-briefing-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildBriefingLinks } from "@/lib/webhook/briefing-urls";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const JOKER_PLACE_ID = "joker-songdo-hyundai-outlet";
const JOKER_PLACE_NAME = "송도 현대프리미엄아울렛";

type Scenario = {
  name: string;
  buildTripRequest: (ctx: ScenarioContext) => TripRequest;
  weather?: Briefing["weather"];
};

type ScenarioContext = {
  destination: string;
  origin: string;
};

function parseArgs(argv: string[]): {
  scenarioKey: string;
  destinationFilter?: string;
  rawConfig: boolean;
} {
  const eqScenario = argv.find((arg) => arg.startsWith("--scenario="));
  const scenarioIdx = argv.indexOf("--scenario");
  const eqDest = argv.find((arg) => arg.startsWith("--destination="));
  const destIdx = argv.indexOf("--destination");

  return {
    scenarioKey:
      eqScenario?.split("=")[1] ??
      (scenarioIdx >= 0 &&
      argv[scenarioIdx + 1] &&
      !argv[scenarioIdx + 1].startsWith("-")
        ? argv[scenarioIdx + 1]
        : "rainy-couple"),
    destinationFilter:
      eqDest?.split("=")[1] ??
      (destIdx >= 0 && argv[destIdx + 1] && !argv[destIdx + 1].startsWith("-")
        ? argv[destIdx + 1]
        : undefined),
    rawConfig: argv.includes("--raw-config"),
  };
}

const SCENARIOS: Record<string, Scenario> = {
  "rainy-couple": {
    name: "비 오는 날 실내 커플 데이트",
    buildTripRequest: ({ origin }) => ({
      start_mode: "duration",
      duration_hours: 5,
      mood_tags: ["indoor_only", "relaxed_pace"],
      mode: "couple",
      origin,
    }),
    weather: {
      summary: "비",
      temp: "18°C",
      rain_prob: "80%",
      advice: "실내 위주로 계획하세요.",
    },
  },
  "family-hearty": {
    name: "가족 나들이 (여유 + 든든한 식사)",
    buildTripRequest: ({ origin }) => ({
      start_mode: "duration",
      duration_hours: 5,
      mood_tags: ["relaxed_pace", "food_hearty"],
      mood_intensity: 50,
      mode: "family",
      origin,
      return_location: origin,
    }),
  },
};

function normalizePlaceRow(row: Record<string, unknown>): Place {
  return {
    ...(row as Place),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  };
}

function isDefaultConfig(config: AppConfig, configRowCount: number): boolean {
  return configRowCount === 0 || config === safeAppConfigFromDbRows([]);
}

function originLabelForDestination(destination: string): string {
  if (destination.includes("경주")) return "경주 시내";
  if (destination.includes("인천")) return HOME_ADDRESS;
  return destination.replace(/_/g, " ");
}

function countInHomeRegion(
  places: Place[],
  homeRegion: string,
  moodTags: string[],
): number {
  if (moodTags.includes("extend_range")) return places.length;
  return places.filter((p) => p.destination === homeRegion).length;
}

function pickDestination(
  places: Place[],
  filter?: string,
): { destination: string; places: Place[] } {
  const grouped = new Map<string, Place[]>();
  for (const place of places) {
    const list = grouped.get(place.destination) ?? [];
    list.push(place);
    grouped.set(place.destination, list);
  }

  if (filter) {
    const match = [...grouped.entries()].find(([dest]) => dest.includes(filter));
    if (!match) {
      throw new Error(
        `destination "${filter}"에 해당하는 장소 없음. 사용 가능: ${[...grouped.keys()].join(", ")}`,
      );
    }
    return { destination: match[0], places: match[1] };
  }

  const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  const [destination, subset] = sorted[0];
  return { destination, places: subset };
}

/** fetchBriefingData()와 동일 경로이나 fixture fallback 없이 실패 시 throw */
async function fetchBriefingDataStrict(): Promise<{
  data: BriefingData;
  configRowCount: number;
}> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 .env.local에 없습니다.",
    );
  }

  const [placesResult, metadataResult] = await Promise.all([
    supabase.from("places").select("*"),
    supabase.rpc("get_briefing_metadata"),
  ]);

  if (placesResult.error) {
    throw new Error(`places SELECT 실패: ${placesResult.error.message}`);
  }
  if ((placesResult.data ?? []).length === 0) {
    throw new Error("places 0행 — 시딩 또는 RLS 정책을 확인하세요.");
  }
  if (metadataResult.error) {
    throw new Error(
      `get_briefing_metadata RPC 실패: ${metadataResult.error.message}`,
    );
  }

  const metadata = metadataResult.data as {
    feedback_events?: unknown[];
    app_config?: { key: string; value: unknown }[];
  };
  const configRows = metadata?.app_config ?? [];
  const appConfig = safeAppConfigFromDbRows(configRows);

  return {
    data: {
      places: (placesResult.data ?? []).map((row) =>
        normalizePlaceRow(row as Record<string, unknown>),
      ),
      feedback_events: (metadata?.feedback_events ?? []) as BriefingData["feedback_events"],
      config: appConfig,
      source: "supabase",
    },
    configRowCount: configRows.length,
  };
}

function blockSummary(briefing: Briefing): string[] {
  return briefing.days.flatMap((day) =>
    day.blocks.map(
      (block) =>
        `${block.time_label}: ${block.title} (id=${block.place_id})`,
    ),
  );
}

function briefingUsesJoker(briefing: Briefing): boolean {
  return briefing.days.some((day) =>
    day.blocks.some(
      (block) =>
        block.place_id === JOKER_PLACE_ID ||
        block.title.includes(JOKER_PLACE_NAME),
    ),
  );
}

function assertPlacesFromDb(
  briefing: Briefing,
  dbPlaceIds: Set<string>,
  label: string,
): void {
  for (const line of blockSummary(briefing)) {
    const idMatch = line.match(/id=([^)]+)/);
    const placeId = idMatch?.[1];
    if (!placeId) continue;

    if (placeId === JOKER_PLACE_ID) {
      throw new Error(
        `[${label}] Joker fallback 감지 — DB 풀이 조건을 만족하지 못했습니다.`,
      );
    }
    if (!dbPlaceIds.has(placeId)) {
      throw new Error(
        `[${label}] DB에 없는 place_id: ${placeId} (fixture 데이터 의심)`,
      );
    }
  }
}

function printConfigDiagnosis(
  appConfig: AppConfig,
  configRowCount: number,
  rawConfig: boolean,
): void {
  const usingDefault = isDefaultConfig(appConfig, configRowCount);
  console.log("\n--- Config 진단 ---");
  console.log(`app_config DB 행: ${configRowCount}`);
  console.log(
    `런타임 config: ${usingDefault ? "DEFAULT_APP_CONFIG (fail-over)" : "DB 동기화됨"}`,
  );
  console.log(`rain_prob_threshold: ${appConfig.rain_prob_threshold}`);
}

function printPoolStats(
  places: Place[],
  tripRequest: TripRequest,
  homeRegion: string,
  appConfig: AppConfig,
): void {
  const normalized = normalize(tripRequest);
  const effects = resolveMoodEffects(appConfig, normalized.mood_tags);
  const indoorCount = places.filter((p) => !p.is_outdoor).length;
  const coupleOk = places.filter((p) => !p.no_kids_zone).length;
  const inRegion = countInHomeRegion(
    places,
    homeRegion,
    normalized.mood_tags,
  );
  const indoorInRegion = places.filter(
    (p) =>
      !p.is_outdoor &&
      (normalized.mood_tags.includes("extend_range") ||
        p.destination === homeRegion),
  ).length;

  console.log("\n--- Safe Pool 스냅샷 ---");
  console.log(`대상 destination 장소: ${places.length} (실내 ${indoorCount})`);
  console.log(`couple 허용(no_kids_zone 제외): ${coupleOk}`);
  console.log(`출발지: ${normalized.origin}`);
  console.log(`home_region: ${homeRegion}`);
  console.log(
    `지역 게이트 후보: ${inRegion} / 실내: ${indoorInRegion} (mood: ${normalized.mood_tags.join(", ")})`,
  );
  console.log(
    `교통 힌트: ${normalized.mood_tags.includes("extend_range") ? "원거리" : "근교"}`,
  );
  if (effects.indoorOnly) {
    console.log("indoor_only: 야외 장소 제외");
  }
}

async function runScenario(
  scenario: Scenario,
  ctx: ScenarioContext,
  allPlaces: Place[],
  subsetPlaces: Place[],
  baseData: BriefingData,
  configRowCount: number,
  rawConfig: boolean,
): Promise<void> {
  console.log(`\n========== 시나리오: ${scenario.name} (${ctx.destination}) ==========`);

  const tripRequest = scenario.buildTripRequest(ctx);
  let appConfig = baseData.config;

  printConfigDiagnosis(appConfig, configRowCount, rawConfig);
  printPoolStats(subsetPlaces, tripRequest, ctx.destination, appConfig);

  const data: BriefingData = {
    ...baseData,
    places: allPlaces,
    config: appConfig,
  };

  const dbPlaceIds = new Set(allPlaces.map((p) => p.id));

  const { briefingA, briefingB, labelA, labelB } = buildBriefingLinks(
    tripRequest,
    "http://localhost:3000",
    data,
  );

  const normalized = normalize(tripRequest);
  const rainyBriefing = scenario.weather
    ? generateBriefing({
        normalized,
        places: allPlaces,
        feedback_events: data.feedback_events,
        config: appConfig,
        weather: scenario.weather,
        destination: ctx.destination,
      })
    : null;

  for (const [variant, briefing, variantLabel] of [
    ["A", briefingA, labelA],
    ["B", briefingB, labelB],
  ] as const) {
    console.log(`\n--- Variant ${variant} (${variantLabel}) ---`);
    for (const line of blockSummary(briefing)) {
      console.log(`  ${line}`);
    }
    if (briefingUsesJoker(briefing)) {
      throw new Error(
        `Variant ${variant}에서 Joker fallback — places 풀 또는 destination 게이트를 확인하세요.`,
      );
    }
    assertPlacesFromDb(briefing, dbPlaceIds, `Variant ${variant}`);
    console.log(`  checklist: ${briefing.checklist.join(" · ")}`);
  }

  if (rainyBriefing) {
    console.log("\n--- 날씨 오버라이드 브리핑 (rain_prob 반영) ---");
    for (const line of blockSummary(rainyBriefing)) {
      console.log(`  ${line}`);
    }
    assertPlacesFromDb(rainyBriefing, dbPlaceIds, "rainy override");
    console.log(`  weather: ${JSON.stringify(rainyBriefing.weather)}`);
    console.log(`  checklist: ${rainyBriefing.checklist.join(" · ")}`);

    const outdoorBlocks = rainyBriefing.days.flatMap((d) =>
      d.blocks.filter((b) => b.weather_note || b.weather_backup),
    );
    if (outdoorBlocks.length > 0) {
      console.log(`  weather 백업/주의 블록: ${outdoorBlocks.length}개`);
    }
  }

  console.log(`\n✓ [${scenario.name}] Supabase 기반 추천 정상 (Joker fallback 없음)`);
}

async function main(): Promise<void> {
  const { scenarioKey, destinationFilter, rawConfig } = parseArgs(
    process.argv,
  );
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    console.error(`알 수 없는 시나리오: ${scenarioKey}`);
    console.error(`사용 가능: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }

  console.log("ELIOT 추천 엔진 로컬 테스트 (strict Supabase, no fixture fallback)");

  const { data, configRowCount } = await fetchBriefingDataStrict();
  const { destination, places: subsetPlaces } = pickDestination(
    data.places,
    destinationFilter,
  );
  const origin = originLabelForDestination(destination);

  console.log(`\nDB places: ${data.places.length}건`);
  console.log(`테스트 destination: ${destination} (${subsetPlaces.length}건)`);
  console.log(`trip origin: ${origin}`);

  await runScenario(
    scenario,
    { destination, origin },
    data.places,
    subsetPlaces,
    data,
    configRowCount,
    rawConfig,
  );

  console.log("\n✓ 테스트 완료 — 엔진이 시딩된 DB 데이터를 사용했습니다.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
