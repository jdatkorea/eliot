/**
 * Zod 검증 + 부분 동기화 dry-run
 * Google API 없이 fixtures 기반 더미 시트 행으로 parsePlacesFromSheet를 검증한다.
 *
 * 실행: npx tsx scripts/dry-run-sync-validation.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Place } from "@/lib/engine/types";
import { PLACE_SHEET_HEADERS } from "@/lib/seed/validate-places";
import { parsePlacesFromSheet } from "./sync-sheets";

type FixturePlace = Place & { status?: string };

function placeToSheetRow(place: FixturePlace): string[] {
  return PLACE_SHEET_HEADERS.map((header) => {
    if (header === "status") {
      return place.status ?? "active";
    }

    const value = place[header as keyof Place];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}

function buildDummySheetRows(): string[][] {
  const fixturePath = resolve(process.cwd(), "fixtures/places.sample.json");
  const places = JSON.parse(readFileSync(fixturePath, "utf-8")) as FixturePlace[];

  const header = [...PLACE_SHEET_HEADERS];
  const validRows = places.slice(0, 5).map(placeToSheetRow);

  const shuffledHeader = [
    "name",
    "category",
    "id",
    "destination",
    "lng",
    "lat",
    "curtail_count",
    "is_outdoor",
    "no_kids_zone",
    "break_time",
    "naver_url",
    "backup_place_id",
    "last_verified",
    "notes",
    "tags",
    "status",
  ];

  const reorderRow = (row: string[]): string[] =>
    shuffledHeader.map((col) => row[header.indexOf(col as (typeof header)[number])]);

  const rows: string[][] = [shuffledHeader];

  for (const row of validRows) {
    rows.push(reorderRow(row));
  }

  // 의도적 오류 행들
  rows.push(
    reorderRow([
      "p_bad_lat",
      "인천_근교",
      "잘못된 위도",
      "cafe",
      "not-a-number",
      "126.6",
      "2",
      "FALSE",
      "0",
      "",
      "https://map.naver.com/bad",
      "",
      "2026-06-01",
      "",
      "",
      "active",
    ]),
  );

  rows.push(
    reorderRow([
      "",
      "인천_근교",
      "id 누락",
      "meal",
      "37.4",
      "126.6",
      "1",
      "true",
      "false",
      "",
      "https://map.naver.com/missing-id",
      "",
      "2026-06-01",
      "",
      "",
      "active",
    ]),
  );

  rows.push(
    reorderRow([
      "p_missing_name",
      "인천_근교",
      "",
      "view",
      "37.4",
      "126.6",
      "1",
      "true",
      "false",
      "",
      "https://map.naver.com/missing-name",
      "",
      "2026-06-01",
      "",
      "",
      "active",
    ]),
  );

  rows.push(
    reorderRow([
      "p_bad_category",
      "인천_근교",
      "잘못된 카테고리",
      "restaurant",
      "37.4",
      "126.6",
      "1",
      "yes",
      "no",
      "",
      "https://map.naver.com/bad-cat",
      "",
      "2026-06-01",
      "",
      "",
      "active",
    ]),
  );

  rows.push(
    reorderRow([
      "p_archived",
      "인천_근교",
      "보관됨 장소",
      "meal",
      "37.4",
      "126.6",
      "1",
      "true",
      "false",
      "",
      "https://map.naver.com/archived",
      "",
      "2026-06-01",
      "",
      "",
      "archived",
    ]),
  );

  return rows;
}

function main() {
  const rows = buildDummySheetRows();
  console.log("=== Dry-run: parsePlacesFromSheet (Zod partial sync) ===\n");
  console.log(`입력: 헤더 1행 + 데이터 ${rows.length - 1}행 (컬럼 순서 셔플됨)\n`);

  const { places, skipped, invalid } = parsePlacesFromSheet(rows);

  console.log("\n=== 결과 ===");
  console.log(`유효(upsert 대상): ${places.length}건`);
  console.log(`스킵(빈 id / archived): ${skipped}건`);
  console.log(`무효(검증 실패): ${invalid.length}건`);
  console.log("\n유효 장소 id:", places.map((p) => p.id).join(", "));

  const expectedValid = 5;
  const expectedSkipped = 2;
  const expectedInvalid = 3;

  const ok =
    places.length === expectedValid &&
    skipped === expectedSkipped &&
    invalid.length === expectedInvalid;

  if (ok) {
    console.log("\n[PASS] 부분 동기화 필터링이 기대값과 일치합니다.");
    process.exit(0);
  }

  console.error("\n[FAIL] 기대값 불일치:");
  console.error(
    `  valid: ${places.length} (expected ${expectedValid}), skipped: ${skipped} (expected ${expectedSkipped}), invalid: ${invalid.length} (expected ${expectedInvalid})`,
  );
  process.exit(1);
}

main();
