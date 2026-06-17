/**
 * data/destinations.json 생성기 — canonical destination 레지스트리
 * (scripts/lib/destination-centroids.ts)를 정적 JSON으로 내보낸다.
 *
 * lib/webapp/telegram-native.ts가 빌드타임에 이 JSON을 직접 import하여
 * 좌표→destination 해석에 사용한다 (런타임 IO 없음, A1/A3 보존).
 *
 * 실행: npx tsx scripts/build-destinations-json.ts
 * (ingest-spots.ts가 매 run마다 이 함수를 호출해 자동 재생성한다.)
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DESTINATION_CENTROIDS } from "./lib/destination-centroids";

export type DestinationJsonEntry = {
  destination_id: string;
  center_lat: number;
  center_lng: number;
  default_radius_km: number;
};

const DESTINATIONS_JSON_PATH = resolve(process.cwd(), "data/destinations.json");

export function buildDestinationsJsonEntries(): DestinationJsonEntry[] {
  return Object.entries(DESTINATION_CENTROIDS)
    .map(([destination_id, c]) => ({
      destination_id,
      center_lat: c.center_lat,
      center_lng: c.center_lng,
      default_radius_km: c.default_radius_km,
    }))
    .sort((a, b) => a.destination_id.localeCompare(b.destination_id, "ko"));
}

export async function writeDestinationsJson(): Promise<string> {
  const entries = buildDestinationsJsonEntries();
  await writeFile(
    DESTINATIONS_JSON_PATH,
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf-8",
  );
  return DESTINATIONS_JSON_PATH;
}

if (require.main === module) {
  writeDestinationsJson().then((path) => {
    console.log(`[build-destinations-json] ${path} 갱신 완료.`);
  });
}
