/**
 * matched_spots.csv → Supabase places 시딩
 *
 * 실행:
 *   SYNC_EXECUTE=true npx tsx scripts/seed-supabase.ts
 *   (SYNC_EXECUTE 없으면 dry-run — DB write 없음)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  createServiceRoleClient,
  upsertPlaces,
} from "./lib/place-sync";
import { parseImportCsv } from "./import-tour-data";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

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

function readCsvRows(filePath: string): string[][] {
  const raw = readFileSync(filePath, "utf8");
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .map(parseCsvLine);
}

async function main() {
  const csvPath = resolve(process.cwd(), "docs/matched_spots.csv");
  console.log(`[seed] CSV 읽기: ${csvPath}`);

  const rows = readCsvRows(csvPath);
  const result = parseImportCsv(rows);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.warn(`[skip] 행 ${err.row} / ${err.id}: ${err.reason}`);
    }
  }

  console.log(
    `[seed] parsed=${result.parsed} skipped=${result.skipped} invalid=${result.invalid} total_rows=${rows.length - 1}`,
  );

  const shouldExecute = process.env.SYNC_EXECUTE === "true";

  if (!shouldExecute) {
    console.log(
      `[dry-run] ${result.parsed}건 upsert 예정. SYNC_EXECUTE=true 로 재실행하면 DB에 반영됩니다.`,
    );
    return;
  }

  if (result.places.length === 0) {
    throw new Error("유효한 places가 0건입니다 — CSV 파싱 오류를 확인하세요.");
  }

  const supabase = createServiceRoleClient();
  const data = await upsertPlaces(supabase, result.places);

  console.log(`Seeded ${data.length} places into Supabase.`);
  for (const row of data) {
    console.log(`  - ${row.name} (${row.id})`);
  }
}

main().catch((error) => {
  console.error("db:seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
