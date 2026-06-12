/**
 * config 탭 JSON 구문 오류 삽입 시뮬레이션 (Google API 없이)
 *
 * 실행: npx tsx scripts/dry-run-config-validation.ts
 */
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { parseConfigFromSheet } from "./lib/config-sync";

function buildConfigSheetWithErrors(): string[][] {
  return [
    ["key", "value", "scope", "updated_at"],
    ["mood_tags", JSON.stringify(DEFAULT_APP_CONFIG.mood_tags), "global", "2026-06-12"],
    ["mood_tag_effects", JSON.stringify(DEFAULT_APP_CONFIG.mood_tag_effects), "global", "2026-06-12"],
    ["templates", '{"base": {broken', "global", "2026-06-12"],
    ["origin_coords", JSON.stringify(DEFAULT_APP_CONFIG.origin_coords), "global", "2026-06-12"],
    ["rain_prob_threshold", String(DEFAULT_APP_CONFIG.rain_prob_threshold), "global", "2026-06-12"],
    ["", "", "global", "2026-06-12"],
    ["legacy_key", "destination:인천", "destination:인천_근교", "2026-06-12"],
  ];
}

function main() {
  console.log("=== Dry-run: config 탭 JSON 무결성 검증 ===\n");

  const rows = buildConfigSheetWithErrors();
  const result = parseConfigFromSheet(rows);

  console.log("\n=== 결과 ===");
  console.log(`유효(upsert 대상): ${result.rows.length}건`);
  console.log(`스킵(빈 key / non-global scope): ${result.skipped}건`);
  console.log(`무효(JSON 구문 등): ${result.invalid.length}건`);
  console.log(`경고(필수 key 누락 등): ${result.warnings.length}건`);
  console.log("\n유효 config keys:", result.rows.map((r) => r.key).join(", "));
  console.log(
    "\n무효 행:",
    result.invalid.map((e) => `행${e.rowNumber}/${e.key}`).join(", "),
  );

  const expectedValid = 4;
  const expectedInvalid = 1;
  const expectedSkipped = 2;
  const hasTemplatesError = result.invalid.some((e) => e.key === "templates");

  const ok =
    result.rows.length === expectedValid &&
    result.invalid.length === expectedInvalid &&
    result.skipped === expectedSkipped &&
    hasTemplatesError &&
    !result.rows.some((r) => r.key === "templates");

  if (ok) {
    console.log(
      "\n[PASS] JSON 오류 행만 스킵되고 유효 config 행은 upsert 대상으로 유지됩니다.",
    );
    process.exit(0);
  }

  console.error("\n[FAIL] 기대값 불일치");
  process.exit(1);
}

main();
