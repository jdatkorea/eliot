/**
 * Layer A importer — 로컬 CSV → places base 매핑 (SEED 전용, 오프라인)
 *
 * CSV 컬럼 스키마 (헤더 행 필수):
 *   id, destination, name, category, is_outdoor, no_kids_zone, tags
 *
 * 실행:
 *   SYNC_EXECUTE=true npx tsx scripts/import-tour-data.ts data/tour-source/gyeongju-sample.csv
 *   (SYNC_EXECUTE 없으면 dry-run — DB write 없음)
 *
 * 라이브 API 호출 없음. data/tour-source/<region>.csv 만 읽는다.
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { config } from "dotenv";
import type { Place } from "@/lib/engine/types";
import { classifyTags } from "@/lib/config/tag-vocabulary";
import {
  createServiceRoleClient,
  upsertPlaces,
} from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const REQUIRED_COLUMNS = [
  "id",
  "destination",
  "name",
  "category",
  "is_outdoor",
  "no_kids_zone",
] as const;

const VALID_CATEGORIES = new Set(["meal", "cafe", "activity", "view", "kids"]);

export type ImportResult = {
  parsed: number;
  skipped: number;
  invalid: number;
  upserted: number;
  places: Place[];
  errors: { row: number; id: string; reason: string }[];
};

function parseBoolean(val: string | undefined): boolean {
  const v = (val ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "n" || v === "") {
    return false;
  }
  if (v === "true" || v === "1" || v === "yes" || v === "y") {
    return true;
  }
  return false;
}

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

async function readCsvRows(filePath: string): Promise<string[][]> {
  const rows: string[][] = [];
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      rows.push(parseCsvLine(line));
    }
  }
  return rows;
}

export function parseImportCsv(rows: string[][]): ImportResult {
  if (rows.length < 2) {
    return { parsed: 0, skipped: 0, invalid: 0, upserted: 0, places: [], errors: [] };
  }

  const header = rows[0]!.map((h) => h.trim().toLowerCase());

  const col = (row: string[], name: string): string =>
    (row[header.indexOf(name)] ?? "").trim();

  const missingRequired = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingRequired.length > 0) {
    throw new Error(
      `CSV 헤더에 필수 컬럼 없음: ${missingRequired.join(", ")}`,
    );
  }

  const places: Place[] = [];
  const errors: ImportResult["errors"] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;
    const id = col(row, "id");

    if (!id) {
      skipped++;
      continue;
    }

    const name = col(row, "name");
    const destination = col(row, "destination");
    const categoryRaw = col(row, "category");

    if (!name || !destination || !categoryRaw) {
      errors.push({ row: rowNum, id, reason: "필수 필드 누락" });
      continue;
    }

    if (!VALID_CATEGORIES.has(categoryRaw)) {
      errors.push({
        row: rowNum,
        id,
        reason: `category 값 오류: "${categoryRaw}" (meal/cafe/activity/view/kids 중 하나)`,
      });
      continue;
    }

    const rawTagsStr = col(row, "tags");
    const rawTags = rawTagsStr
      ? rawTagsStr.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const { tags, stroller_friendly, has_nursing_room, dropped, unknown } = classifyTags(rawTags);

    if (dropped.length > 0) {
      console.warn(`[row ${rowNum}] ${name}: 운영 태그 제거됨 — ${dropped.join(", ")}`);
    }
    if (unknown.length > 0) {
      console.warn(`[row ${rowNum}] ${name}: 화이트리스트 외 태그 제거됨 — ${unknown.join(", ")}`);
    }

    places.push({
      id,
      destination,
      name,
      category: categoryRaw as Place["category"],
      is_outdoor: parseBoolean(col(row, "is_outdoor")),
      no_kids_zone: parseBoolean(col(row, "no_kids_zone")),
      tags,
      stroller_friendly,
      has_nursing_room,
    });
  }

  return {
    parsed: places.length,
    skipped,
    invalid: errors.length,
    upserted: 0,
    places,
    errors,
  };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("사용법: npx tsx scripts/import-tour-data.ts <csv-path>");
    process.exit(1);
  }

  const rows = await readCsvRows(resolve(csvPath));
  const result = parseImportCsv(rows);

  console.log(
    `파싱 완료: ${result.parsed}건, 스킵 ${result.skipped}, 오류 ${result.invalid}`,
  );

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.warn(`  [row ${err.row}] ${err.id}: ${err.reason}`);
    }
  }

  if (process.env.SYNC_EXECUTE !== "true") {
    console.log("SYNC_EXECUTE=true 가 아니므로 DB write 생략 (dry-run)");
    return;
  }

  const supabase = createServiceRoleClient();
  const upserted = await upsertPlaces(supabase, result.places);
  console.log(`Supabase upsert 완료: ${upserted.length}건`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
