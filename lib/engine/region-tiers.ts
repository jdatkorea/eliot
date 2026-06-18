/**
 * destination → 권역 tier 조회. data/region-tiers.json(빌드타임 생성,
 * scripts/build-region-tiers.ts)을 정적 import — 런타임 IO 없음.
 *
 * T0.5(2026-06-18): 송도 기준 Haversine 거리로 자동 분류. 손으로 적은
 * allow-list가 아니라 거리값에서 도출된 결과 — 시흥/부천/안산이 행정구역상
 * 인천이 아닌데도 ICN_METRO에 포함된 것은 의도된 결과(거리 우선 원칙).
 */
import destinationsData from "@/data/destinations.json";
import regionTiersData from "@/data/region-tiers.json";

export type RegionTier = "ICN_METRO" | "CAPITAL_EXT" | "EXCLUDED";

const TIER_BY_DESTINATION_ID: ReadonlyMap<string, RegionTier> = new Map(
  (regionTiersData as { destination_id: string; tier: RegionTier }[]).map(
    (entry) => [entry.destination_id, entry.tier],
  ),
);

/**
 * canonicalDestinationId는 호출 측에서 이미 canonicalizeDestination() 등으로
 * 접미사(`_근교` 등)를 정규화한 값이어야 한다. 레지스트리에 없는 destination
 * (예: "부산_송도" 같은 비표준 합성 문자열)은 EXCLUDED로 처리 — 데이터는
 * 보존되지만 allow-list 밖이라는 보수적 기본값.
 */
export function resolveRegionTier(canonicalDestinationId: string): RegionTier {
  return TIER_BY_DESTINATION_ID.get(canonicalDestinationId) ?? "EXCLUDED";
}

type DestinationCentroidEntry = {
  destination_id: string;
  center_lat: number;
  center_lng: number;
};

const CENTROID_BY_DESTINATION_ID: ReadonlyMap<string, DestinationCentroidEntry> =
  new Map(
    (destinationsData as DestinationCentroidEntry[]).map((entry) => [
      entry.destination_id,
      entry,
    ]),
  );

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(
  a: DestinationCentroidEntry,
  b: DestinationCentroidEntry,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.center_lat - a.center_lat);
  const dLng = toRad(b.center_lng - a.center_lng);
  const lat1 = toRad(a.center_lat);
  const lat2 = toRad(b.center_lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 두 canonical destination 간 centroid 거리(km). 둘 중 하나라도 레지스트리에
 * 없으면 null — spillover 거리 정렬에서 그런 후보는 제외한다.
 */
export function resolveCentroidDistanceKm(
  canonicalIdA: string,
  canonicalIdB: string,
): number | null {
  if (canonicalIdA === canonicalIdB) return 0;
  const a = CENTROID_BY_DESTINATION_ID.get(canonicalIdA);
  const b = CENTROID_BY_DESTINATION_ID.get(canonicalIdB);
  if (!a || !b) return null;
  return haversineDistanceKm(a, b);
}
