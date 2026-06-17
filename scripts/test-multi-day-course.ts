/**
 * 멀티-블록 코스 생성 검증 — 송도/속초 데이터, duration: 2
 *
 * 실행:
 *   npx tsx scripts/test-multi-day-course.ts
 *   npx tsx scripts/test-multi-day-course.ts --destination 속초
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import {
  assertNoCrossDayDuplicates,
  coursePlaceIds,
  generateMultiDayCourse,
} from "@/lib/engine/course-generator";
import type { Place } from "@/lib/engine/types";

const MASTER_CSV = resolve(process.cwd(), "data/master_spots.csv");

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function loadPlacesFromMasterCsv(): Place[] {
  const raw = readFileSync(MASTER_CSV, "utf-8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...dataLines] = lines;
  const headers = parseCsvLine(headerLine!).map((h) => h.trim().toLowerCase());

  const idx = (name: string) => headers.indexOf(name);
  const slugIdx = idx("slug") >= 0 ? idx("slug") : idx("id");

  return dataLines.map((line) => {
    const cols = parseCsvLine(line);
    const tagsRaw = cols[idx("tags")]?.trim() ?? "";
    return {
      id: cols[slugIdx]!.trim(),
      destination: cols[idx("destination")]!.trim(),
      name: cols[idx("name")]!.trim(),
      category: cols[idx("category")]!.trim() as Place["category"],
      is_outdoor: cols[idx("is_outdoor")]!.trim().toLowerCase() === "true",
      no_kids_zone: cols[idx("no_kids_zone")]!.trim().toLowerCase() === "true",
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()) : [],
    };
  });
}

function filterDestination(places: Place[], destination: string): Place[] {
  return places.filter(
    (p) =>
      p.destination === destination ||
      p.destination.includes(destination) ||
      destination.includes(p.destination),
  );
}

function parseDestinationArg(argv: string[]): string[] {
  const eq = argv.find((arg) => arg.startsWith("--destination="));
  if (eq) return [eq.split("=")[1]!];

  const idx = argv.indexOf("--destination");
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith("-")) {
    return [argv[idx + 1]!];
  }

  return ["송도", "속초"];
}

function runForDestination(places: Place[], destination: string): void {
  const scoped = filterDestination(places, destination);
  console.log(`\n========== ${destination} (장소 ${scoped.length}건) ==========`);

  if (scoped.length === 0) {
    console.warn(`  ⚠ ${destination} 장소 없음 — 스킵`);
    return;
  }

  const result = generateMultiDayCourse({
    duration: 2,
    places: scoped,
    config: DEFAULT_APP_CONFIG,
    destination,
    mode: "family",
    mood_tags: [],
    origin: "테스트 출발지",
  });

  const allIds = coursePlaceIds(result.blocks);
  const uniqueIds = new Set(allIds);
  const noCrossDayDup = assertNoCrossDayDuplicates(result.blocks);

  console.log(`duration: 2 (1박 2일)`);
  console.log(`생성 일차: ${result.blocks.length}`);
  console.log(`총 장소: ${allIds.length} (고유 ${uniqueIds.size})`);
  console.log(`일차 간 중복 없음: ${noCrossDayDup ? "✓" : "✗"}`);
  console.log(`pool_exhausted: ${result.pool_exhausted ?? false}`);

  for (const block of result.blocks) {
    console.log(`\n--- ${block.day}일차 (${block.course.length}곳) ---`);
    for (const place of block.course) {
      console.log(`  · ${place.name} [${place.id}] (${place.category})`);
    }
  }

  const day1Ids = new Set(result.blocks[0]?.course.map((p) => p.id) ?? []);
  const day2Ids = result.blocks[1]?.course.map((p) => p.id) ?? [];
  const overlap = day2Ids.filter((id) => day1Ids.has(id));

  if (overlap.length > 0) {
    console.warn(`\n⚠ 1일차·2일차 중복 id: ${overlap.join(", ")}`);
  } else {
    console.log(`\n✓ 1일차·2일차 장소 중복 없음`);
  }
}

function main(): void {
  console.log("멀티-블록 코스 검증 (duration: 2)");
  const places = loadPlacesFromMasterCsv();
  console.log(`master_spots.csv 로드: ${places.length}건`);

  const destinations = parseDestinationArg(process.argv);
  for (const destination of destinations) {
    runForDestination(places, destination);
  }

  console.log("\n✓ 검증 완료");
}

main();
