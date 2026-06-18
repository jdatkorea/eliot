/**
 * T2.5(2026-06-18): per-destination x category 실측 커버리지 + T2 spillover가
 * 실제 라이브 데이터 위에서 어떻게 작동하는지 측정.
 *
 * fixture/Joker 우회 없음 — fetchBriefingData()가 fixture로 떨어지면 즉시 실패.
 *
 * 실행: npx tsx scripts/analyze-region-coverage.ts
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import regionTiersData from "@/data/region-tiers.json";
import {
  canonicalizeDestination,
  generateCourse,
  MAX_SPILLOVER_DISTANCE_KM,
} from "@/lib/engine/course-generator";
import { resolveCentroidDistanceKm, resolveRegionTier } from "@/lib/engine/region-tiers";
import type { Place, PlaceCategory } from "@/lib/engine/types";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const CATEGORIES: PlaceCategory[] = ["meal", "cafe", "activity", "view", "kids"];

type TierEntry = { destination_id: string; tier: string; distance_km_from_base: number };

function buildCoverageTable(places: Place[]): Map<string, Record<PlaceCategory, number>> {
  const table = new Map<string, Record<PlaceCategory, number>>();
  for (const place of places) {
    const canon = canonicalizeDestination(place.destination);
    if (!table.has(canon)) {
      table.set(canon, { meal: 0, cafe: 0, activity: 0, view: 0, kids: 0 });
    }
    table.get(canon)![place.category]++;
  }
  return table;
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  const data = await fetchBriefingData();
  if (data.source !== "supabase") {
    throw new Error(
      `[analyze-region-coverage] 실데이터 조회 실패 — source=${data.source} (fixture 폴백). 측정 중단.`,
    );
  }

  const places = data.places;
  console.log(`총 places: ${places.length}행 (source=${data.source})\n`);

  const coverage = buildCoverageTable(places);
  const tiers = regionTiersData as TierEntry[];

  console.log("=== 1. destination x category 실측 커버리지 (ICN_METRO + CAPITAL_EXT) ===");
  console.log(
    padRight("destination", 10) +
      padRight("tier", 12) +
      padRight("dist_km", 9) +
      CATEGORIES.map((c) => padRight(c, 9)).join(""),
  );

  const relevantTiers = tiers
    .filter((t) => t.tier === "ICN_METRO" || t.tier === "CAPITAL_EXT")
    .sort((a, b) => a.distance_km_from_base - b.distance_km_from_base);

  for (const entry of relevantTiers) {
    const counts = coverage.get(entry.destination_id) ?? {
      meal: 0,
      cafe: 0,
      activity: 0,
      view: 0,
      kids: 0,
    };
    console.log(
      padRight(entry.destination_id, 10) +
        padRight(entry.tier, 12) +
        padRight(String(entry.distance_km_from_base), 9) +
        CATEGORIES.map((c) => padRight(String(counts[c]), 9)).join(""),
    );
  }

  console.log("\n=== 2. 실데이터 위에서 ICN_METRO 단독 destination별 half_day(5h) 자급 여부 + 실제 spillover 결과 ===");
  const icnMetroIds = tiers
    .filter((t) => t.tier === "ICN_METRO")
    .sort((a, b) => a.distance_km_from_base - b.distance_km_from_base)
    .map((t) => t.destination_id);

  let maxObservedSpilloverKm = 0;
  let overCapCount = 0;

  for (const destId of icnMetroIds) {
    const hasAnyPlace = coverage.has(destId);
    if (!hasAnyPlace) {
      console.log(`\n[${destId}] places 0건 — 측정 불가(데이터 없음)`);
      continue;
    }

    const variantA = generateCourse({
      places,
      config: data.config,
      destination: destId,
      mode: "family",
      mood_tags: [],
    });
    const variantB = generateCourse({
      places,
      config: data.config,
      destination: destId,
      mode: "family",
      mood_tags: ["extend_range"],
    });

    const destinationsA = [...new Set(variantA.course.map((p) => canonicalizeDestination(p.destination)))];
    const destinationsB = [...new Set(variantB.course.map((p) => canonicalizeDestination(p.destination)))];
    const tiersUsedB = destinationsB.map((d) => resolveRegionTier(d));
    const excludedLeak = tiersUsedB.includes("EXCLUDED");

    console.log(`\n[${destId}]`);
    console.log(
      `  variant A: 자급=${destinationsA.length === 1 ? "YES" : "NO(다중)"} stops=${JSON.stringify(destinationsA)} pool_exhausted=${variantA.pool_exhausted ?? false}`,
    );
    console.log(
      `  variant B: stops=${JSON.stringify(destinationsB)} pool_exhausted=${variantB.pool_exhausted ?? false} EXCLUDED_누출=${excludedLeak}`,
    );
    if (destinationsB.length > 1) {
      const spilloverId = destinationsB.find((d) => d !== destId)!;
      const spilloverTierEntry = tiers.find((t) => t.destination_id === spilloverId);
      const homeToSpilloverKm = resolveCentroidDistanceKm(destId, spilloverId);
      console.log(
        `  -> spillover 발생: ${destId} + ${spilloverId} (tier=${spilloverTierEntry?.tier}, base거리=${spilloverTierEntry?.distance_km_from_base}km, home-spillover 실거리=${homeToSpilloverKm?.toFixed(1)}km)`,
      );
      if (homeToSpilloverKm !== null) {
        maxObservedSpilloverKm = Math.max(maxObservedSpilloverKm, homeToSpilloverKm);
        if (homeToSpilloverKm > MAX_SPILLOVER_DISTANCE_KM) {
          overCapCount++;
          console.warn(
            `  !!! 5h 당일 코스 반경(${MAX_SPILLOVER_DISTANCE_KM}km) 초과 — 0-stop 방지용 2차 확장이 실제로 발동함 !!!`,
          );
        }
      }
    }
    if (excludedLeak) {
      console.error(`  !!! EXCLUDED 누출 감지 — T2 회귀 !!!`);
    }
  }

  console.log(
    `\n=== 3. 5h 당일 코스 거리 상한(MAX_SPILLOVER_DISTANCE_KM=${MAX_SPILLOVER_DISTANCE_KM}km) 검증 ===`,
  );
  console.log(`실측 최대 spillover 거리: ${maxObservedSpilloverKm.toFixed(1)}km`);
  console.log(`상한 초과 건수: ${overCapCount}건`);
  if (overCapCount > 0) {
    console.warn("-> 1차 반경 탐색 실패로 2차(전체 tier) 확장이 발동한 destination 존재 — 데이터 보강 검토 대상.");
  } else {
    console.log("-> 모든 실측 spillover가 5h 당일 코스 반경 안에서 충족됨 (PASS).");
  }

  console.log("\n측정 완료.");
}

main().catch((err: unknown) => {
  console.error("[analyze-region-coverage] 실패:", err);
  process.exit(1);
});
