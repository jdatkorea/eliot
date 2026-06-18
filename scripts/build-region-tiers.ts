/**
 * data/region-tiers.json 생성기 — canonical destination 레지스트리
 * (scripts/lib/destination-centroids.ts)의 송도 기준 Haversine 거리로
 * ICN_METRO/CAPITAL_EXT/EXCLUDED 3단계를 자동 분류한다.
 *
 * Threshold는 거리 분포의 자연 gap에서 도출 (T0.5 실측, 2026-06-18):
 *  - ICN_METRO: <=20.6km (영종도 20.6km까지. 다음 gap이 광명 21.0km~구로
 *    23.6km 사이 2.6km로, 영종도~광명 사이 0.4km gap보다 큼)
 *  - CAPITAL_EXT: 20.6~100km (가평 89.8km까지. 다음 gap이 가평~춘천
 *    109.3km 사이 19.5km로 제주 제외 전체 구간 중 가장 큰 gap)
 *  - EXCLUDED: >100km
 *
 * lib/engine/region-tiers.ts가 빌드타임에 이 JSON을 직접 import하여
 * destination tier 조회에 사용한다 (런타임 IO 없음, 엔진 순수성 보존).
 *
 * 실행: npx tsx scripts/build-region-tiers.ts
 * (ingest-spots.ts가 매 run마다 이 함수를 호출해 자동 재생성한다.)
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DESTINATION_CENTROIDS } from "./lib/destination-centroids";

export type RegionTier = "ICN_METRO" | "CAPITAL_EXT" | "EXCLUDED";

export type RegionTierEntry = {
  destination_id: string;
  tier: RegionTier;
  distance_km_from_base: number;
};

const REGION_TIERS_JSON_PATH = resolve(process.cwd(), "data/region-tiers.json");

/** 권역 분류 기준점 — 송도(인천 연수구) */
export const REGION_TIER_BASE_DESTINATION_ID = "송도";

export const ICN_METRO_THRESHOLD_KM = 20.6;
export const CAPITAL_EXT_THRESHOLD_KM = 100;

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function classifyTier(distanceKm: number): RegionTier {
  if (distanceKm <= ICN_METRO_THRESHOLD_KM) return "ICN_METRO";
  if (distanceKm <= CAPITAL_EXT_THRESHOLD_KM) return "CAPITAL_EXT";
  return "EXCLUDED";
}

export function buildRegionTierEntries(): RegionTierEntry[] {
  const base = DESTINATION_CENTROIDS[REGION_TIER_BASE_DESTINATION_ID];
  if (!base) {
    throw new Error(
      `기준점 "${REGION_TIER_BASE_DESTINATION_ID}"이 DESTINATION_CENTROIDS에 없습니다.`,
    );
  }

  return Object.entries(DESTINATION_CENTROIDS)
    .map(([destination_id, c]) => {
      const distanceKm = haversineDistanceKm(
        { lat: base.center_lat, lng: base.center_lng },
        { lat: c.center_lat, lng: c.center_lng },
      );
      return {
        destination_id,
        tier: classifyTier(distanceKm),
        distance_km_from_base: Math.round(distanceKm * 10) / 10,
      };
    })
    .sort((a, b) => a.distance_km_from_base - b.distance_km_from_base);
}

export async function writeRegionTiersJson(): Promise<string> {
  const entries = buildRegionTierEntries();
  await writeFile(
    REGION_TIERS_JSON_PATH,
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf-8",
  );
  return REGION_TIERS_JSON_PATH;
}

if (require.main === module) {
  writeRegionTiersJson().then((path) => {
    console.log(`[build-region-tiers] ${path} 갱신 완료.`);
  });
}
