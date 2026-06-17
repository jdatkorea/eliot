/**
 * Zod 검증 + 부분 동기화 dry-run
 * Google API 없이 fixtures 기반 더미 시트 행으로 parsePlacesFromSheet를 검증한다.
 *
 * 실행: npx tsx scripts/dry-run-sync-validation.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Place } from "@/lib/engine/types";
import {
  PLACE_SHEET_HEADERS,
  parsePlacesFromSheet,
} from "@/lib/seed/validate-places";

function placeToSheetRow(place: Place): string[] {
  return PLACE_SHEET_HEADERS.map((header) => {
    const value = place[header as keyof Place];
    if (value === null || value === undefined) {
      return "";
    }
    if (Array.isArray(value)) {
      return value.join(",");
    }
    return String(value);
  });
}

function buildDummySheetRows(): string[][] {
  const fixturePath = resolve(process.cwd(), "fixtures/places.sample.json");
  const places = JSON.parse(readFileSync(fixturePath, "utf-8")) as Place[];

  const header = [...PLACE_SHEET_HEADERS];
  const validRows = places.slice(0, 5).map(placeToSheetRow);

  const shuffledHeader = [
    "name",
    "category",
    "id",
    "destination",
    "is_outdoor",
    "no_kids_zone",
    "tags",
  ];

  const reorderRow = (row: string[]): string[] =>
    shuffledHeader.map((col) => row[header.indexOf(col as (typeof header)[number])]);

  const rows: string[][] = [shuffledHeader];

  for (const row of validRows) {
    rows.push(reorderRow(row));
  }

  rows.push(
    reorderRow([
      "",
      "인천_근교",
      "id 누락",
      "meal",
      "true",
      "false",
      "",
    ]),
  );

  rows.push(
    reorderRow([
      "p_missing_name",
      "인천_근교",
      "",
      "view",
      "true",
      "false",
      "",
    ]),
  );

  rows.push(
    reorderRow([
      "p_bad_category",
      "인천_근교",
      "잘못된 카테고리",
      "restaurant",
      "true",
      "false",
      "",
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
  console.log(`스킵(빈 id): ${skipped}건`);
  console.log(`무효(검증 실패): ${invalid.length}건`);
  console.log("\n유효 장소 id:", places.map((p) => p.id).join(", "));

  const expectedValid = 5;
  const expectedSkipped = 1;
  const expectedInvalid = 2;

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
